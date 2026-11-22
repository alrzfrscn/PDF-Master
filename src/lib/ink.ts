import { getStroke } from "perfect-freehand";
import type { InkPoint, PenStyle, Pt } from "./annotationTypes";

export interface InkOutlineOptions {
  /** Simulated pressure from velocity when the device gives no real pressure. */
  simulatePressure?: boolean;
  /** 0..1: how much the width follows pressure. */
  thinning?: number;
  smoothing?: number;
  streamline?: number;
}

type PenStyleOptions = Required<Pick<InkOutlineOptions, "thinning" | "smoothing" | "streamline" | "simulatePressure">>;

/** Style presets: Basic is a fixed nib, Pro and Calligraphy follow pressure. */
export function penStyleOptions(style: PenStyle = "pro", pressureLevel = 55): PenStyleOptions {
  const level = Math.min(100, Math.max(0, pressureLevel)) / 100;
  return {
    thinning: style === "basic" ? 0 : (style === "calligraphy" ? 0.65 : 0.45) * level,
    smoothing: style === "basic" ? 0.3 : style === "calligraphy" ? 0.45 : 0.38,
    // Low streamline: the ink tracks the nib instead of rubber-banding behind it.
    streamline: style === "basic" ? 0.2 : style === "calligraphy" ? 0.35 : 0.28,
    simulatePressure: style !== "basic",
  };
}

/**
 * Highlighter alpha: the stored 0..1 opacity maps to a vivid 0.22..0.90
 * multiply curve, so even a faint highlight stays readable on white paper.
 */
export function markerOpacity(opacity: number): number {
  return 0.22 + 0.68 * Math.min(1, Math.max(0, opacity));
}

function toStrokePoints(points: InkPoint[]) {
  return points.map(([x, y, pressure]) => ({ x, y, pressure }));
}

/** Variable-width outline from perfect-freehand, in millimetres. */
export function inkOutline(points: InkPoint[], thicknessMm: number, options: InkOutlineOptions = {}): number[][] {
  if (points.length === 0) return [];
  return getStroke(toStrokePoints(points), {
    size: Math.max(0.05, thicknessMm),
    thinning: options.thinning ?? 0.45,
    smoothing: options.smoothing ?? 0.38,
    streamline: options.streamline ?? 0.28,
    simulatePressure: options.simulatePressure ?? true,
    // The committed stroke must be pixel-identical to the live draft.
    last: true,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
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

export const DOT_LENGTH_MM = 0.4;

function strokeLength(points: InkPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return length;
}

/** A tap, or a stroke too short to be a line, is drawn as a dot rather than a blob. */
export function isDotStroke(points: InkPoint[]): boolean {
  if (points.length === 0) return false;
  if (points.length === 1) return true;
  return strokeLength(points) < DOT_LENGTH_MM;
}

/** A clean circle of exactly 0.45 × the pen width, as an SVG path. */
function dotPath(point: readonly number[], thicknessMm: number): string {
  const radius = Math.max(0.01, thicknessMm * 0.45);
  const [cx, cy] = point;
  return `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;
}

export function inkPath(points: InkPoint[], thicknessMm: number, options: InkOutlineOptions = {}): string {
  if (isDotStroke(points)) return dotPath(points[0], thicknessMm);
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

/**
 * A stroke must not start with a full-width blob. Pens keep their real pressure
 * inside a safe band; mouse and touch start at a neutral half-width.
 */
export function initialInkPressure(pointerType: string, pressure: number): number {
  if (pointerType === "pen" && pressure > 0 && pressure !== 0.5) return Math.min(0.8, Math.max(0.25, pressure));
  return 0.5;
}

/** Gentle exponential smoothing so width changes never show as lumps. */
export function smoothPressure(previous: number, target: number): number {
  return previous * 0.65 + target * 0.35;
}
