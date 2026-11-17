import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon } from "lucide-react";
import { paperById, paperTemplates } from "../../lib/data";
import { clamp, fitScale, PX_PER_MM } from "../../lib/paper";
import { pageSizeMm, pageTemplate } from "../../lib/pageUtils";
import { addImageStamp } from "../../lib/images";
import { readImageFile } from "../../lib/raster";
import { useDocStore } from "../../stores/useDocStore";
import { useToolStore } from "../../stores/useToolStore";
import { useUIStore } from "../../stores/useUIStore";
import { AnnotationLayer } from "./AnnotationLayer";
import { CropOverlay } from "./CropOverlay";
import { PaperSheet } from "./PaperSheet";
import { PdfBackground } from "./PdfBackground";

export function PaperViewport() {
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const zoom = useDocStore((state) => state.zoom);
  const fitMode = useDocStore((state) => state.fitMode);
  const pageIndex = useDocStore((state) => state.page);
  const activeTool = useToolStore((state) => state.activeTool);
  const auxLines = useUIStore((state) => state.auxLines);
  const lastError = useDocStore((state) => state.lastError);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const pageNumber = clamp(pageIndex, 1, tab.pages.length);
  const page = tab.pages[pageNumber - 1] ?? tab.pages[0];
  const template = pageTemplate(page) ?? (paperById.get(tab.templateId) ?? paperTemplates[0]);
  const size = pageSizeMm(tab, page);
  const rotated = page.rotation === 90 || page.rotation === 270;
  const fitSize = rotated ? { widthMm: size.heightMm, heightMm: size.widthMm } : size;

  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  // Fit to the viewport whenever that fit was requested, or the page/rotation changes.
  useLayoutEffect(() => {
    if (!fitMode) return;
    const element = viewportRef.current;
    if (!element) return;
    const apply = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      useDocStore.setState({ zoom: fitScale(rect.width, rect.height, fitSize, fitMode, 120) });
      setPan({ x: 0, y: 0 });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitMode, fitSize.widthMm, fitSize.heightMm]);

  // Ctrl/⌘ + wheel zooms about the cursor; a bare wheel pans the workspace.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
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
  }, [zoom]);

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

  const canPan = activeTool === "hand" || spaceDown;
  const cursor = drag.current ? "grabbing" : canPan ? "grab" : "default";
  const widthPx = size.widthMm * PX_PER_MM;
  const heightPx = size.heightMm * PX_PER_MM;
  // clip-path hides the cropped-away margin but keeps full-page coordinates, so annotations and snapshots still line up.
  const crop = page.cropBox;
  const clipPath = crop
    ? `inset(${crop.yMm * PX_PER_MM}px ${(size.widthMm - crop.xMm - crop.widthMm) * PX_PER_MM}px ${(size.heightMm - crop.yMm - crop.heightMm) * PX_PER_MM}px ${crop.xMm * PX_PER_MM}px)`
    : undefined;

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full overflow-hidden"
      style={{ cursor }}
      onPointerDown={(event) => {
        if (!canPan && event.button !== 1) return;
        drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        setPan({
          x: drag.current.panX + event.clientX - drag.current.x,
          y: drag.current.panY + event.clientY - drag.current.y,
        });
      }}
      onPointerUp={(event) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
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
      <div
        className="absolute left-1/2 top-1/2 will-change-transform"
        style={{
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <div
          className="relative"
          style={{
            width: widthPx,
            height: heightPx,
            transform: page.rotation ? `rotate(${page.rotation}deg)` : undefined,
            transformOrigin: "center",
          }}
        >
          <div className="relative h-full w-full" style={{ clipPath, overflow: "hidden" }}>
            {page.pdf ? (
              <div className="paper-shadow relative h-full w-full overflow-hidden" style={{ background: "var(--paper)" }}>
                <PdfBackground page={page.pdf} widthMm={size.widthMm} heightMm={size.heightMm} zoom={zoom} />
              </div>
            ) : (
              <PaperSheet template={template} landscape={tab.landscape} aux={auxLines} />
            )}
            <AnnotationLayer
              tab={tab}
              page={page}
              widthMm={size.widthMm}
              heightMm={size.heightMm}
              zoom={zoom}
              panMode={canPan}
            />
          </div>
          {activeTool === "crop" && (
            <CropOverlay
              widthMm={size.widthMm}
              heightMm={size.heightMm}
              cropBox={page.cropBox}
              zoom={zoom}
              onApply={(box) => {
                const doc = useDocStore.getState();
                doc.pushHistory(tab.id);
                doc.updatePage(tab.id, pageNumber - 1, { cropBox: box ?? undefined });
                useToolStore.getState().setTool("select");
              }}
            />
          )}
        </div>
      </div>

      {dropActive && (
        <div className="pointer-events-none absolute inset-4 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]">
          <div className="glass-strong flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-medium">
            <FileText size={16} /> Drop a PDF to open a tab, or an image to place it <ImageIcon size={16} />
          </div>
        </div>
      )}

      {lastError && (
        <div className="glass pointer-events-auto absolute left-1/2 top-4 z-30 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-2 text-[11.5px]">
          <span style={{ color: "var(--danger)" }}>{lastError}</span>
          <button type="button" className="chip h-6" onClick={() => useDocStore.setState({ lastError: null })}>
            Dismiss
          </button>
        </div>
      )}

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border), transparent)" }}
      />
    </div>
  );
}
