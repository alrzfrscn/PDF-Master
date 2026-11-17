import { useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { DocumentPage } from "../../lib/types";
import { PX_PER_MM } from "../../lib/paper";

type CropBox = NonNullable<DocumentPage["cropBox"]>;
type Mode = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  widthMm: number;
  heightMm: number;
  cropBox?: CropBox;
  zoom: number;
  onApply: (box: CropBox | null) => void;
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

const fullPage = (widthMm: number, heightMm: number): CropBox => ({ xMm: 0, yMm: 0, widthMm, heightMm });

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

/** Interactive crop frame drawn over the page, in page-local millimetres. */
export function CropOverlay({ widthMm, heightMm, cropBox, zoom, onApply }: Props) {
  const [box, setBox] = useState<CropBox>(() => cropBox ?? fullPage(widthMm, heightMm));
  const drag = useRef<{ mode: Mode; startX: number; startY: number; box: CropBox } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30 select-none"
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
            className="absolute h-3 w-3 rounded-sm border border-[var(--accent)] bg-white"
            style={{
              left: `calc(${handle.x * 100}% - 6px)`,
              top: `calc(${handle.y * 100}% - 6px)`,
              cursor: handle.cursor,
            }}
            onPointerDown={begin(handle.mode)}
          />
        ))}
      </div>

      <div
        className="absolute left-1/2 z-40"
        style={{ top: Math.max(6, top - 44), transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: "top center" }}
      >
        <div className="glass-strong flex items-center gap-2 rounded-xl px-2.5 py-1.5 shadow-lg">
          <span className="text-[11px] font-medium tabular-nums">
            {box.widthMm.toFixed(1)} × {box.heightMm.toFixed(1)} mm
          </span>
          <button type="button" className="chip h-6 px-2" onClick={() => onApply(clampBox(box, widthMm, heightMm))}>
            <Check size={11} /> Apply crop
          </button>
          <button
            type="button"
            className="chip h-6 px-2"
            onClick={() => {
              setBox(fullPage(widthMm, heightMm));
              onApply(null);
            }}
          >
            <RotateCcw size={11} /> Reset full page
          </button>
        </div>
      </div>
    </div>
  );
}
