import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FilePlus, FileText, FolderOpen, Image as ImageIcon, MoveHorizontal, Play, Scan, Search, Settings } from "lucide-react";
import { clamp, clampPan, getWorkspaceInsets, PX_PER_MM, workspaceSafeArea, type PanOffset } from "../../lib/paper";
import { CANVAS_TOUCH_ACTION, pansFromBackground } from "../../lib/canvasInput";
import { pageSizeMm, pageTemplate } from "../../lib/pageUtils";
import { addImageStamp } from "../../lib/images";
import { readImageFile } from "../../lib/raster";
import { useSearchStore } from "../../lib/pdfSearch";
import { usePrefsStore } from "../../lib/prefs";
import { useDocStore } from "../../stores/useDocStore";
import { useContextMenuStore, keepsNativeMenu } from "../../stores/useContextMenuStore";
import { useToolStore } from "../../stores/useToolStore";
import { useUIStore, type GridStyle } from "../../stores/useUIStore";
import type { DocumentPage, DocumentTab, ToolId } from "../../lib/types";
import { EmptyWorkspace } from "../EmptyWorkspace";
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
  tabId: string;
  page: DocumentPage;
  index: number;
  widthMm: number;
  heightMm: number;
  landscape: boolean;
  pageCount: number;
  scale: number;
  observe: boolean;
  panMode: boolean;
  auxLines: boolean;
  gridStyle: GridStyle;
  activeTool: ToolId;
  active: boolean;
  touchScroll: boolean;
  register: (index: number, node: HTMLDivElement | null) => void;
  onActivate: (index: number) => void;
}

// Memoised with primitives: editing one page must not re-render every sheet.
const PageView = memo(function PageView({
  tabId,
  page,
  index,
  widthMm,
  heightMm,
  landscape,
  pageCount,
  scale,
  observe,
  panMode,
  auxLines,
  gridStyle,
  activeTool,
  active,
  touchScroll,
  register,
  onActivate,
}: PageViewProps) {
  const template = pageTemplate(page);
  const rotated = page.rotation === 90 || page.rotation === 270;
  const baseW = widthMm * PX_PER_MM;
  const baseH = heightMm * PX_PER_MM;
  const displayW = (rotated ? heightMm : widthMm) * PX_PER_MM * scale;
  const displayH = (rotated ? widthMm : heightMm) * PX_PER_MM * scale;
  // Skia rasterises the scaled sheet on a device-pixel grid; a fractional frame
  // leaves 1px damage seams on the backdrop along its edge.
  const boxW = Math.round(displayW);
  const boxH = Math.round(displayH);
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
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "1200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [observe]);

  const crop = page.cropBox;
  const clipPath = crop
    ? `inset(${crop.yMm * PX_PER_MM}px ${(widthMm - crop.xMm - crop.widthMm) * PX_PER_MM}px ${(heightMm - crop.yMm - crop.heightMm) * PX_PER_MM}px ${crop.xMm * PX_PER_MM}px)`
    : undefined;
  // The wrapper is already the scaled size; scale from its top-left corner so the
  // sheet can never bleed outside it, and keep rotated sheets in positive space.
  const pageTransform =
    page.rotation === 90
      ? `translate(${displayW}px, 0) scale(${scale}) rotate(90deg)`
      : page.rotation === 180
        ? `translate(${displayW}px, ${displayH}px) scale(${scale}) rotate(180deg)`
        : page.rotation === 270
          ? `translate(0, ${displayH}px) scale(${scale}) rotate(270deg)`
          : `scale(${scale})`;

  return (
    <div
      ref={(node) => {
        nodeRef.current = node;
        register(index, node);
      }}
      data-page-index={index}
      data-page-number={index + 1}
      className="paper-shadow relative shrink-0 overflow-hidden rounded-[2px]"
      style={{ width: boxW, height: boxH }}
      onPointerDownCapture={(event) => {
        if (event.button === 0) onActivate(index);
      }}
    >
      {/* The scaled sheet is clipped to the integer frame so its raster damage
          rectangles can never paint past the page onto the backdrop. */}
      <div className="absolute inset-0 overflow-hidden" style={{ contain: "paint" }}>
        <div
          className="page-paper absolute"
          style={{
            width: baseW,
            height: baseH,
            left: 0,
            top: 0,
            transform: pageTransform,
            transformOrigin: "0 0",
            touchAction: CANVAS_TOUCH_ACTION,
          }}
        >
          <div className="relative h-full w-full" style={{ clipPath, overflow: "hidden" }}>
            {page.pdf ? (
              <div className="relative h-full w-full overflow-hidden" style={{ background: "var(--paper)" }}>
                {visible && (
                  <PdfBackground page={page.pdf} widthMm={widthMm} heightMm={heightMm} zoom={scale} />
                )}
              </div>
            ) : (
              <PaperSheet template={template} landscape={landscape} aux={auxLines} shadow={false} />
            )}
            <GridOverlay styleName={gridStyle} widthMm={widthMm} heightMm={heightMm} prefix={`${tabId}-${page.id}`} />
            <SearchHighlights pageIndex={index} widthMm={widthMm} heightMm={heightMm} />
            {visible && (
              <AnnotationLayer
                tabId={tabId}
                page={page}
                pageIndex={index}
                pageCount={pageCount}
                hasPdf={Boolean(page.pdf)}
                widthMm={widthMm}
                heightMm={heightMm}
                zoom={scale}
                panMode={panMode}
                touchScroll={touchScroll}
              />
            )}
          </div>
          {activeTool === "crop" && active && (
            <CropOverlay
              key={`${tabId}:${page.id}:${page.cropBox ? `${page.cropBox.xMm},${page.cropBox.yMm},${page.cropBox.widthMm},${page.cropBox.heightMm}` : "full"}`}
              widthMm={widthMm}
              heightMm={heightMm}
              cropBox={page.cropBox}
              zoom={scale}
              onApply={(box) => {
                const doc = useDocStore.getState();
                doc.pushHistory(tabId);
                doc.updatePage(tabId, index, { cropBox: box ?? undefined });
                useToolStore.getState().setTool("select");
              }}
              onCancel={() => useToolStore.getState().setTool("select")}
            />
          )}
        </div>
      </div>
    </div>
  );
});

