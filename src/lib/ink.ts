import { getStroke } from "perfect-freehand";
import type { InkPoint, PenStyle, Pt } from "./annotationTypes";

export interface InkOutlineOptions {
  /** Simulated pressure from velocity when the device gives no real pressure. */
  simulatePressure?: boolean;
  /** 0..1: how much the width follows pressure. */
  thinning?: number;
  smoothing?: number;
}

/** Style presets: Basic is a fixed nib, Pro and Calligraphy follow pressure. */
export function penStyleOptions(style: PenStyle = "pro", pressureLevel = 55): Required<Pick<InkOutlineOptions, "thinning" | "smoothing" | "simulatePressure">> {
  const level = Math.min(100, Math.max(0, pressureLevel));
  return {
    thinning: style === "basic" ? 0 : level / 100,
    smoothing: style === "calligraphy" ? 0.85 : 0.5,
    simulatePressure: style !== "basic",
  };
}

function toStrokePoints(points: InkPoint[]) {
  return points.map(([x, y, pressure]) => ({ x, y, pressure }));
}

/** Variable-width outline from perfect-freehand, in millimetres. */
export function inkOutline(points: InkPoint[], thicknessMm: number, options: InkOutlineOptions = {}): number[][] {
  if (points.length === 0) return [];
  return getStroke(toStrokePoints(points), {
    size: Math.max(0.05, thicknessMm),
    thinning: options.thinning ?? 0.55,
    smoothing: options.smoothing ?? 0.5,
    streamline: 0.45,
    simulatePressure: options.simulatePressure ?? true,
    last: true,
  });
}

function outlineToPath(stroke: number[][]): string {
  if (stroke.length === 0) return "";
  const parts: (string | number)[] = ["M", stroke[0][0], stroke[0][1], "Q"];
  for (let index = 0; index < stroke.length; index += 1) {
    const [x0, y0] = stroke[index];
    const [x1, y1] = stroke[(index + 1) % stroke.length];
    parts.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  parts.push("Z");
  return parts.join(" ");
}

export function inkPath(points: InkPoint[], thicknessMm: number, options: InkOutlineOptions = {}): string {
  return outlineToPath(inkOutline(points, thicknessMm, options));
}

export function polylinePath(points: Pt[], closed = false): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  const parts = [`M ${first[0]} ${first[1]}`];
  for (const [x, y] of rest) parts.push(`L ${x} ${y}`);
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/** Velocity-derived pressure so a mouse still produces calligraphic ink. */
export function pressureFromVelocity(previous: Pt | null, next: Pt, elapsedMs: number): number {
  if (!previous || elapsedMs <= 0) return 0.55;
  const speed = Math.hypot(next[0] - previous[0], next[1] - previous[1]) / elapsedMs;
  return Math.min(1, Math.max(0.2, 1 - speed * 0.55));
}

/**
 * Real pressure only exists on pens. Mice report 0 or 0.5 while idle, so those
 * fall back to velocity instead of flattening the stroke.
 */
export function pointerPressure(
  pointerType: string,
  pressure: number,
  previous: Pt | null,
  next: Pt,
  elapsedMs: number,
): number {
  if (pointerType === "pen" && pressure > 0 && pressure !== 0.5) return Math.min(1, pressure);
  return pressureFromVelocity(previous, next, elapsedMs);
}
