import { ArrowDown, ArrowUp, Bookmark, BookmarkPlus, ChevronDown, ChevronLeft, ChevronRight, CopyPlus, Download, Eye, EyeOff, FilePlus, FileText, Hand, Heart, Highlighter, LayoutGrid, Maximize2, MessageSquareText, Minimize2, PenLine, Pin, Plus, RotateCw, Search, Sigma, Square, Stamp, Star, Trash2, Type, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { stampById, stamps, userStamps } from "../lib/data";
import { PX_PER_MM } from "../lib/paper";
import { pageSizeMm, pageTemplate } from "../lib/pageUtils";
import { renderPdfPage } from "../lib/pdfEngine";
import { captureRegion } from "../lib/raster";
import { SHAPE_LABEL, type Annotation } from "../lib/annotationTypes";
import type { DocumentPage, DocumentTab } from "../lib/types";
import { usePrefsStore } from "../lib/prefs";
import type { GridStyle, SidebarTab, ViewMode } from "../stores/useUIStore";
import { useAnnotationStore } from "../stores/useAnnotationStore";
import { useContextMenuStore, keepsNativeMenu } from "../stores/useContextMenuStore";
import { useDocStore } from "../stores/useDocStore";
import { useToolStore } from "../stores/useToolStore";
import { useUIStore } from "../stores/useUIStore";
import { PaperSheet } from "./canvas/PaperSheet";
import { Segmented, SectionTitle, Switch } from "./ui/controls";

const TABS: { id: SidebarTab; label: string; Icon: typeof FileText }[] = [
  { id: "pages", label: "Pages", Icon: FileText },
  { id: "bookmarks", label: "Bookmarks", Icon: Bookmark },
  { id: "annotations", label: "Annotations", Icon: MessageSquareText },
  { id: "stamps", label: "Stamps / Library", Icon: Stamp },
];

function EmptyState({ Icon, title, body }: { Icon: typeof FileText; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--track)", color: "var(--muted)" }}>
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="text-[12px] font-medium">{title}</div>
      <p className="max-w-[180px] text-[10.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

async function exportPagePng(tab: DocumentTab, index: number): Promise<void> {
  const doc = useDocStore.getState();
  const page = doc.tabs.find((item) => item.id === tab.id)?.pages[index];
  if (!page) return;
  // A page that is not on screen has no DOM to capture, so navigate to it first.
  doc.setPage(index + 1);
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const element = document.querySelector<HTMLElement>(`[data-page-index="${index}"] .page-paper`);
  const size = pageSizeMm(tab, page);
  const image = await captureRegion(element, { x: 0, y: 0, width: size.widthMm, height: size.heightMm }, 200, {
    pageWidthMm: size.widthMm,
    pageHeightMm: size.heightMm,
    pdfPage: page.pdf,
    renderPage: renderPdfPage,
  });
  if (!image) {
    useUIStore.getState().setToast("That page could not be captured");
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = image.dataUrl;
  anchor.download = `page-${index + 1}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function PageThumb({ tab, page, active, index, onClick }: { tab: DocumentTab; page: DocumentPage; active: boolean; index: number; onClick: () => void }) {
  const size = pageSizeMm(tab, page);
  const rotation = page.rotation === 90 || page.rotation === 270;
  const width = rotation ? size.heightMm : size.widthMm;
  const height = rotation ? size.widthMm : size.heightMm;
  const boxWidth = 48;
  const boxHeight = 62;
  const scale = Math.min(boxWidth / (width * PX_PER_MM), boxHeight / (height * PX_PER_MM));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  // Rendering 100+ PDF pages must wait until a thumbnail is close to the viewport.
  useEffect(() => {
    const node = holderRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const crop = page.cropBox;
  const viewWidthMm = crop?.widthMm ?? size.widthMm;
  const viewHeightMm = crop?.heightMm ?? size.heightMm;

  useEffect(() => {
    if (!visible || !page.pdf || !canvasRef.current) return;
    void renderPdfPage(page.pdf.url, page.pdf.pageNumber, canvasRef.current, 96, 96 * (height / width), 1);
  }, [visible, page.pdf, width, height]);

  return (
    <button
      type="button"
      className="tile group flex flex-col gap-1 p-1.5 text-left"
      aria-pressed={active}
      title={`Page ${index + 1}${page.annotations.length ? ` · ${page.annotations.length} annotations` : ""}`}
      onClick={onClick}
      onContextMenu={(event) => {
        if (keepsNativeMenu(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        const doc = useDocStore.getState();
        useContextMenuStore.getState().openAt(event.clientX, event.clientY, `Page ${index + 1}`, [
          { label: "Insert Blank Page Before", icon: FilePlus, onSelect: () => doc.addPage(undefined, index) },
          { label: "Insert Blank Page After", icon: FilePlus, onSelect: () => doc.addPage(undefined, index + 1) },
          { label: "Duplicate Page", icon: CopyPlus, onSelect: () => doc.duplicatePage(index) },
          { label: "Rotate 90°", icon: RotateCw, onSelect: () => doc.rotatePage(index) },
          { label: "Move Up", icon: ArrowUp, disabled: index === 0, onSelect: () => doc.reorderPage(index, index - 1) },
          {
            label: "Move Down",
            icon: ArrowDown,
            disabled: index === tab.pages.length - 1,
            onSelect: () => doc.reorderPage(index, index + 1),
          },
          "divider",
          { label: "Export Page as PNG...", icon: Download, onSelect: () => void exportPagePng(tab, index) },
          "divider",
          {
            label: "Delete Page",
            icon: Trash2,
            danger: true,
            disabled: tab.pages.length <= 1,
            onSelect: () => doc.deletePage(index),
          },
        ]);
      }}
    >
      <span
        ref={holderRef}
        className="relative grid place-items-center overflow-hidden rounded-[3px] bg-[var(--paper)]"
        style={{ width: boxWidth, height: boxHeight, boxShadow: "var(--shadow-soft)" }}
      >
        {page.pdf ? (
          <span
            className="absolute block"
            style={{
              left: `${-((crop?.xMm ?? 0) / viewWidthMm) * 100}%`,
              top: `${-((crop?.yMm ?? 0) / viewHeightMm) * 100}%`,
              width: `${(size.widthMm / viewWidthMm) * 100}%`,
              height: `${(size.heightMm / viewHeightMm) * 100}%`,
            }}
          >
            <canvas ref={canvasRef} className="block h-full w-full" />
          </span>
        ) : (
          <span style={{ display: "block", transform: `scale(${scale})`, transformOrigin: "center" }}>
            <PaperSheet template={pageTemplate(page)} landscape={tab.landscape} />
          </span>
        )}
        {page.annotations.length > 0 && (
          <span
            className="absolute right-0.5 top-0.5 rounded-full px-1 text-[9px] font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {page.annotations.length}
          </span>
        )}
      </span>
      <span className="flex items-center justify-between text-[10px] text-muted">
        <span>{index + 1}</span>
        <span>{page.rotation ? `${page.rotation}°` : ""}</span>
      </span>
    </button>
  );
}

interface PageDrag {
  index: number;
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  element: HTMLElement;
  active: boolean;
}

/**
 * The pages drawer body: a fixed header, a scrollable thumbnail grid and a
 * sticky footer. A deliberate hold or a 6 px drag reorders pages, in the wide
 * grid and in the narrow strip alike.
 */
function PagesPanel({ tab, compact }: { tab: DocumentTab; compact: boolean }) {
  const pageIndex = useDocStore((state) => state.page);
  const setPage = useDocStore((state) => state.setPage);
  const addPage = useDocStore((state) => state.addPage);
  const duplicatePage = useDocStore((state) => state.duplicatePage);
  const rotatePage = useDocStore((state) => state.rotatePage);
  const movePage = useDocStore((state) => state.movePage);
  const deletePage = useDocStore((state) => state.deletePage);
  const deletePagesAfter = useDocStore((state) => state.deletePagesAfter);
  const deletePagesBefore = useDocStore((state) => state.deletePagesBefore);
  const setLandscape = useDocStore((state) => state.setLandscape);
  const auxLines = useUIStore((state) => state.auxLines);
  const toggleAuxLines = useUIStore((state) => state.toggleAuxLines);
  const setNewDocOpen = useUIStore((state) => state.setNewDocOpen);

  const [menuOpen, setMenuOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<PageDrag | null>(null);
  const insertRef = useRef<number | null>(null);
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [menuOpen]);

  /** 0..pages.length: the slot the dragged page would drop into. */
  const slotAt = (x: number, y: number): number => {
    const slots = [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-page-slot]") ?? [])];
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestRect: DOMRect | null = null;
    for (const slot of slots) {
      const index = Number(slot.dataset.pageSlot);
      const rect = slot.getBoundingClientRect();
      const distance = (x - (rect.left + rect.width / 2)) ** 2 + (y - (rect.top + rect.height / 2)) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
        bestRect = rect;
      }
    }
    if (best < 0 || !bestRect) return tab.pages.length;
    const after = compact ? y > bestRect.top + bestRect.height / 2 : x > bestRect.left + bestRect.width / 2;
    return after ? best + 1 : best;
  };

  const beginDrag = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    suppressClickUntil.current = 0;
    dragRef.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      element: event.currentTarget,
      active: false,
    };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      // A quick swipe is a tap or a scroll; a hold or a 6 px pull reorders.
      if (moved <= 6 && performance.now() - drag.startTime <= 140) return;
      drag.active = true;
      // Capture only once the drag starts, so a plain tap still clicks the thumb.
      drag.element.setPointerCapture(event.pointerId);
      setDragIndex(drag.index);
    }
    event.preventDefault();
    const slot = slotAt(event.clientX, event.clientY);
    insertRef.current = slot;
    setInsertAt(slot);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.active) {
      suppressClickUntil.current = performance.now() + 300;
      const slot = insertRef.current ?? drag.index;
      const to = slot > drag.index ? slot - 1 : slot;
      if (to !== drag.index) movePage(drag.index, to);
    }
    if (drag.element.hasPointerCapture(event.pointerId)) drag.element.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    insertRef.current = null;
    setDragIndex(null);
    setInsertAt(null);
  };

  const lineClass = compact ? "inset-x-0 -top-[3px] h-[3px]" : "inset-y-0 -left-[3px] w-[3px]";

  return (
    <>
      {!compact && (
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <SectionTitle>Pages</SectionTitle>
          <span className="text-[10px] text-muted">{tab.pages.length} pages</span>
        </div>
      )}
      <div
        ref={gridRef}
        className={
          compact
            ? "no-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-x-hidden overflow-y-auto p-2"
            : "no-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-1.5 overflow-x-hidden overflow-y-auto px-3 pb-2"
        }
      >
        {tab.pages.map((item, index) => (
          <div
            key={item.id}
            data-page-slot={index}
            className={`relative ${dragIndex === index ? "z-10 scale-[1.06] rounded-lg ring-2 ring-[var(--accent)]" : ""}`}
            style={{ touchAction: "none", transition: "transform 120ms ease" }}
            onPointerDown={(event) => beginDrag(index, event)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <PageThumb
              tab={tab}
              page={item}
              index={index}
              active={index === pageIndex - 1}
              onClick={() => {
                if (performance.now() < suppressClickUntil.current) return;
                setPage(index + 1);
              }}
            />
            {insertAt === index && (
              <span className={`pointer-events-none absolute rounded-full bg-[var(--accent)] ${lineClass}`} />
            )}
            {insertAt === tab.pages.length && index === tab.pages.length - 1 && (
              <span
                className={`pointer-events-none absolute rounded-full bg-[var(--accent)] ${
                  compact ? "inset-x-0 -bottom-[3px] h-[3px]" : "inset-y-0 -right-[3px] w-[3px]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {!compact && (
        <div className="shrink-0 border-t border-[var(--border)] p-2.5">
          <div className="grid grid-cols-4 gap-1">
            <button type="button" className="chip h-7 min-w-0 justify-center gap-1 px-1 text-[10.5px]" title="Add page" onClick={() => addPage()}>
              <Plus size={11} /> Add
            </button>
            <button type="button" className="chip h-7 min-w-0 justify-center gap-1 px-1 text-[10.5px]" title="Duplicate page" onClick={() => duplicatePage()}>
              <CopyPlus size={11} /> Copy
            </button>
            <button type="button" className="chip h-7 min-w-0 justify-center gap-1 px-1 text-[10.5px]" title="Rotate page 90°" onClick={() => rotatePage()}>
              <RotateCw size={11} /> Rotate
            </button>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                className="chip h-7 w-full min-w-0 justify-center gap-0.5 px-1"
                title="Delete pages"
                aria-label="Delete pages"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={tab.pages.length <= 1}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <Trash2 size={11} />
                <ChevronDown size={10} />
              </button>
              {menuOpen && (
                <div role="menu" className="menu-surface anim-in absolute bottom-full right-0 z-50 mb-1.5 w-[186px] rounded-xl p-1">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] hover:bg-[var(--hover)] disabled:pointer-events-none disabled:opacity-40"
                    disabled={tab.pages.length <= 1}
                    onClick={() => {
                      setMenuOpen(false);
                      deletePage();
                    }}
                  >
                    <Trash2 size={12} className="shrink-0" style={{ color: "var(--danger)" }} />
                    Delete this page
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] hover:bg-[var(--hover)] disabled:pointer-events-none disabled:opacity-40"
                    disabled={pageIndex >= tab.pages.length}
                    onClick={() => {
                      setMenuOpen(false);
                      deletePagesAfter();
                    }}
                  >
                    <Trash2 size={12} className="shrink-0" style={{ color: "var(--danger)" }} />
                    Delete pages after this
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] hover:bg-[var(--hover)] disabled:pointer-events-none disabled:opacity-40"
                    disabled={pageIndex <= 1}
                    onClick={() => {
                      setMenuOpen(false);
                      deletePagesBefore();
                    }}
                  >
                    <Trash2 size={12} className="shrink-0" style={{ color: "var(--danger)" }} />
                    Delete pages before this
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-1">
            <button type="button" className="chip h-7 flex-1 justify-center" disabled={pageIndex <= 1} onClick={() => setPage(pageIndex - 1)}>
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="min-w-[42px] text-center text-[10.5px] text-muted">
              {pageIndex} / {tab.pages.length}
            </span>
            <button
              type="button"
              className="chip h-7 flex-1 justify-center"
              disabled={pageIndex >= tab.pages.length}
              onClick={() => setPage(pageIndex + 1)}
            >
              Next <ChevronRight size={12} />
            </button>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[11.5px]">Alignment guides</span>
            <Switch checked={auxLines} onChange={toggleAuxLines} label="Alignment guides" />
          </div>

          {!tab.pdf && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <Segmented
                  value={tab.landscape ? "landscape" : "portrait"}
                  options={[
                    { value: "portrait", label: "Portrait" },
                    { value: "landscape", label: "Landscape" },
                  ]}
                  onChange={(value) => setLandscape(value === "landscape")}
                />
              </div>
              <button type="button" className="chip h-7 shrink-0 justify-center px-2 text-[10.5px]" onClick={() => setNewDocOpen(true)}>
                Change Template…
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function annotationLabel(annotation: Annotation): string {
  if (annotation.type === "pen") return "Pen";
  if (annotation.type === "marker") return "Highlighter";
  if (annotation.type === "stamp") {
    const factory = stampById.get(annotation.stampId);
    return factory?.title.en ?? userStamps.find((stamp) => stamp.id === annotation.stampId)?.name ?? "Stamp";
  }
  if (annotation.type === "text") return "Text";
  if (annotation.type === "formula") return "Formula";
  return SHAPE_LABEL[annotation.shapeType];
}

function annotationColor(annotation: Annotation): string | null {
  if (annotation.type === "pen" || annotation.type === "marker" || annotation.type === "formula") return annotation.color;
  if (annotation.type === "shape") return annotation.strokeColor;
  if (annotation.type === "text") return annotation.textColor;
  return null;
}

function AnnotationIcon({ annotation }: { annotation: Annotation }) {
  const props = { size: 13, strokeWidth: 1.75 } as const;
  if (annotation.type === "pen") return <PenLine {...props} />;
  if (annotation.type === "marker") return <Highlighter {...props} />;
  if (annotation.type === "stamp") return <Stamp {...props} />;
  if (annotation.type === "text") return <Type {...props} />;
  if (annotation.type === "formula") return <Sigma {...props} />;
  return <Square {...props} />;
}

const TAB_TITLES: Record<SidebarTab, string> = {
  pages: "Pages",
  bookmarks: "Bookmarks",
  annotations: "Annotations",
  stamps: "Stamps / Library",
};

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "one-page", label: "One page" },
  { id: "one-continuous", label: "One continuous" },
  { id: "two-continuous", label: "Two continuous" },
  { id: "two-page", label: "Two page" },
];

const GRID_STYLES: { id: GridStyle; label: string }[] = [
  { id: "none", label: "None" },
  { id: "squared-5", label: "Squared 5 mm" },
  { id: "squared-10", label: "Squared 10 mm" },
  { id: "ruled-8", label: "Ruled 8 mm" },
  { id: "dots-5", label: "Dots 5 mm" },
  { id: "millimeter", label: "Millimeter" },
];

export function Sidebar() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const setSidebarTab = useUIStore((state) => state.toggleSidebarTab);
  const drawerPinned = useUIStore((state) => state.drawerPinned);
  const toggleDrawerPinned = useUIStore((state) => state.toggleDrawerPinned);
  const favoritesOpen = useUIStore((state) => state.favoritesOpen);
  const toggleFavorites = useUIStore((state) => state.toggleFavorites);
  const setLibraryOpen = useUIStore((state) => state.setLibraryOpen);
  const pagesCompactMode = useUIStore((state) => state.pagesCompactMode);
  const togglePagesCompactMode = useUIStore((state) => state.togglePagesCompactMode);
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const pageIndex = useDocStore((state) => state.page);
  const setPage = useDocStore((state) => state.setPage);
  const addBookmark = useDocStore((state) => state.addBookmark);
  const selection = useAnnotationStore((state) => state.selection);
  const select = useAnnotationStore((state) => state.select);
  const remove = useAnnotationStore((state) => state.remove);
  const update = useAnnotationStore((state) => state.update);
  const recentStamps = useToolStore((state) => state.recentStamps);
  const selectStamp = useToolStore((state) => state.selectStamp);
  const viewMode = useUIStore((state) => state.viewMode);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const separateCoverPage = useUIStore((state) => state.separateCoverPage);
  const toggleSeparateCoverPage = useUIStore((state) => state.toggleSeparateCoverPage);
  const gridStyle = useUIStore((state) => state.gridStyle);
  const setGridStyle = useUIStore((state) => state.setGridStyle);
  const searchOpen = useUIStore((state) => state.searchOpen);
  const setSearchOpen = useUIStore((state) => state.setSearchOpen);
  const touchDrawEnabled = usePrefsStore((state) => state.touchDrawEnabled);
  const setPrefs = usePrefsStore((state) => state.set);
  const [viewOpen, setViewOpen] = useState(false);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const compactPages = sidebarOpen && sidebarTab === "pages" && pagesCompactMode;
  const railRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const viewButtonRef = useRef<HTMLButtonElement>(null);

  // An unpinned drawer closes on the first click anywhere on the page.
  useEffect(() => {
    if (!sidebarOpen || drawerPinned) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (railRef.current?.contains(target) || drawerRef.current?.contains(target) || viewRef.current?.contains(target)) return;
      useUIStore.getState().toggleSidebar();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [sidebarOpen, drawerPinned]);

  useEffect(() => {
    if (!viewOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The button's own onClick toggles the popover. Treating its pointerdown
      // as an outside click closes it first, then the click reopens it.
      if (viewRef.current?.contains(target) || viewButtonRef.current?.contains(target)) return;
      setViewOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [viewOpen]);

  const recent = recentStamps
    .map((id) => stamps.find((stamp) => stamp.id === id) ?? userStamps.find((stamp) => stamp.id === id))
    .filter((stamp): stamp is NonNullable<typeof stamp> => Boolean(stamp));

  const jumpTo = (pageNumber: number, annotationId?: string) => {
    setPage(pageNumber);
    if (annotationId) select([annotationId]);
  };

  // The narrow page strip belongs to the Pages tab; any other rail action dismisses it.
  const closeCompactStrip = () => {
    if (!compactPages) return;
    useUIStore.getState().toggleSidebar();
  };

  return (
    <div ref={railRef} className="sidebar absolute left-3 top-3 z-40">
      <div className="glass flex w-11 flex-col items-center gap-1 rounded-2xl py-2">
        <button
          ref={viewButtonRef}
          type="button"
          className="icon-btn"
          aria-label="View settings"
          title="View"
          aria-pressed={viewOpen}
          onClick={() => {
            closeCompactStrip();
            setViewOpen((open) => !open);
          }}
        >
          <LayoutGrid size={16} strokeWidth={1.75} />
        </button>
        <div className="my-0.5 h-px w-6 bg-[var(--border)]" />
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="icon-btn"
            aria-label={label}
            title={label}
            aria-pressed={sidebarOpen && sidebarTab === id}
            onClick={() => setSidebarTab(id)}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        ))}
        <div className="my-0.5 h-px w-6 bg-[var(--border)]" />
        <button
          type="button"
          className="icon-btn"
          aria-label="Search document"
          title="Search (Ctrl+F)"
          aria-pressed={searchOpen}
          onClick={() => {
            closeCompactStrip();
            setSearchOpen(!searchOpen);
          }}
        >
          <Search size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Favorite tools"
          title="Favorite tools"
          aria-pressed={favoritesOpen}
          onClick={() => {
            closeCompactStrip();
            toggleFavorites();
          }}
        >
          <Heart size={16} strokeWidth={1.75} style={favoritesOpen ? { fill: "currentColor" } : undefined} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Finger draws"
          title={touchDrawEnabled ? "Finger draws · tap to pan with one finger" : "One finger pans · tap to draw with a finger"}
          aria-pressed={touchDrawEnabled}
          onClick={() => {
            closeCompactStrip();
            setPrefs({ touchDrawEnabled: !touchDrawEnabled });
          }}
        >
          <Hand size={16} strokeWidth={1.75} />
        </button>
      </div>

      {viewOpen && (
        <div ref={viewRef} className="glass-strong anim-in absolute left-[52px] top-0 z-50 w-[232px] rounded-xl p-2">
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Page view</div>
          <div className="flex flex-col gap-0.5">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className="chip h-7 w-full justify-start px-2"
                aria-pressed={viewMode === mode.id}
                onClick={() => setViewMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
            {(viewMode === "two-page" || viewMode === "two-continuous") && (
              <button
                type="button"
                className="chip h-7 w-full justify-start px-2"
                aria-pressed={separateCoverPage}
                onClick={toggleSeparateCoverPage}
              >
                Separate cover page
              </button>
            )}
          </div>
          <div className="divider my-1.5" />
          <label className="field">
            <span className="field-label">Grid line</span>
            <select className="text-input" value={gridStyle} onChange={(event) => setGridStyle(event.target.value as GridStyle)} aria-label="Grid line">
              {GRID_STYLES.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {sidebarOpen && tab && (
        <aside
          ref={drawerRef}
          className={`glass-strong anim-in absolute top-0 z-40 flex flex-col overflow-hidden rounded-2xl ${
            compactPages ? "left-[56px] w-[104px]" : "left-[52px] w-[268px]"
          }`}
          style={{ maxHeight: compactPages ? "calc(100vh - 80px)" : "calc(100vh - 120px)", height: "auto" }}
          aria-label={TAB_TITLES[sidebarTab]}
        >
          <div className={`flex items-center gap-1 border-b border-[var(--border)] ${compactPages ? "justify-center px-2 py-1.5" : "px-3 py-2"}`}>
            {!compactPages && <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{TAB_TITLES[sidebarTab]}</span>}
            {sidebarTab === "pages" && (
              <button
                type="button"
                className="icon-btn h-7 w-7"
                aria-label={compactPages ? "Expand pages drawer" : "Collapse to page strip"}
                aria-pressed={compactPages}
                title={compactPages ? "Expand pages" : "Compact page strip"}
                onClick={togglePagesCompactMode}
              >
                {compactPages ? <Maximize2 size={13} strokeWidth={1.75} /> : <Minimize2 size={13} strokeWidth={1.75} />}
              </button>
            )}
            {!compactPages && (
              <button
                type="button"
                className="icon-btn h-7 w-7"
                aria-label={drawerPinned ? "Unpin drawer" : "Pin drawer"}
                aria-pressed={drawerPinned}
                title={drawerPinned ? "Unpinned: closes when you click away" : "Pinned: stays open"}
                onClick={toggleDrawerPinned}
              >
                <Pin size={13} strokeWidth={1.75} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn h-7 w-7"
              aria-label="Close drawer"
              title="Close"
              onClick={() => useUIStore.getState().toggleSidebar()}
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>

          <div
            className={
              sidebarTab === "pages"
                ? "flex min-h-0 flex-1 flex-col"
                : "no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto p-3"
            }
          >
        {sidebarTab === "pages" && <PagesPanel tab={tab} compact={compactPages} />}

        {sidebarTab === "bookmarks" && (
          <>
            <SectionTitle aside={<span className="text-[10px] text-muted">{tab.pdf?.bookmarks.length ?? 0}</span>}>Bookmarks</SectionTitle>
            {tab.pdf && (
              <button type="button" className="chip h-8 justify-center" onClick={() => addBookmark(`Page ${pageIndex}`)}>
                <BookmarkPlus size={13} /> Bookmark page {pageIndex}
              </button>
            )}
            <div className="flex flex-col gap-0.5">
              {(tab.pdf?.bookmarks ?? []).map((bookmark) => (
                <button
                  key={bookmark.id}
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] hover:bg-[var(--hover)]"
                  style={{ paddingLeft: 8 + bookmark.depth * 12 }}
                  onClick={() => setPage(bookmark.pageIndex + 1)}
                >
                  <Bookmark size={12} className="shrink-0 text-muted" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">{bookmark.title}</span>
                  <span className="text-[10px] text-muted">{bookmark.pageIndex + 1}</span>
                </button>
              ))}
            </div>
            {tab.pdf && tab.pdf.bookmarks.length === 0 && (
              <EmptyState Icon={Bookmark} title="No bookmarks" body="This PDF has no outline. Add a bookmark for the current page." />
            )}
          </>
        )}

        {sidebarTab === "annotations" && (
          <>
            <SectionTitle
              aside={<span className="text-[10px] text-muted">{tab.pages.reduce((sum, item) => sum + item.annotations.length, 0)}</span>}
            >
              Annotations
            </SectionTitle>
            {tab.pages.every((item) => item.annotations.length === 0) ? (
              <EmptyState
                Icon={MessageSquareText}
                title="No annotations yet"
                body="Ink, shapes and stamps you draw are listed here per page."
              />
            ) : (
              tab.pages.map((item, index) => {
                if (item.annotations.length === 0) return null;
                return (
                  <div key={item.id} className="flex flex-col gap-0.5">
                    <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Page {index + 1}</div>
                    {item.annotations.map((annotation) => (
                      <div
                        key={annotation.id}
                        className={`group flex items-center gap-1.5 rounded-lg px-1.5 py-1 ${
                          selection.includes(annotation.id) ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--hover)]"
                        }`}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          onClick={() => jumpTo(index + 1, annotation.id)}
                        >
                          <span
                            className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
                            style={{ background: "var(--track)", color: annotationColor(annotation) ?? "var(--muted)" }}
                          >
                            <AnnotationIcon annotation={annotation} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11.5px]">{annotationLabel(annotation)}</span>
                        </button>
                        <button
                          type="button"
                          className="icon-btn h-5 w-5 opacity-60 group-hover:opacity-100"
                          aria-label={annotation.hidden ? "Show" : "Hide"}
                          title={annotation.hidden ? "Show" : "Hide"}
                          onClick={() => {
                            jumpTo(index + 1);
                            update([annotation.id], { hidden: !annotation.hidden });
                          }}
                        >
                          {annotation.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                        </button>
                        <button
                          type="button"
                          className="icon-btn h-5 w-5 opacity-60 group-hover:opacity-100"
                          aria-label="Delete annotation"
                          title="Delete"
                          onClick={() => {
                            jumpTo(index + 1);
                            remove([annotation.id]);
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </>
        )}

        {sidebarTab === "stamps" && (
          <>
            <button type="button" className="chip h-8 justify-center" onClick={() => setLibraryOpen(true)}>
              <Stamp size={13} strokeWidth={1.75} /> Open stamp library
            </button>
            <SectionTitle aside={<span className="text-[10px] text-muted">{recent.length}</span>}>Recent stamps</SectionTitle>
            {recent.length === 0 ? (
              <EmptyState Icon={Star} title="Nothing pinned yet" body="A stamp picked from the gallery shows up here for one-click reuse." />
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {recent.map((stamp) => {
                  const name = "title" in stamp ? stamp.title.en : stamp.name;
                  return (
                    <button
                      key={stamp.id}
                      type="button"
                      className="tile checker grid h-[52px] place-items-center p-1"
                      title={name}
                      onClick={() => selectStamp(stamp.id)}
                    >
                      <img src={stamp.imageUrl ?? ""} alt={name} className="max-h-full max-w-full object-contain" />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
          </div>
        </aside>
      )}
    </div>
  );
}
