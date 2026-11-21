import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon } from "lucide-react";
import { clamp, clampPan, getWorkspaceInsets, PX_PER_MM, workspaceSafeArea, type PanOffset } from "../../lib/paper";
import { CANVAS_TOUCH_ACTION, pansFromBackground } from "../../lib/canvasInput";
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

const ROW_GAP_PX = 20;

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
      data-page-number={index + 1}
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
          left: (displayW - baseW) / 2,
          top: (displayH - baseH) / 2,
          transform: `scale(${scale})${page.rotation ? ` rotate(${page.rotation}deg)` : ""}`,
          transformOrigin: "center",
          touchAction: CANVAS_TOUCH_ACTION,
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
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const favoritesOpen = useUIStore((state) => state.favoritesOpen);
  const toolPopoverOpen = useUIStore((state) => state.toolPopoverOpen);
  const toolPopoverPinned = useUIStore((state) => state.toolPopoverPinned);
  const presentation = useUIStore((state) => state.presentation);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const pageNumber = clamp(pageIndex, 1, tab.pages.length);
  const continuous = viewMode === "one-continuous" || viewMode === "two-continuous";
  const twoPage = viewMode === "two-page" || viewMode === "two-continuous";
  // Floating controls cover part of the canvas; fitting must centre in the rest.
  const { leftInset, rightInset } = presentation
    ? { leftInset: 0, rightInset: 0 }
    : getWorkspaceInsets({
        sidebarOpen,
        favoritesOpen,
        inspectorOpen: toolPopoverOpen,
        inspectorPinned: toolPopoverPinned,
      });

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
  const programmaticScrollUntil = useRef(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  // A second finger takes over from the one-finger pan; its pointerdown must not start one.
  const pinching = useRef(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  /** Rendered size of one row at `scale`; rows of mixed page sizes differ. */
  const rowMetrics = (row: number[], scale: number) => {
    let width = 0;
    let height = 0;
    row.forEach((index, position) => {
      const item = tab.pages[index];
      if (!item) return;
      const itemSize = pageSizeMm(tab, item);
      const turned = item.rotation === 90 || item.rotation === 270;
      width += (turned ? itemSize.heightMm : itemSize.widthMm) * PX_PER_MM * scale;
      height = Math.max(height, (turned ? itemSize.widthMm : itemSize.heightMm) * PX_PER_MM * scale);
      if (position > 0) width += ROW_GAP_PX;
    });
    return { width, height };
  };
  const activeRow = () => rows.find((row) => row.includes(pageNumber - 1)) ?? [pageNumber - 1];
  // One-page and two-page panning must never lose the page in the empty workspace.
  const clampViewportPan = (next: PanOffset): PanOffset => {
    if (continuous) return next;
    const element = viewportRef.current;
    if (!element) return next;
    const rect = element.getBoundingClientRect();
    const metrics = rowMetrics(displayRows[0] ?? [pageNumber - 1], useDocStore.getState().zoom);
    return clampPan(next, metrics.width, metrics.height, rect.width, rect.height, leftInset, rightInset);
  };
  const clampPanRef = useRef(clampViewportPan);
  clampPanRef.current = clampViewportPan;

  // Two-finger touchscreen pinch pans and zooms around the midpoint; strictly ignores mouse/pen.
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

    const endPinch = () => {
      if (pinch) window.dispatchEvent(new Event("pm:pinch-end"));
      pinch = null;
      pinching.current = false;
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size !== 2) return;
      window.dispatchEvent(new Event("pm:cancel-draft"));
      window.dispatchEvent(new Event("pm:pinch-start"));
      drag.current = null;
      pinching.current = true;
      const points = [...pointers.values()];
      pinch = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1,
        zoom: useDocStore.getState().zoom,
        center: midpoint(),
        pan: { ...panRef.current },
      };
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinch || pointers.size < 2) return;
      event.preventDefault();
      const points = [...pointers.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
      const nextZoom = clamp(pinch.zoom * (distance / pinch.distance), 0.1, 6);
      const ratio = nextZoom / pinch.zoom;
      const center = midpoint();
      setPan(
        clampPanRef.current({
          x: center.x - (pinch.center.x - pinch.pan.x) * ratio,
          y: center.y - (pinch.center.y - pinch.pan.y) * ratio,
        }),
      );
      useDocStore.setState({ zoom: nextZoom, fitMode: null });
    };

    const onUp = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      if (pointers.size < 2) endPinch();
    };

    const onBlur = () => {
      pointers.clear();
      endPinch();
    };

    element.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      element.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Fit to the safe workspace between the floating side rails whenever that fit
  // was requested, or the page/rotation/sidebars change.
  useLayoutEffect(() => {
    if (!fitMode) return;
    const element = viewportRef.current;
    if (!element) return;
    const apply = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // The active page's own row decides the fit: a wider page elsewhere in the
      // document must not shrink this one.
      const metrics = rowMetrics(activeRow(), 1);
      const { safeWidth } = workspaceSafeArea(rect.width, leftInset, rightInset);
      // 12px of breathing room on each side of the safe strip.
      const byWidth = (safeWidth - 24) / Math.max(1, metrics.width);
      const byHeight = (rect.height - 16) / Math.max(1, metrics.height);
      const nextZoom = clamp(fitMode === "width" ? byWidth : Math.min(byWidth, byHeight), 0.1, 6);
      useDocStore.setState({ zoom: nextZoom });
      setPan({ x: 0, y: 0 });
      if (continuous) {
        const active = useDocStore.getState().page;
        requestAnimationFrame(() => {
          const node = pageRefs.current.get(active - 1);
          node?.scrollIntoView({ block: "start", inline: "nearest" });
          // Centre the fitted row in the safe strip; a stale offset would leave it under a rail.
          if (scrollRef.current) {
            scrollRef.current.scrollLeft = Math.max(0, (metrics.width * nextZoom - safeWidth) / 2);
          }
        });
      }
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitMode, twoPage, viewMode, leftInset, rightInset, continuous, rows, pageNumber]);

  // Keep the active row centred horizontally when view layout or side rails change.
  useLayoutEffect(() => {
    if (!continuous) return;
    const element = scrollRef.current;
    if (!element) return;
    const metrics = rowMetrics(activeRow(), useDocStore.getState().zoom);
    const { safeWidth } = workspaceSafeArea(element.clientWidth, leftInset, rightInset);
    element.scrollLeft = Math.max(0, (metrics.width - safeWidth) / 2);
  }, [continuous, leftInset, rightInset, rows, tab.id]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [viewMode]);

  // Zooming out shrinks the legal pan range; pull a stale offset back in.
  useLayoutEffect(() => {
    if (continuous) return;
    setPan((current) => {
      const next = clampPanRef.current(current);
      return next.x === current.x && next.y === current.y ? current : next;
    });
  }, [zoom, viewMode, leftInset, rightInset, continuous]);

  // Touchpad two-finger pinch and Ctrl/⌘ + wheel zoom about the cursor; bare wheel scrolls.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    let physicalCtrl = false;
    let pendingScroll: {
      baseZoom: number;
      baseLeft: number;
      baseTop: number;
      relX: number;
      relY: number;
      raf: number;
    } | null = null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") physicalCtrl = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") physicalCtrl = false;
    };
    const onBlur = () => {
      physicalCtrl = false;
    };

    const applyZoomAt = (nextZoom: number, clientX: number, clientY: number) => {
      const prevZoom = useDocStore.getState().zoom;
      const clamped = clamp(nextZoom, 0.1, 6);
      if (Math.abs(clamped - prevZoom) < 0.0001) return;

      if (continuous && scrollRef.current) {
        const scroller = scrollRef.current;
        const rect = scroller.getBoundingClientRect();
        const relX = clientX - rect.left;
        const relY = clientY - rect.top;
        if (!pendingScroll) {
          pendingScroll = {
            baseZoom: prevZoom,
            baseLeft: scroller.scrollLeft,
            baseTop: scroller.scrollTop,
            relX,
            relY,
            raf: requestAnimationFrame(() => {
              const snap = pendingScroll;
              pendingScroll = null;
              if (!snap || !scrollRef.current) return;
              const finalZoom = useDocStore.getState().zoom;
              const totalRatio = finalZoom / snap.baseZoom;
              scrollRef.current.scrollLeft = Math.max(0, (snap.baseLeft + snap.relX) * totalRatio - snap.relX);
              scrollRef.current.scrollTop = Math.max(0, (snap.baseTop + snap.relY) * totalRatio - snap.relY);
            }),
          };
        } else {
          pendingScroll.relX = relX;
          pendingScroll.relY = relY;
        }
        useDocStore.setState({ zoom: clamped, fitMode: null });
      } else {
        const ratio = clamped / prevZoom;
        const rect = element.getBoundingClientRect();
        const cursorX = clientX - rect.left - rect.width / 2;
        const cursorY = clientY - rect.top - rect.height / 2;
        setPan((current) =>
          clampPanRef.current({
            x: cursorX - (cursorX - current.x) * ratio,
            y: cursorY - (cursorY - current.y) * ratio,
          }),
        );
        useDocStore.setState({ zoom: clamped, fitMode: null });
      }
    };

    const onWheel = (event: WheelEvent) => {
      const isZoomGesture = event.ctrlKey || event.metaKey;
      if (continuous && !isZoomGesture) return;
      event.preventDefault();

      if (isZoomGesture) {
        let dy = event.deltaY;
        if (event.deltaMode === 1) dy *= 16;
        else if (event.deltaMode === 2) dy *= 100;

        // Touchpad pinch in Chromium/WebView2 emits ctrlKey=true with small/fractional deltas.
        const isTrackpadPinch =
          event.ctrlKey && (!physicalCtrl || !Number.isInteger(dy) || Math.abs(dy) < 40);
        const sensitivity = isTrackpadPinch ? 0.01 : 0.002;
        const currentZoom = useDocStore.getState().zoom;
        applyZoomAt(currentZoom * Math.exp(-dy * sensitivity), event.clientX, event.clientY);
      } else {
        setPan((current) => clampPanRef.current({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };

    // Safari / WebKit trackpad pinch fallback
    let gestureStartZoom = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureStartZoom = useDocStore.getState().zoom;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const ge = event as Event & { scale?: number; clientX?: number; clientY?: number };
      if (typeof ge.scale !== "number") return;
      const rect = element.getBoundingClientRect();
      applyZoomAt(
        gestureStartZoom * ge.scale,
        ge.clientX ?? rect.left + rect.width / 2,
        ge.clientY ?? rect.top + rect.height / 2,
      );
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("gesturestart", onGestureStart, { passive: false });
    element.addEventListener("gesturechange", onGestureChange, { passive: false });
    return () => {
      if (pendingScroll) cancelAnimationFrame(pendingScroll.raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("gesturestart", onGestureStart);
      element.removeEventListener("gesturechange", onGestureChange);
    };
  }, [continuous]);

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
    const onBlur = () => setSpaceDown(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
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

  // An explicit page jump (top bar, sidebar, PageUp/PageDown) scrolls the
  // continuous view to that page; the scroll listener must not undo it.
  useEffect(() => {
    const onGoto = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: number }>).detail;
      if (!continuous || !detail || typeof detail.page !== "number") return;
      programmaticScrollUntil.current = Date.now() + 400;
      const node = scrollRef.current?.querySelector<HTMLElement>(`[data-page-number="${detail.page}"]`);
      node?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("pm:goto-page", onGoto);
    return () => window.removeEventListener("pm:goto-page", onGoto);
  }, [continuous]);

  const canPan = activeTool === "hand" || spaceDown;
  const cursor = drag.current ? "grabbing" : canPan ? "grab" : "default";

  const scrollToCenterPage = () => {
    const element = scrollRef.current;
    if (!element) return;
    if (Date.now() < programmaticScrollUntil.current) return;
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
    // Scrolling is not navigation: update the page without a goto event.
    if (best !== useDocStore.getState().page) useDocStore.setState({ page: best });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pinching.current) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, textarea, select, a, [role='button']")) return;

    // Never hijack clicks on the native scrollbars of .doc-scroll.
    if (continuous && scrollRef.current && target === scrollRef.current) {
      const rect = scrollRef.current.getBoundingClientRect();
      const onVScrollbar = event.clientX >= rect.left + scrollRef.current.clientWidth;
      const onHScrollbar = event.clientY >= rect.top + scrollRef.current.clientHeight;
      if (onVScrollbar || onHScrollbar) return;
    }

    // Empty space beside a page is never a drawing surface: it always pans.
    const onPaper = Boolean(target?.closest?.(".page-paper"));
    const touchPan = pansFromBackground(event.pointerType, onPaper, touchDrawEnabled, canPan);
    const allowPan = (touchPan && event.button === 0) || event.button === 1;
    if (!allowPan) return;

    if (continuous) {
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
    setPan(
      clampPanRef.current({
        x: current.panX + event.clientX - current.x,
        y: current.panY + event.clientY - current.y,
      }),
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const activate = (index: number) => {
    // Clicking a page on screen is not a jump request.
    if (useDocStore.getState().page !== index + 1) useDocStore.setState({ page: index + 1 });
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
        touchScroll={!touchDrawEnabled}
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
      style={{ cursor, touchAction: CANVAS_TOUCH_ACTION }}
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
          className="doc-scroll absolute inset-0 overflow-y-scroll overflow-x-auto"
          // border-box: the rail padding is part of the scroll box, so the content
          // column is exactly the safe strip and its scroll range covers the rails.
          style={{ boxSizing: "border-box", paddingLeft: leftInset, paddingRight: rightInset }}
          onScroll={scrollToCenterPage}
        >
          <div className="flex min-h-full flex-col gap-5 py-8" style={{ width: "100%" }}>
            {displayRows.map((row, rowIndex) => {
              // Each row is only as wide as its own pages, so a wide page elsewhere
              // in the document never shifts this row's horizontal centre.
              const metrics = rowMetrics(row, zoom);
              return (
                <div
                  key={rowIndex}
                  className="flex shrink-0 items-start justify-center gap-5"
                  style={{ width: metrics.width, marginLeft: "auto", marginRight: "auto" }}
                >
                  {pageNodes(row, true)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="page-stage absolute top-1/2 will-change-transform"
          style={{
            // Centre of the safe strip: leftInset + (100% - leftInset - rightInset) / 2.
            left: `calc(${leftInset}px + (100% - ${leftInset + rightInset}px) / 2)`,
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
          }}
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