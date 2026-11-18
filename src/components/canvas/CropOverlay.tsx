import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { DocumentPage } from "../../lib/types";
import { PX_PER_MM } from "../../lib/paper";

type CropBox = NonNullable<DocumentPage["cropBox"]>;
type Mode = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type RatioId = "free" | "a4" | "16:9" | "1:1";

interface Props {
  widthMm: number;
  heightMm: number;
  cropBox?: CropBox;
  zoom: number;
  onApply: (box: CropBox | null) => void;
  onCancel: () => void;
}

const MIN_MM = 10;
const HANDLES: { mode: Mode; x: number; y: number; cursor: string }[] = [
  { mode: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { mode: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { mode: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { mode: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { mode: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { mode: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { mode: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { mode: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];

const RATIOS: { id: RatioId; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "a4", label: "A4", ratio: 210 / 297 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "1:1", label: "1:1", ratio: 1 },
];

const fullPage = (widthMm: number, heightMm: number): CropBox => ({ xMm: 0, yMm: 0, widthMm, heightMm });

/** A 10 mm inset gives the frame something to grab the moment Crop opens. */
const insetPage = (widthMm: number, heightMm: number): CropBox =>
  clampBox({ xMm: 10, yMm: 10, widthMm: widthMm - 20, heightMm: heightMm - 20 }, widthMm, heightMm);

function clampBox(box: CropBox, widthMm: number, heightMm: number): CropBox {
  const width = Math.max(MIN_MM, Math.min(box.widthMm, widthMm));
  const height = Math.max(MIN_MM, Math.min(box.heightMm, heightMm));
  return {
    xMm: Math.max(0, Math.min(box.xMm, widthMm - width)),
    yMm: Math.max(0, Math.min(box.yMm, heightMm - height)),
    widthMm: width,
    heightMm: height,
  };
}

function centeredRatio(widthMm: number, heightMm: number, ratio: number): CropBox {
  let width = widthMm;
  let height = width / ratio;
  if (height > heightMm) {
    height = heightMm;
    width = height * ratio;
  }
  return { xMm: (widthMm - width) / 2, yMm: (heightMm - height) / 2, widthMm: width, heightMm: height };
}

/** Interactive crop frame drawn over the page, in page-local millimetres. */
export function CropOverlay({ widthMm, heightMm, cropBox, zoom, onApply, onCancel }: Props) {
  const [box, setBox] = useState<CropBox>(() => cropBox ?? insetPage(widthMm, heightMm));
  const [ratio, setRatio] = useState<RatioId>("free");
  const drag = useRef<{ mode: Mode; startX: number; startY: number; box: CropBox } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hit = 24 / zoom;
  const dot = 12 / zoom;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  const toMm = (event: React.PointerEvent) => {
    // The handles capture pointers, so page-local coordinates always come from the container.
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left) / (zoom * PX_PER_MM),
      y: (event.clientY - rect.top) / (zoom * PX_PER_MM),
    };
  };

  const begin = (mode: Mode) => (event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const point = toMm(event);
    drag.current = { mode, startX: point.x, startY: point.y, box };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const point = toMm(event);
    const dx = point.x - current.startX;
    const dy = point.y - current.startY;
    const base = current.box;
    let next = { ...base };
    const mode = current.mode;
    if (mode === "move") {
      next.xMm = base.xMm + dx;
      next.yMm = base.yMm + dy;
    } else {
      if (mode.includes("w")) {
        next.xMm = base.xMm + dx;
        next.widthMm = base.widthMm - dx;
      }
      if (mode.includes("e")) next.widthMm = base.widthMm + dx;
      if (mode.includes("n")) {
        next.yMm = base.yMm + dy;
        next.heightMm = base.heightMm - dy;
      }
      if (mode.includes("s")) next.heightMm = base.heightMm + dy;
      if (next.widthMm < MIN_MM) {
        next.widthMm = MIN_MM;
        if (mode.includes("w")) next.xMm = base.xMm + base.widthMm - MIN_MM;
      }
      if (next.heightMm < MIN_MM) {
        next.heightMm = MIN_MM;
        if (mode.includes("n")) next.yMm = base.yMm + base.heightMm - MIN_MM;
      }
    }
    setRatio("free");
    setBox(clampBox(next, widthMm, heightMm));
  };

  const end = () => {
    drag.current = null;
  };

  const px = (value: number) => value * PX_PER_MM;
  const left = px(box.xMm);
  const top = px(box.yMm);
  const width = px(box.widthMm);
  const height = px(box.heightMm);
  const pageWidthPx = px(widthMm);

  // Keep the bar inside the page box even when the crop sits at an edge.
  const barHalf = 200 / zoom;
  const barLeft =
    pageWidthPx < barHalf * 2
      ? pageWidthPx / 2
      : Math.max(barHalf, Math.min(pageWidthPx - barHalf, left + width / 2));

  const isFullPage = box.xMm <= 0.5 && box.yMm <= 0.5 && box.widthMm >= widthMm - 0.5 && box.heightMm >= heightMm - 0.5;

  return (
    <div
      ref={containerRef}
      className="crop-overlay absolute inset-0 z-30 select-none"
      style={{ touchAction: "none", cursor: "crosshair" }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        begin("move")(event);
      }}
    >
      <div
        className="absolute border border-white/80"
        style={{ left, top, width, height, boxShadow: "0 0 0 9999px rgba(9, 11, 16, 0.35)" }}
        onPointerDown={begin("move")}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/3 top-0 h-full w-px bg-white/45" />
          <div className="absolute left-2/3 top-0 h-full w-px bg-white/45" />
          <div className="absolute left-0 top-1/3 h-px w-full bg-white/45" />
          <div className="absolute left-0 top-2/3 h-px w-full bg-white/45" />
        </div>
        {HANDLES.map((handle) => (
          <button
            key={handle.mode}
            type="button"
            aria-label={`Crop ${handle.mode}`}
            className="absolute grid place-items-center bg-transparent"
            style={{
              left: `calc(${handle.x * 100}% - ${hit / 2}px)`,
              top: `calc(${handle.y * 100}% - ${hit / 2}px)`,
              width: hit,
              height: hit,
              cursor: handle.cursor,
              touchAction: "none",
            }}
            onPointerDown={begin(handle.mode)}
          >
            <span
              className="rounded-sm border border-[var(--accent)] bg-white"
              style={{ width: dot, height: dot }}
            />
          </button>
        ))}
      </div>

      <div
        className="absolute z-40"
        style={{
          left: barLeft,
          top: Math.max(16, top - 44),
          transform: `translateX(-50%) scale(${1 / zoom})`,
          transformOrigin: "top center",
        }}
      >
        <div className="glass-strong flex items-center gap-1.5 rounded-xl px-2 py-1.5 shadow-lg">
          <span className="whitespace-nowrap text-[11px] font-medium tabular-nums">
            {box.widthMm.toFixed(1)} × {box.heightMm.toFixed(1)} mm
          </span>
          <div className="seg">
            {RATIOS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={ratio === option.id}
                onClick={() => {
                  setRatio(option.id);
                  if (option.ratio !== null) setBox(centeredRatio(widthMm, heightMm, option.ratio));
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="chip h-6 px-2" onClick={() => { setRatio("free"); setBox(fullPage(widthMm, heightMm)); }}>
            <RotateCcw size={11} /> Reset
          </button>
          <button type="button" className="chip h-6 px-2" onClick={onCancel}>
            <X size={11} /> Cancel
          </button>
          <button
            type="button"
            className="chip h-6 px-2"
            onClick={() => onApply(isFullPage ? null : clampBox(box, widthMm, heightMm))}
          >
            <Check size={11} /> Apply
          </button>
        </div>
      </div>
    </div>
  );
}