export function PaperViewport() {
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  if (!tab) return <EmptyWorkspace />;
  return <PaperViewportBody key={tab.id} tab={tab} />;
}

function PaperViewportBody({ tab }: { tab: DocumentTab }) {
  const zoom = useDocStore((state) => state.zoom);
  const fitMode = useDocStore((state) => state.fitMode);
  const fitEpoch = useDocStore((state) => state.fitEpoch);
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
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const pagesCompactMode = useUIStore((state) => state.pagesCompactMode);
  const favoritesOpen = useUIStore((state) => state.favoritesOpen);
  const toolPopoverOpen = useUIStore((state) => state.toolPopoverOpen);
  const toolPopoverPinned = useUIStore((state) => state.toolPopoverPinned);
  const presentation = useUIStore((state) => state.presentation);

  const pageNumber = clamp(pageIndex, 1, tab.pages.length);
  const continuous = viewMode === "one-continuous" || viewMode === "two-continuous";
  const twoPage = viewMode === "two-page" || viewMode === "two-continuous";
  const compactPages = sidebarOpen && sidebarTab === "pages" && pagesCompactMode;
  // Floating controls cover part of the canvas; fitting must centre in the rest.
  const { leftInset, rightInset } = presentation
    ? { leftInset: 0, rightInset: 0 }
    : getWorkspaceInsets({
        sidebarOpen,
        favoritesOpen,
        pagesCompactMode: compactPages,
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
  const zoomAnchorRef = useRef<{
    pageIndex: number;
    u: number;
    v: number;
    clientX: number;
    clientY: number;
    targetX: number;
    targetY: number;
  } | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; scroll: boolean } | null>(null);
  const programmaticScrollUntil = useRef(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // A second finger takes over from the one-finger pan; its pointerdown must not start one.
  const pinching = useRef(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [scrollerWidth, setScrollerWidth] = useState(0);

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

  /** Puts the rendered midpoint of `index` at the safe-strip centre. */
  const centerPage = (index: number, scroller: HTMLDivElement) => {
    const node = pageRefs.current.get(index);
    if (!node) return;
    const pageRect = node.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const currentCenterX = pageRect.left + pageRect.width / 2 - scrollerRect.left;
    const { safeCenterX } = workspaceSafeArea(scroller.clientWidth, leftInset, rightInset);
    scroller.scrollLeft += currentCenterX - safeCenterX;
  };

  /** Page 1 keeps the canvas top padding; later pages land 20px below it. */
  const scrollPageToTop = (index: number, behavior: ScrollBehavior = "auto") => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (index === 0) {
      scroller.scrollTo({ top: 0, behavior });
      return;
    }
    const node = pageRefs.current.get(index);
    if (!node) return;
    const nodeRect = node.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + nodeRect.top - scrollerRect.top - 20), behavior });
  };

  /**
   * Remembers the page point under the cursor/fingers before the zoom changes.
   * `targetX/Y` may differ from `clientX/Y` during a pinch: the same page point
   * then lands under the live midpoint, so zoom and two-finger pan move together.
   */
  const captureZoomAnchor = (clientX: number, clientY: number, targetX = clientX, targetY = clientY) => {
    const entries = [...pageRefs.current.entries()];
    if (entries.length === 0) return;
    let hit = entries.find(([, node]) => {
      const rect = node.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });
    if (!hit) {
      const scrollerRect = scrollRef.current?.getBoundingClientRect();
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const entry of entries) {
        const rect = entry[1].getBoundingClientRect();
        if (scrollerRect && (rect.bottom < scrollerRect.top || rect.top > scrollerRect.bottom)) continue;
        const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
        const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
        const distance = Math.hypot(dx, dy);
        if (distance < bestDistance) {
          bestDistance = distance;
          hit = entry;
        }
      }
    }
    if (!hit) {
      const fallback = pageRefs.current.get(useDocStore.getState().page - 1);
      if (!fallback) return;
      hit = [useDocStore.getState().page - 1, fallback];
    }
    const [pageIndex, node] = hit;
    const rect = node.getBoundingClientRect();
    zoomAnchorRef.current = {
      pageIndex,
      u: (clientX - rect.left) / Math.max(1, rect.width),
      v: (clientY - rect.top) / Math.max(1, rect.height),
      clientX,
      clientY,
      targetX,
      targetY,
    };
  };

  // The scrollbar width changes the safe centre; track it instead of assuming 100%.
  useLayoutEffect(() => {
    if (!continuous) return;
    const element = scrollRef.current;
    if (!element) return;
    const update = () => setScrollerWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [continuous]);

  // Two-finger pinch zooms and pans around the live midpoint. Capture phase is
  // essential: finger #1 may start inside AnnotationLayer, which stops bubbling.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; zoom: number; center: { x: number; y: number } } | null = null;
    const midpoint = (): { x: number; y: number } => {
      const points = [...pointers.values()];
      return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size !== 2) return;
      event.preventDefault();
      window.dispatchEvent(new Event("pm:cancel-draft"));
      window.dispatchEvent(new Event("pm:pinch-start"));
      drag.current = null;
      pinching.current = true;
      const center = midpoint();
      const points = [...pointers.values()];
      pinch = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1,
        zoom: useDocStore.getState().zoom,
        center,
      };
    };
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinch || pointers.size < 2) return;
      event.preventDefault();
      const points = [...pointers.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
      const center = midpoint();
      const zoom = clamp(pinch.zoom * (distance / pinch.distance), 0.1, 6);
      if (zoom === useDocStore.getState().zoom) {
        // Constant finger distance is a pure pan; zoom subscribers would not fire.
        const dx = center.x - pinch.center.x;
        const dy = center.y - pinch.center.y;
        pinch.center = center;
        if (continuous) {
          const scroller = scrollRef.current;
          if (scroller) {
            scroller.scrollLeft -= dx;
            scroller.scrollTop -= dy;
          }
        } else {
          setPan((current) => clampPanRef.current({ x: current.x + dx, y: current.y + dy }));
        }
        return;
      }
      // Anchor the point under the old midpoint, then land it under the new one:
      // that single change makes pinch zoom and two-finger pan one smooth gesture.
      captureZoomAnchor(pinch.center.x, pinch.center.y, center.x, center.y);
      pinch.center = center;
      useDocStore.setState({ zoom, fitMode: null });
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size >= 2) return;
      if (pinch) window.dispatchEvent(new Event("pm:pinch-end"));
      pinch = null;
      pinching.current = false;
    };
    element.addEventListener("pointerdown", onDown, { capture: true });
    element.addEventListener("pointermove", onMove, { capture: true, passive: false });
    element.addEventListener("pointerup", onUp, { capture: true });
    element.addEventListener("pointercancel", onUp, { capture: true });
    return () => {
      element.removeEventListener("pointerdown", onDown, true);
      element.removeEventListener("pointermove", onMove, true);
      element.removeEventListener("pointerup", onUp, true);
      element.removeEventListener("pointercancel", onUp, true);
    };
  }, [continuous]);

  // WebView2 must never turn a two-finger canvas pinch into browser page scaling.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length >= 2) event.preventDefault();
    };
    element.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    return () => element.removeEventListener("touchmove", onTouchMove, true);
  }, []);

  // Fit to the safe workspace between the floating side rails whenever that fit
  // was requested, the view mode changed, or the rails resized. Scrolling through
  // the document updates `page` and must never re-run this and jump the scroller.
  useLayoutEffect(() => {
    if (!fitMode) return;
    const element = viewportRef.current;
    if (!element) return;
    const apply = () => {
      const rect = element.getBoundingClientRect();
      const width = continuous ? scrollRef.current?.clientWidth ?? rect.width : rect.width;
      if (width === 0 || rect.height === 0) return;
      // The active page's own row decides the fit: a wider page elsewhere in the
      // document must not shrink this one.
      const metrics = rowMetrics(activeRow(), 1);
      const { safeWidth } = workspaceSafeArea(width, leftInset, rightInset);
      // 12px beside each rail; continuous mode also owns 24px top and 48px bottom.
      const byWidth = (safeWidth - 24) / Math.max(1, metrics.width);
      const byHeight = (rect.height - (continuous ? 24 + 48 : 16)) / Math.max(1, metrics.height);
      const nextZoom = clamp(fitMode === "width" ? byWidth : Math.min(byWidth, byHeight), 0.1, 6);
      useDocStore.setState({ zoom: nextZoom });
      setPan({ x: 0, y: 0 });
      if (continuous) {
        programmaticScrollUntil.current = Date.now() + 400;
        requestAnimationFrame(() => {
          const active = useDocStore.getState().page - 1;
          const scroller = scrollRef.current;
          if (!scroller) return;
          centerPage(active, scroller);
          scrollPageToTop(active);
        });
      }
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitMode, fitEpoch, tab.id, twoPage, viewMode, leftInset, rightInset, continuous, rows]);

  // Zooming keeps the exact page point under the cursor/fingers in place.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    if (continuous) {
      const scroller = scrollRef.current;
      if (!scroller) return;
      // Zooming is not navigation: keep the page the user is looking at.
      programmaticScrollUntil.current = Date.now() + 250;
      if (anchor) {
        zoomAnchorRef.current = null;
        const node = pageRefs.current.get(anchor.pageIndex);
        if (node) {
          const rect = node.getBoundingClientRect();
          const nextX = rect.left + anchor.u * rect.width;
          const nextY = rect.top + anchor.v * rect.height;
          scroller.scrollLeft += nextX - anchor.targetX;
          scroller.scrollTop += nextY - anchor.targetY;
        }
      }
      // A row that fits has no horizontal range; keep it dead-centre. With no
      // anchor (a plain zoom change), centre the active page as well. A moving
      // pinch target is a pan, so it must not be pulled back to the centre.
      const active = useDocStore.getState().page - 1;
      const row = rows.find((item) => item.includes(active)) ?? [active];
      const { safeWidth } = workspaceSafeArea(scroller.clientWidth, leftInset, rightInset);
      const pinchPan = Boolean(
        anchor && (Math.abs(anchor.targetX - anchor.clientX) > 0.5 || Math.abs(anchor.targetY - anchor.clientY) > 0.5),
      );
      if (!anchor || (!pinchPan && rowMetrics(row, useDocStore.getState().zoom).width <= safeWidth)) {
        centerPage(active, scroller);
      }
      return;
    }
    if (!anchor) return;
    zoomAnchorRef.current = null;
    const node = pageRefs.current.get(anchor.pageIndex);
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const nextX = rect.left + anchor.u * rect.width;
    const nextY = rect.top + anchor.v * rect.height;
    setPan((prev) => clampPanRef.current({
      x: prev.x - (nextX - anchor.targetX),
      y: prev.y - (nextY - anchor.targetY),
    }));
  }, [zoom, continuous, leftInset, rightInset, rows]);

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

  // Touchpad pinch (Ctrl+wheel) and Ctrl/⌘ + wheel zoom about the cursor; a bare
  // wheel scrolls in continuous mode and pans in single-page mode.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const applyWheelZoom = (deltaY: number, deltaMode: number, clientX: number, clientY: number) => {
      captureZoomAnchor(clientX, clientY);
      // Line/page deltas are rare but legal; normalise them to pixels.
      const delta = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
      if (delta === 0) return;
      // A precision touchpad sends many tiny fractional deltas; a mouse notch is
      // large. Different gains keep both from feeling either sticky or violent,
      // and the clamp stops one huge event from jumping the whole zoom range.
      const trackpad = Math.abs(delta) < 30;
      const factor = Math.min(1.35, Math.max(0.74, Math.exp(-delta * (trackpad ? 0.012 : 0.0025))));
      useDocStore.setState({ zoom: clamp(useDocStore.getState().zoom * factor, 0.1, 6), fitMode: null });
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        applyWheelZoom(event.deltaY, event.deltaMode, event.clientX, event.clientY);
        return;
      }
      if (continuous) return;
      event.preventDefault();
      setPan((current) => clampPanRef.current({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
    };
    // Chromium/WebView2 otherwise consumes touchpad pinch for browser UI scaling
    // before the canvas can see it. The window-level guard wins the zoom race;
    // a pinch that starts over the chrome still zooms the document itself.
    const onWindowWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (element.contains(event.target as Node)) return;
      const rect = element.getBoundingClientRect();
      applyWheelZoom(event.deltaY, event.deltaMode, rect.left + rect.width / 2, rect.top + rect.height / 2);
    };
    element.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("wheel", onWindowWheel, { capture: true, passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("wheel", onWindowWheel, true);
    };
  }, [continuous]);

  // +/− buttons and keyboard steps anchor at the centre of the safe viewport.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    const anchorAtSafeCenter = () => {
      const element = viewportRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const width = continuous ? scrollRef.current?.clientWidth ?? rect.width : rect.width;
      const { safeCenterX } = workspaceSafeArea(width, leftInset, rightInset);
      captureZoomAnchor(rect.left + safeCenterX, rect.top + rect.height / 2);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || isTyping(event.target)) return;
      if (
        event.code === "Equal" || event.code === "NumpadAdd" || event.key === "+" ||
        event.code === "Minus" || event.code === "NumpadSubtract" || event.key === "-"
      ) {
        anchorAtSafeCenter();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-zoom]")) anchorAtSafeCenter();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [continuous, leftInset, rightInset]);

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

  // An explicit page jump (top bar, sidebar, PageUp/PageDown) scrolls the
  // continuous view to that page; the scroll listener must not undo it.
  useEffect(() => {
    const onGoto = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: number }>).detail;
      if (!continuous || !detail || typeof detail.page !== "number") return;
      programmaticScrollUntil.current = Date.now() + 400;
      scrollPageToTop(detail.page - 1, "smooth");
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
    // Empty space beside a page is never a drawing surface: it always pans.
    const onPaper = Boolean((event.target as HTMLElement).closest?.(".page-paper"));
    const touchPan = pansFromBackground(event.pointerType, onPaper, touchDrawEnabled, canPan);
    if (continuous) {
      if (!touchPan && event.button !== 1) return;
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
    if (!touchPan && event.button !== 1) return;
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
    setPan(clampPanRef.current({
      x: current.panX + event.clientX - current.x,
      y: current.panY + event.clientY - current.y,
    }));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const registerPage = useCallback((index: number, node: HTMLDivElement | null) => {
    if (node) pageRefs.current.set(index, node);
    else pageRefs.current.delete(index);
  }, []);

  const activate = useCallback((index: number) => {
    // Clicking a page on screen is not a jump request.
    if (useDocStore.getState().page !== index + 1) useDocStore.setState({ page: index + 1 });
  }, []);

  const pageNodes = (row: number[], observe: boolean) =>
    row.map((index) => {
      const item = tab.pages[index];
      const size = pageSizeMm(tab, item);
      return (
        <PageView
          key={item?.id ?? index}
          tabId={tab.id}
          page={item}
          index={index}
          widthMm={size.widthMm}
          heightMm={size.heightMm}
          landscape={tab.landscape}
          pageCount={tab.pages.length}
          scale={zoom}
          observe={observe}
          panMode={canPan}
          auxLines={auxLines}
          gridStyle={gridStyle}
          activeTool={activeTool}
          active={pageNumber - 1 === index}
          touchScroll={!touchDrawEnabled}
          register={registerPage}
          onActivate={activate}
        />
      );
    });

  const maxRowWidth = displayRows.reduce((max, row) => Math.max(max, rowMetrics(row, zoom).width), 0);
  const innerWidth = Math.max(scrollerWidth, maxRowWidth + leftInset + rightInset + 48);

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
      onContextMenu={(event) => {
        if (keepsNativeMenu(event.target)) return;
        event.preventDefault();
        // Inside a sheet the annotation layer owns the menu.
        if ((event.target as HTMLElement).closest?.(".page-paper")) return;
        const ui = useUIStore.getState();
        useContextMenuStore.getState().openAt(event.clientX, event.clientY, "Workspace", [
          {
            label: "Open PDF...",
            icon: FolderOpen,
            shortcut: "Ctrl+O",
            onSelect: () => document.getElementById("pm-pdf-input")?.click(),
          },
          { label: "New Paper Document...", icon: FilePlus, onSelect: () => ui.setNewDocOpen(true) },
          "divider",
          { label: "Fit to Page", icon: Scan, onSelect: () => useDocStore.getState().setFit("page") },
          { label: "Fit to Width", icon: MoveHorizontal, onSelect: () => useDocStore.getState().setFit("width") },
          { label: "Search in Document", icon: Search, shortcut: "Ctrl+F", onSelect: () => ui.setSearchOpen(true) },
          { label: "Full Screen Presentation", icon: Play, onSelect: () => ui.setPresentation(true) },
          "divider",
          { label: "Settings", icon: Settings, shortcut: "Ctrl+,", onSelect: () => ui.setSettingsOpen(true) },
        ]);
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
          // Chromium drops a scroll container's right padding when content
          // overflows, so the rails live on the inner canvas, not here.
          style={{ padding: 0 }}
          onScroll={scrollToCenterPage}
        >
          <div
            className="doc-canvas"
            style={{
              width: innerWidth,
              minHeight: "100%",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: ROW_GAP_PX,
              padding: `24px ${rightInset + 24}px 48px ${leftInset + 24}px`,
            }}
          >
            {displayRows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="flex shrink-0 items-start justify-center gap-5"
                style={{ width: rowMetrics(row, zoom).width }}
              >
                {pageNodes(row, true)}
              </div>
            ))}
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
