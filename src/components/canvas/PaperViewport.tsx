import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon } from "lucide-react";
import { clamp, fitScale, PX_PER_MM } from "../../lib/paper";
import { pageSizeMm, pageTemplate } from "../../lib/pageUtils";
import { addImageStamp } from "../../lib/images";
import { readImageFile } from "../../lib/raster";
import { useSearchStore } from "../../lib/pdfSearch";
import { usePrefsStore } from "../../lib/prefs";
import { useDocStore } from "../../stores/useDocStore";
import { useToolStore } from "../../stores/useToolStore";
import { useUIStore, type GridStyle } from "../../stores/useUIStore";
import type { DocumentPage, DocumentTab, ToolId } from "../../lib/types";
import { AnnotationLayer } from "./AnnotationLayer";
import { CropOverlay } from "./CropOverlay";
import { PaperSheet } from "./PaperSheet";
import { PdfBackground } from "./PdfBackground";

function buildRows(count: number, twoPage: boolean, cover: boolean): number[][] {
  if (!twoPage) return Array.from({ length: count }, (_, index) => [index]);
  const rows: number[][] = [];
  let start = 0;
  if (cover && count > 0) {
    rows.push([0]);
    start = 1;
  }
  for (let index = start; index < count; index += 2) {
    rows.push(index + 1 < count ? [index, index + 1] : [index]);
  }
  return rows;
}

/** Non-printing screen grid drawn over any page; never exported or printed. */
function GridOverlay({
  styleName,
  widthMm,
  heightMm,
  prefix,
}: {
  styleName: GridStyle;
  widthMm: number;
  heightMm: number;
  prefix: string;
}) {
  if (styleName === "none") return null;
  const id = `grid-${prefix.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const minorId = `${id}-minor`;
  const step = styleName === "squared-10" ? 10 : styleName === "ruled-8" ? 8 : styleName === "millimeter" ? 1 : 5;
  const dots = styleName === "dots-5";
  const ruled = styleName === "ruled-8";
  const path = ruled ? `M 0 ${step} H ${step}` : `M ${step} 0 V ${step} H 0`;
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-grid={styleName}
    >
      <defs>
        <pattern id={dots ? id : minorId} width={step} height={step} patternUnits="userSpaceOnUse">
          {dots ? (
            <circle cx={0.5} cy={0.5} r={0.24} fill="var(--grid-ink)" opacity={0.34} />
          ) : (
            <path d={path} fill="none" stroke="var(--grid-ink)" strokeOpacity={0.22} strokeWidth={0.12} />
          )}
        </pattern>
        {styleName === "millimeter" && (
          <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse">
            <path d="M 10 0 V 10 H 0" fill="none" stroke="var(--grid-ink)" strokeOpacity={0.38} strokeWidth={0.2} />
          </pattern>
        )}
      </defs>
      <rect width={widthMm} height={heightMm} fill={`url(#${dots ? id : minorId})`} />
      {styleName === "millimeter" && <rect width={widthMm} height={heightMm} fill={`url(#${id})`} />}
    </svg>
  );
}

/** Amber hit boxes for the current search, in page millimetres. */
function SearchHighlights({ pageIndex, widthMm, heightMm }: { pageIndex: number; widthMm: number; heightMm: number }) {
  const matches = useSearchStore((state) => state.matches);
  const current = useSearchStore((state) => state.current);
  const hits = matches.map((match, index) => ({ match, index })).filter(({ match }) => match.pageIndex === pageIndex);
  if (hits.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[2]" aria-hidden="true">
      {hits.map(({ match, index }) => (
        <span
          key={index}
          className="absolute rounded-[2px]"
          style={{
            left: `${(match.xMm / widthMm) * 100}%`,
            top: `${(match.yMm / heightMm) * 100}%`,
            width: `${(match.widthMm / widthMm) * 100}%`,
            height: `${(match.heightMm / heightMm) * 100}%`,
            background: index === current ? "rgba(255, 196, 0, 0.5)" : "rgba(255, 214, 10, 0.24)",
            boxShadow: index === current ? "0 0 0 2px #ffb300" : undefined,
            mixBlendMode: "multiply",
          }}
        />
      ))}
    </div>
  );
}

interface PageViewProps {
  tab: DocumentTab;
  page: DocumentPage;
  index: number;
  scale: number;
  observe: boolean;
  panMode: boolean;
  auxLines: boolean;
  gridStyle: GridStyle;
  activeTool: ToolId;
  activePageIndex: number;
  touchScroll: boolean;
  register: (node: HTMLDivElement | null) => void;
  onActivate: (index: number) => void;
}

