import type { InkPoint, MarkerTip, PenStyle, Pt } from "./annotationTypes";

export interface InkOutlineOptions {
  /** Kept for API compatibility: the local engine needs no simulated pressure. */
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

/** Below this the stroke is a dot, not a line. */
const MIN_STROKE_MM = 0.05;
/** Shortest spine step, so a tiny nib still gets smooth curves. */
const MIN_STEP_MM = 0.08;
const MAX_STEPS = 16;
const CAP_STEPS = 8;

interface Segment {
  s: Pt;
  c: Pt;
  e: Pt;
  p0: number;
  p1: number;
}

interface Sample {
  x: number;
  y: number;
  p: number;
}

function unit(dx: number, dy: number): Pt {
  const length = Math.hypot(dx, dy);
  return length < 1e-9 ? [1, 0] : [dx / length, dy / length];
}

function mid(a: readonly number[], b: readonly number[]): Pt {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Shortest signed angle from 0 to `angle`, in (-π, π]. */
function normalizeAngle(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

/** Pen half-width before pressure is applied. */
function baseRadius(thicknessMm: number): number {
  return Math.max(0.02, thicknessMm / 2);
}

/** Pressure 0..1 to nib radius, in millimetres. Never jumps, never blobs. */
function radiusForPressure(pressure: number, thicknessMm: number, thinning: number): number {
  const baseR = baseRadius(thicknessMm);
  if (thinning <= 0) return baseR;
  const p = Math.min(1, Math.max(0.05, pressure));
  const r = baseR * (1 - thinning * 0.75 + thinning * 1.15 * p);
  return Math.min(baseR * 1.25, Math.max(baseR * 0.22, r));
}

function dedupe(points: InkPoint[]): InkPoint[] {
  const clean: InkPoint[] = [];
  for (const point of points) {
    const previous = clean[clean.length - 1];
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 1e-4) continue;
    clean.push(point);
  }
  return clean;
}

function polylineLength(points: InkPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return length;
}

/**
 * Quadratic midpoint spine: every interior segment runs seam-to-seam through
 * one recorded point, so it depends on three points only. Appending samples
 * can never move an earlier segment.
 */
function buildSegments(points: InkPoint[]): Segment[] {
  const count = points.length;
  if (count < 2) return [];
  const at = (index: number): Pt => [points[index][0], points[index][1]];
  const press = (index: number): number => points[index][2];
  if (count === 2) {
    return [{ s: at(0), c: mid(at(0), at(1)), e: at(1), p0: press(0), p1: press(1) }];
  }
  const seams: Pt[] = [];
  for (let index = 0; index < count - 1; index += 1) seams.push(mid(at(index), at(index + 1)));
  const segments: Segment[] = [
    {
      s: at(0),
      c: mid(at(0), seams[0]),
      e: seams[0],
      p0: press(0),
      p1: (press(0) + press(1)) / 2,
    },
  ];
  for (let index = 1; index <= count - 2; index += 1) {
    segments.push({
      s: seams[index - 1],
      c: at(index),
      e: seams[index],
      p0: (press(index - 1) + press(index)) / 2,
      p1: (press(index) + press(index + 1)) / 2,
    });
  }
  segments.push({
    s: seams[count - 2],
    c: mid(seams[count - 2], at(count - 1)),
    e: at(count - 1),
    p0: (press(count - 2) + press(count - 1)) / 2,
    p1: press(count - 1),
  });
  return segments;
}

function buildSpine(segments: Segment[], thicknessMm: number): Sample[] {
  const samples: Sample[] = [];
  const finest = Math.max(MIN_STEP_MM, thicknessMm * 0.25);
  for (const segment of segments) {
    const span =
      (Math.hypot(segment.c[0] - segment.s[0], segment.c[1] - segment.s[1]) +
        Math.hypot(segment.e[0] - segment.c[0], segment.e[1] - segment.c[1]) +
        Math.hypot(segment.e[0] - segment.s[0], segment.e[1] - segment.s[1])) /
      2;
    const steps = Math.min(MAX_STEPS, Math.max(2, Math.ceil(span / finest)));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const u = 1 - t;
      samples.push({
        x: u * u * segment.s[0] + 2 * u * t * segment.c[0] + t * t * segment.e[0],
        y: u * u * segment.s[1] + 2 * u * t * segment.c[1] + t * t * segment.e[1],
        p: segment.p0 + (segment.p1 - segment.p0) * t,
      });
    }
  }
  const last = segments[segments.length - 1];
  samples.push({ x: last.e[0], y: last.e[1], p: last.p1 });
  return samples;
}

/** Semicircle helper: `includeEnd` false stops one step short of the far side. */
function arc(center: Pt, radius: number, from: number, sweep: number, steps: number, includeEnd: boolean): number[][] {
  const points: number[][] = [];
  const total = includeEnd ? steps + 1 : steps;
  for (let step = 0; step < total; step += 1) {
    const angle = from + (sweep * step) / steps;
    points.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }
  return points;
}

/**
 * Tangent-aligned left/right ribbon with analytic round caps and a small
 * circular join on the outer side of sharp corners.
 */
function ribbonOutline(samples: Sample[], thicknessMm: number, thinning: number): number[][] {
  const count = samples.length;
  const radii = samples.map((sample) => radiusForPressure(sample.p, thicknessMm, thinning));
  const tangents: Pt[] = [];
  for (let index = 0; index < count; index += 1) {
    if (index === 0) {
      tangents.push(unit(samples[1].x - samples[0].x, samples[1].y - samples[0].y));
    } else if (index === count - 1) {
      tangents.push(unit(samples[count - 1].x - samples[count - 2].x, samples[count - 1].y - samples[count - 2].y));
    } else {
      const incoming = unit(samples[index].x - samples[index - 1].x, samples[index].y - samples[index - 1].y);
      const outgoing = unit(samples[index + 1].x - samples[index].x, samples[index + 1].y - samples[index].y);
      const sumX = incoming[0] + outgoing[0];
      const sumY = incoming[1] + outgoing[1];
      tangents.push(Math.hypot(sumX, sumY) < 1e-6 ? outgoing : unit(sumX, sumY));
    }
  }
  // Angle of the left normal (-t.y, t.x).
  const normalAngles = tangents.map(([tx, ty]) => Math.atan2(tx, -ty));

  const left: number[][] = [];
  const right: number[][] = [];
  for (let index = 0; index < count; index += 1) {
    const { x, y } = samples[index];
    const radius = radii[index];
    if (index > 0 && index < count - 1) {
      const incoming = unit(x - samples[index - 1].x, y - samples[index - 1].y);
      const outgoing = unit(samples[index + 1].x - x, samples[index + 1].y - y);
      if (incoming[0] * outgoing[0] + incoming[1] * outgoing[1] < 0.7) {
        const cross = incoming[0] * outgoing[1] - incoming[1] * outgoing[0];
        const outer = cross > 0 ? right : left;
        const base = cross > 0 ? normalAngles[index] + Math.PI : normalAngles[index];
        const previous = cross > 0 ? normalAngles[index - 1] + Math.PI : normalAngles[index - 1];
        const delta = normalizeAngle(base - previous);
        for (let step = 1; step <= 3; step += 1) {
          const angle = previous + (delta * step) / 4;
          outer.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
        }
      }
    }
    const nx = -tangents[index][1];
    const ny = tangents[index][0];
    left.push([x + nx * radius, y + ny * radius]);
    right.push([x - nx * radius, y - ny * radius]);
  }

  const startCap = arc([samples[0].x, samples[0].y], radii[0], normalAngles[0] + Math.PI, -Math.PI, CAP_STEPS, false);
  const endCap = arc(
    [samples[count - 1].x, samples[count - 1].y],
    radii[count - 1],
    normalAngles[count - 1],
    -Math.PI,
    CAP_STEPS,
    true,
  ).slice(1, -1);
  // The reversed right edge starts at the end cap's far side; drop its last
  // point, which the start cap already produced as the closing point.
  const backEdge = right.slice().reverse().slice(0, -1);

  return [...startCap, ...left, ...endCap, ...backEdge];
}

function circleOutline(cx: number, cy: number, radius: number): number[][] {
  const points: number[][] = [];
  const steps = 32;
  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}

/** Deterministic variable-width outline in millimetres. */
export function inkOutline(points: InkPoint[], thicknessMm: number, options: InkOutlineOptions = {}): number[][] {
  const clean = dedupe(points);
  if (clean.length === 0) return [];
  const thinning = options.thinning ?? 0.45;
  if (clean.length === 1 || polylineLength(clean) < MIN_STROKE_MM) {
    return circleOutline(clean[0][0], clean[0][1], radiusForPressure(clean[0][2], thicknessMm, thinning));
  }
  return ribbonOutline(buildSpine(buildSegments(clean), thicknessMm), thicknessMm, thinning);
}

function roundMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function outlineToPath(outline: number[][]): string {
  if (outline.length === 0) return "";
  const parts = [`M ${roundMm(outline[0][0])} ${roundMm(outline[0][1])}`];
  for (let index = 1; index < outline.length; index += 1) {
    parts.push(`L ${roundMm(outline[index][0])} ${roundMm(outline[index][1])}`);
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

/**
 * Fixed upright nib half-extents. A chisel never rotates with the hand: the
 * nib is always axis-aligned, so only the swept rectangle changes.
 */
export function markerNibSize(tipStyle: MarkerTip = "vertical", thicknessMm: number): { halfW: number; halfH: number } {
  const thickness = Math.max(0, thicknessMm);
  if (tipStyle === "horizontal") return { halfW: Math.max(0.25, thickness * 0.5), halfH: Math.max(0.25, thickness * 0.14) };
  if (tipStyle === "vertical") return { halfW: Math.max(0.25, thickness * 0.14), halfH: Math.max(0.25, thickness * 0.5) };
  return { halfW: Math.max(0.25, thickness * 0.5), halfH: Math.max(0.25, thickness * 0.5) };
}

function uprightRectPath(cx: number, cy: number, halfW: number, halfH: number): string {
  return [
    `M ${roundMm(cx - halfW)} ${roundMm(cy - halfH)}`,
    `L ${roundMm(cx + halfW)} ${roundMm(cy - halfH)}`,
    `L ${roundMm(cx + halfW)} ${roundMm(cy + halfH)}`,
    `L ${roundMm(cx - halfW)} ${roundMm(cy + halfH)}`,
    "Z",
  ].join(" ");
}

/** Clockwise convex hull of an upright nib swept from A to B (SVG y-down). */
function sweptRectPath(a: Pt, b: Pt, halfW: number, halfH: number): string {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  let corners: number[][];
  if (dx >= 0 && dy >= 0) {
    corners = [
      [ax - halfW, ay - halfH],
      [ax + halfW, ay - halfH],
      [bx + halfW, by - halfH],
      [bx + halfW, by + halfH],
      [bx - halfW, by + halfH],
      [ax - halfW, ay + halfH],
    ];
  } else if (dx >= 0) {
    corners = [
      [ax - halfW, ay - halfH],
      [bx - halfW, by - halfH],
      [bx + halfW, by - halfH],
      [bx + halfW, by + halfH],
      [ax + halfW, ay + halfH],
      [ax - halfW, ay + halfH],
    ];
  } else if (dy >= 0) {
    corners = [
      [bx - halfW, by - halfH],
      [ax - halfW, ay - halfH],
      [ax + halfW, ay - halfH],
      [ax + halfW, ay + halfH],
      [bx + halfW, by + halfH],
      [bx - halfW, by + halfH],
    ];
  } else {
    corners = [
      [bx - halfW, by - halfH],
      [bx + halfW, by - halfH],
      [ax + halfW, ay - halfH],
      [ax + halfW, ay + halfH],
      [ax - halfW, ay + halfH],
      [bx - halfW, by + halfH],
    ];
  }
  return corners
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${roundMm(x)} ${roundMm(y)}`)
    .concat("Z")
    .join(" ");
}

/**
 * Highlighter geometry as one nonzero-fill path. Every swept upright nib is a
 * clockwise sub-path, so overlaps merge into a single uniform-opacity area.
 */
export function markerPath(points: InkPoint[], thicknessMm: number, tipStyle: MarkerTip = "vertical"): string {
  if (tipStyle === "ball") return inkPath(points, thicknessMm, { thinning: 0 });
  const clean = dedupe(points);
  if (clean.length === 0) return "";
  const { halfW, halfH } = markerNibSize(tipStyle, thicknessMm);
  if (clean.length === 1 || polylineLength(clean) < MIN_STROKE_MM) {
    return uprightRectPath(clean[0][0], clean[0][1], halfW, halfH);
  }
  const spine = buildSpine(buildSegments(clean), thicknessMm);
  const parts: string[] = [];
  for (let index = 1; index < spine.length; index += 1) {
    const previous = spine[index - 1];
    const current = spine[index];
    if (Math.hypot(current.x - previous.x, current.y - previous.y) < 1e-4) continue;
    parts.push(sweptRectPath([previous.x, previous.y], [current.x, current.y], halfW, halfH));
  }
  return parts.join(" ");
}

export function polylinePath(points: Pt[], closed = false): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  const parts = [`M ${first[0]} ${first[1]}`];
  for (const [x, y] of rest) parts.push(`L ${x} ${y}`);
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/**
 * Velocity-derived pressure so a mouse still produces calligraphic ink.
 * A batched sample with no elapsed time keeps the previous width instead of
 * jumping, and the band keeps the ends of a mouse stroke from balling up.
 */
export function pressureFromVelocity(previous: Pt | null, next: Pt, elapsedMs: number, prevPressure = 0.5): number {
  if (!previous || elapsedMs <= 0) return prevPressure;
  const speed = Math.hypot(next[0] - previous[0], next[1] - previous[1]) / elapsedMs;
  return Math.min(0.72, Math.max(0.35, 1 - speed * 0.55));
}

/** A pen reports real pressure; a mouse and touch report 0 or a flat 0.5. */
export function isRealPen(pointerType: string, pressure: number): boolean {
  return pointerType === "pen" && pressure > 0 && pressure !== 0.5;
}

export function pointerPressure(
  pointerType: string,
  pressure: number,
  previous: Pt | null,
  next: Pt,
  elapsedMs: number,
  prevPressure = 0.5,
): number {
  if (isRealPen(pointerType, pressure)) return Math.min(1, pressure);
  return pressureFromVelocity(previous, next, elapsedMs, prevPressure);
}

export interface InkPressureSample {
  pointerType: string;
  pressure: number;
  previous: Pt | null;
  next: Pt;
  elapsedMs: number;
  previousPressure: number;
  hasRealPressure: boolean;
}

/**
 * One coalesced sample's pressure. Real pen pressure always wins; a stylus
 * lift (pressure 0 or the flat 0.5) tapers to a fine point and never spikes.
 */
export function sampleInkPressure(sample: InkPressureSample): { pressure: number; hasRealPressure: boolean } {
  if (isRealPen(sample.pointerType, sample.pressure)) {
    return { pressure: Math.min(1, sample.pressure), hasRealPressure: true };
  }
  if (sample.hasRealPressure) {
    return { pressure: Math.min(sample.previousPressure, 0.08), hasRealPressure: true };
  }
  return {
    pressure: pressureFromVelocity(sample.previous, sample.next, sample.elapsedMs, sample.previousPressure),
    hasRealPressure: false,
  };
}

/**
 * A stroke must not start with a full-width blob. Pens keep their real pressure
 * inside a safe band; mouse and touch start at a neutral half-width.
 */
export function initialInkPressure(pointerType: string, pressure: number): number {
  if (isRealPen(pointerType, pressure)) return Math.min(0.8, Math.max(0.25, pressure));
  return 0.5;
}

/** Gentle exponential smoothing so width changes never show as lumps. */
export function smoothPressure(previous: number, target: number): number {
  return previous * 0.65 + target * 0.35;
}
