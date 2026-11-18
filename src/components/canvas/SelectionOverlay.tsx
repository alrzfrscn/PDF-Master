import {
  BringToFront,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Lock,
  RotateCw,
  SendToBack,
  SlidersHorizontal,
  Stamp,
  Trash2,
  Ungroup,
  Unlock,
} from "lucide-react";
import type { BBox, Pt } from "../../lib/annotationTypes";
import { PX_PER_MM } from "../../lib/paper";

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

export function handlePoints(box: BBox, rotateGapMm: number): Record<HandleId, Pt> {
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.width;
  const y1 = box.y + box.height;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return {
    nw: [x0, y0],
    n: [cx, y0],
    ne: [x1, y0],
    e: [x1, cy],
    se: [x1, y1],
    s: [cx, y1],
    sw: [x0, y1],
    w: [x0, cy],
    rotate: [cx, y0 - rotateGapMm],
  };
}

export type SelectionAction =
  | "style"
  | "duplicate"
  | "rotate"
  | "flip-h"
  | "flip-v"
  | "group"
  | "ungroup"
  | "lock"
  | "front"
  | "back"
  | "save-stamp"
  | "delete";

const BUTTONS: { action: SelectionAction; label: string; Icon: typeof Copy }[] = [
  { action: "style", label: "Style / properties", Icon: SlidersHorizontal },
  { action: "duplicate", label: "Duplicate (Ctrl+D)", Icon: Copy },
  { action: "rotate", label: "Rotate 90°", Icon: RotateCw },
  { action: "flip-h", label: "Flip horizontal", Icon: FlipHorizontal2 },
  { action: "flip-v", label: "Flip vertical", Icon: FlipVertical2 },
  { action: "group", label: "Group (Ctrl+G)", Icon: Group },
  { action: "ungroup", label: "Ungroup (Ctrl+Shift+G)", Icon: Ungroup },
  { action: "lock", label: "Lock / unlock", Icon: Lock },
  { action: "front", label: "Bring to front", Icon: BringToFront },
  { action: "back", label: "Send to back", Icon: SendToBack },
  { action: "save-stamp", label: "Save as stamp", Icon: Stamp },
  { action: "delete", label: "Delete", Icon: Trash2 },
];

interface Props {
  bounds: BBox | null;
  count: number;
  zoom: number;
  pageWidthMm: number;
  locked: boolean;
  grouped: boolean;
  onHandleDown: (handle: HandleId, event: React.PointerEvent) => void;
  onAction: (action: SelectionAction) => void;
}

/** Screen-space selection chrome; the page wrapper's CSS zoom would scale it, so it counter-scales. */
export function SelectionOverlay({ bounds, count, zoom, pageWidthMm, locked, grouped, onHandleDown, onAction }: Props) {
  if (!bounds) return null;
  const scale = PX_PER_MM;
  const left = bounds.x * scale;
  const top = bounds.y * scale;
  const width = Math.max(1, bounds.width * scale);
  const height = Math.max(1, bounds.height * scale);
  const size = 9 / zoom;
  const hit = 24 / zoom;
  const rotateGap = 26 / scale;
  const handles = handlePoints(bounds, rotateGap);
  // 48 screen px above the box top: keeps the bar 22 px clear of the rotate grip.
  const lift = 48 / zoom;
  const below = top < lift;
  // Anchor the bar to the near edge so its 12 buttons stay inside the page.
  const anchorRight = left + width / 2 > (pageWidthMm * scale) / 2;
  const barLeft = anchorRight ? left + width : left;
  const barShift = below
    ? `translate(${anchorRight ? "-100%" : "0"}, 0)`
    : `translate(${anchorRight ? "-100%" : "0"}, -100%)`;
  const barOrigin = `${below ? "top" : "bottom"} ${anchorRight ? "right" : "left"}`;

  return (
    <div className="selection-chrome pointer-events-none absolute inset-0 z-20">
      <div
        className="absolute"
        style={{ left, top, width, height, border: `${1.25 / zoom}px solid var(--accent)`, borderRadius: 1 }}
      />
      {(Object.keys(handles) as HandleId[]).map((handle) => {
        const [x, y] = handles[handle];
        const isRotate = handle === "rotate";
        return (
          <button
            key={handle}
            type="button"
            aria-label={isRotate ? "Rotate selection" : `Resize ${handle}`}
            className="pointer-events-auto absolute bg-transparent"
            style={{
              left: x * scale - hit / 2,
              top: y * scale - hit / 2,
              width: hit,
              height: hit,
              cursor: isRotate ? "grab" : `${handle}-resize`,
              touchAction: "none",
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onHandleDown(handle, event);
            }}
          >
            <span
              className="block rounded-full border border-[var(--accent)]"
              style={{
                width: isRotate ? size + 3 : size,
                height: isRotate ? size + 3 : size,
                margin: "auto",
                background: isRotate ? "var(--glass-strong)" : "var(--paper)",
              }}
            />
          </button>
        );
      })}
      {!below && (
        <div
          className="absolute"
          style={{
            left: left + width / 2,
            top: top - lift,
            height: lift,
            width: 1 / zoom,
            background: "var(--accent)",
            transform: "translateX(-50%)",
          }}
        />
      )}
      <div
        className="absolute"
        style={{
          left: barLeft,
          top: below ? top + height + 12 / zoom : top - lift,
          transform: barShift,
          transformOrigin: barOrigin,
        }}
      >
        <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: barOrigin }}>
          <div className="glass-strong pointer-events-auto flex items-center gap-0.5 rounded-lg px-1 py-0.5 shadow-lg">
            {BUTTONS.map(({ action, label, Icon }) => (
              <button
                key={action}
                type="button"
                className="icon-btn h-6 w-6"
                title={label}
                aria-label={label}
                style={action === "delete" ? { color: "var(--danger)" } : undefined}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onAction(action)}
              >
                <Icon size={12.5} strokeWidth={1.9} />
              </button>
            ))}
            <span className="ml-1 flex items-center gap-1 pr-1 text-[10px] text-muted">
              {locked ? <Lock size={10} /> : grouped ? <Group size={10} /> : <Unlock size={10} />}
              {count}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