function PageView({
  tab,
  page,
  index,
  scale,
  observe,
  panMode,
  auxLines,
  gridStyle,
  activeTool,
  activePageIndex,
  touchScroll,
  register,
  onActivate,
}: PageViewProps) {
  const size = pageSizeMm(tab, page);
  const template = pageTemplate(page);
  const rotated = page.rotation === 90 || page.rotation === 270;
  const baseW = size.widthMm * PX_PER_MM;
  const baseH = size.heightMm * PX_PER_MM;
  const displayW = (rotated ? size.heightMm : size.widthMm) * PX_PER_MM * scale;
  const displayH = (rotated ? size.widthMm : size.heightMm) * PX_PER_MM * scale;
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!observe);

  // Hundreds of pages must not each mount an interactive ink layer.
  useEffect(() => {
    if (!observe) {
      setVisible(true);
      return;
    }
    const node = nodeRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "1200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [observe]);

  const crop = page.cropBox;
  const clipPath = crop
    ? `inset(${crop.yMm * PX_PER_MM}px ${(size.widthMm - crop.xMm - crop.widthMm) * PX_PER_MM}px ${(size.heightMm - crop.yMm - crop.heightMm) * PX_PER_MM}px ${crop.xMm * PX_PER_MM}px)`
    : undefined;

  return (
    <div
      ref={(node) => {
        nodeRef.current = node;
        register(node);
      }}
      data-page-index={index}
      className="relative shrink-0"
      style={{ width: displayW, height: displayH }}
      onPointerDownCapture={(event) => {
        if (event.button === 0) onActivate(index);
      }}
    >
      <div
        className="page-paper absolute"
        style={{
          width: baseW,
          height: baseH,
          left: (displayW - baseW * scale) / 2,
          top: (displayH - baseH * scale) / 2,
          transform: `scale(${scale})${page.rotation ? ` rotate(${page.rotation}deg)` : ""}`,
          transformOrigin: "center",
          touchAction: touchScroll ? "auto" : undefined,
        }}
      >
        <div className="relative h-full w-full" style={{ clipPath, overflow: "hidden" }}>
          {page.pdf ? (
            <div className="paper-shadow relative h-full w-full overflow-hidden" style={{ background: "var(--paper)" }}>
              <PdfBackground page={page.pdf} widthMm={size.widthMm} heightMm={size.heightMm} zoom={scale} />
            </div>
          ) : (
            <PaperSheet template={template} landscape={tab.landscape} aux={auxLines} />
          )}
          <GridOverlay styleName={gridStyle} widthMm={size.widthMm} heightMm={size.heightMm} prefix={`${tab.id}-${page.id}`} />
          <SearchHighlights pageIndex={index} widthMm={size.widthMm} heightMm={size.heightMm} />
          {visible && (
            <AnnotationLayer
              tab={tab}
              page={page}
              widthMm={size.widthMm}
              heightMm={size.heightMm}
              zoom={scale}
              panMode={panMode}
              touchScroll={touchScroll}
            />
          )}
        </div>
        {activeTool === "crop" && activePageIndex === index && (
          <CropOverlay
            key={`${tab.id}:${page.id}:${page.cropBox ? `${page.cropBox.xMm},${page.cropBox.yMm},${page.cropBox.widthMm},${page.cropBox.heightMm}` : "full"}`}
            widthMm={size.widthMm}
            heightMm={size.heightMm}
            cropBox={page.cropBox}
            zoom={scale}
            onApply={(box) => {
              const doc = useDocStore.getState();
              doc.pushHistory(tab.id);
              doc.updatePage(tab.id, index, { cropBox: box ?? undefined });
              useToolStore.getState().setTool("select");
            }}
            onCancel={() => useToolStore.getState().setTool("select")}
          />
        )}
      </div>
    </div>
  );
}

export function PaperViewport() {
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const zoom = useDocStore((state) => state.zoom);
  const fitMode = useDocStore((state) => state.fitMode);
  const pageIndex = useDocStore((state) => state.page);
  const activeTool = useToolStore((state) => state.activeTool);
  const measureMode = useUIStore((state) => state.measureMode);
  const auxLines = useUIStore((state) => state.auxLines);
  const viewMode = useUIStore((state) => state.viewMode);
  const separateCoverPage = useUIStore((state) => state.separateCoverPage);
  const gridStyle = useUIStore((state) => state.gridStyle);
  const lastError = useDocStore((state) => state.lastError);
  const touchDrawEnabled = usePrefsStore((state) => state.touchDrawEnabled);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const pageNumber = clamp(pageIndex, 1, tab.pages.length);
  const page = tab.pages[pageNumber - 1] ?? tab.pages[0];
  const size = pageSizeMm(tab, page);
  const rotated = page.rotation === 90 || page.rotation === 270;
  const fitSize = rotated ? { widthMm: size.heightMm, heightMm: size.widthMm } : size;
  const continuous = viewMode === "one-continuous" || viewMode === "two-continuous";
  const twoPage = viewMode === "two-page" || viewMode === "two-continuous";

  const rows = useMemo(() => buildRows(tab.pages.length, twoPage, separateCoverPage), [tab.pages.length, twoPage, separateCoverPage]);
  const displayRows = useMemo(() => {
    if (continuous) return rows;
    const activeRow = rows.find((row) => row.includes(pageNumber - 1));
    return [activeRow ?? [pageNumber - 1]];
  }, [continuous, rows, pageNumber]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; scroll: boolean } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const [spaceDown, setSpaceDown] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  // Two-finger pinch pans and zooms around the midpoint; one finger cancels any draft.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; zoom: number; center: { x: number; y: number }; pan: { x: number; y: number } } | null = null;
    const midpoint = (): { x: number; y: number } => {
      const rect = element.getBoundingClientRect();
      const points = [...pointers.values()];
      const x = (points[0].x + points[1].x) / 2 - rect.left - rect.width / 2;
      const y = (points[0].y + points[1].y) / 2 - rect.top - rect.height / 2;
      return { x, y };
    };
    const onDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size !== 2) return;
      window.dispatchEvent(new Event("pm:cancel-draft"));
      window.dispatchEvent(new Event("pm:pinch-start"));
      drag.current = null;
      const points = [...pointers.values()];
      pinch = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1,
        zoom: useDocStore.getState().zoom,
        center: midpoint(),
        pan: { ...panRef.current },
      };
    };
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinch || pointers.size < 2) return;
      event.preventDefault();
      const points = [...pointers.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
      const zoom = clamp(pinch.zoom * (distance / pinch.distance), 0.1, 6);
      const ratio = zoom / pinch.zoom;
      const center = midpoint();
      setPan({
        x: center.x - (pinch.center.x - pinch.pan.x) * ratio,
        y: center.y - (pinch.center.y - pinch.pan.y) * ratio,
      });
      useDocStore.setState({ zoom, fitMode: null });
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size >= 2) return;
      if (pinch) window.dispatchEvent(new Event("pm:pinch-end"));
      pinch = null;
    };
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove, { passive: false });
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    return () => {
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Fit to the viewport whenever that fit was requested, or the page/rotation changes.
  useLayoutEffect(() => {
    if (!fitMode) return;
    const element = viewportRef.current;
    if (!element) return;
    const apply = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const target = twoPage
        ? { widthMm: fitSize.widthMm * 2 + 12, heightMm: fitSize.heightMm }
        : fitSize;
      useDocStore.setState({ zoom: fitScale(rect.width, rect.height, target, fitMode, 120) });
      setPan({ x: 0, y: 0 });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitMode, fitSize.widthMm, fitSize.heightMm, twoPage, viewMode]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [viewMode]);

  // Ctrl/⌘ + wheel zooms about the cursor; a bare wheel scrolls the document.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (continuous && !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        const cursorX = event.clientX - rect.left - rect.width / 2;
        const cursorY = event.clientY - rect.top - rect.height / 2;
        const next = clamp(zoom * Math.exp(-event.deltaY * 0.0016), 0.1, 6);
        const ratio = next / zoom;
        setPan((current) => ({
          x: cursorX - (cursorX - current.x) * ratio,
          y: cursorY - (cursorY - current.y) * ratio,
        }));
        useDocStore.setState({ zoom: next, fitMode: null });
      } else {
        setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoom, continuous]);

  // Hold space to pan with any tool active.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTyping(event.target)) {
        event.preventDefault();
        setSpaceDown(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // A search hit scrolls its page into the middle of a continuous view.
  useEffect(() => {
    const onFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ pageIndex?: number }>).detail;
      if (!detail || typeof detail.pageIndex !== "number") return;
      if (!continuous) return;
      pageRefs.current.get(detail.pageIndex)?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    window.addEventListener("pm:search-focus", onFocus);
    return () => window.removeEventListener("pm:search-focus", onFocus);
  }, [continuous]);

  const canPan = activeTool === "hand" || spaceDown;
  const cursor = drag.current ? "grabbing" : canPan ? "grab" : "default";

  const scrollToCenterPage = () => {
    const element = scrollRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    let best = useDocStore.getState().page;
    let distance = Number.POSITIVE_INFINITY;
    for (const [index, node] of pageRefs.current) {
      const box = node.getBoundingClientRect();
      const delta = Math.abs((box.top + box.bottom) / 2 - center);
      if (delta < distance) {
        distance = delta;
        best = index + 1;
      }
    }
    if (best !== useDocStore.getState().page) useDocStore.getState().setPage(best);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (continuous) {
      if (!canPan && event.button !== 1) return;
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        panX: scrollRef.current?.scrollLeft ?? 0,
        panY: scrollRef.current?.scrollTop ?? 0,
        scroll: true,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const touchPan = event.pointerType === "touch" && !touchDrawEnabled;
    if (!canPan && event.button !== 1 && !touchPan) return;
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, scroll: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    if (current.scroll) {
      const element = scrollRef.current;
      if (!element) return;
      element.scrollLeft = current.panX - (event.clientX - current.x);
      element.scrollTop = current.panY - (event.clientY - current.y);
      return;
    }
    setPan({ x: current.panX + event.clientX - current.x, y: current.panY + event.clientY - current.y });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const activate = (index: number) => {
    if (useDocStore.getState().page !== index + 1) useDocStore.getState().setPage(index + 1);
  };

  const pageNodes = (row: number[], observe: boolean) =>
    row.map((index) => (
      <PageView
        key={tab.pages[index]?.id ?? index}
        tab={tab}
        page={tab.pages[index]}
        index={index}
        scale={zoom}
        observe={observe}
        panMode={canPan}
        auxLines={auxLines}
        gridStyle={gridStyle}
        activeTool={activeTool}
        activePageIndex={pageNumber - 1}
        touchScroll={touchDrawEnabled ? false : true}
        register={(node) => {
          if (node) pageRefs.current.set(index, node);
          else pageRefs.current.delete(index);
        }}
        onActivate={activate}
      />
    ));

  return (
    <div
      ref={viewportRef}
      className="viewport relative h-full w-full overflow-hidden"
      style={{ cursor, touchAction: continuous && !touchDrawEnabled ? "pan-x pan-y" : "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => useDocStore.getState().setFit("page")}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const file = event.dataTransfer.files[0];
        if (!file) return;
        if (file.type.startsWith("image/")) {
          void readImageFile(file)
            .then((image) => addImageStamp(image))
            .catch(() => undefined);
          return;
        }
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
          void useDocStore.getState().openPdfFile(file);
        }
      }}
    >
      {continuous ? (
        <div
          ref={scrollRef}
          className="doc-scroll absolute inset-0 overflow-auto"
          onScroll={scrollToCenterPage}
        >
          <div className="flex min-h-full flex-col items-center gap-5 px-12 py-8" style={{ width: "max-content", minWidth: "100%" }}>
            {displayRows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex items-start justify-center gap-5">
                {pageNodes(row, true)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="page-stage absolute left-1/2 top-1/2 will-change-transform"
          style={{ transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)` }}
        >
          <div className="flex items-start justify-center gap-5">{pageNodes(displayRows[0], false)}</div>
        </div>
      )}

      {dropActive && (
        <div className="pointer-events-none absolute inset-4 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]">
          <div className="glass-strong flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-medium">
            <FileText size={16} /> Drop a PDF to open a tab, or an image to place it <ImageIcon size={16} />
          </div>
        </div>
      )}

      {lastError && (
        <div className="glass pointer-events-auto absolute left-1/2 top-14 z-30 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-2 text-[11.5px]">
          <span style={{ color: "var(--danger)" }}>{lastError}</span>
          <button type="button" className="chip h-6" onClick={() => useDocStore.setState({ lastError: null })}>
            Dismiss
          </button>
        </div>
      )}

      {(activeTool === "measure" || activeTool === "snapshot") && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 max-w-[80%] -translate-x-1/2">
          <div className="glass rounded-full px-3 py-1.5 text-[11px] font-medium text-muted">
            {activeTool === "snapshot"
              ? "Drag a region to copy, download, or save it as a stamp."
              : measureMode === "angle"
                ? "Click the vertex, then one point on each arm."
                : measureMode === "distance"
                  ? "Drag a line, then Enter or Commit."
                  : "Click each corner; Enter closes the shape."}
          </div>
        </div>
      )}

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border), transparent)" }}
      />
    </div>
  );
}
