import { create } from "zustand";
import type { Pt } from "./annotationTypes";

export type MeasureMode = "distance" | "perimeter" | "area" | "angle";
export type MeasureUnit = "mm" | "cm" | "m" | "in" | "ft";

export interface MeasurementScale {
  id: string;
  label: string;
  /** One page millimetre represents this many real-world millimetres. */
  denominator: number;
}

export const MEASURE_MODES: { value: MeasureMode; label: string }[] = [
  { value: "distance", label: "Distance" },
  { value: "perimeter", label: "Perimeter" },
  { value: "area", label: "Area" },
  { value: "angle", label: "Angle" },
];

export const MEASURE_UNITS: { value: MeasureUnit; label: string }[] = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "m", label: "m" },
  { value: "in", label: "in" },
  { value: "ft", label: "ft" },
];

export const PRESET_SCALES: MeasurementScale[] = [1, 2, 10, 20, 50, 100, 500].map((denominator) => ({
  id: `scale-${denominator}`,
  label: `1:${denominator}`,
  denominator,
}));

const MM_PER_UNIT: Record<MeasureUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(2);
  return fixed.replace(/\.?0+$/, "") || "0";
}

export function toRealMm(pageMm: number, scaleDenominator: number): number {
  return pageMm * scaleDenominator;
}

export function formatLength(pageMm: number, scaleDenominator: number, unit: MeasureUnit): string {
  return `${formatNumber(toRealMm(pageMm, scaleDenominator) / MM_PER_UNIT[unit])} ${unit}`;
}

export function formatArea(pageMm2: number, scaleDenominator: number, unit: MeasureUnit): string {
  const factor = MM_PER_UNIT[unit] ** 2;
  return `${formatNumber((pageMm2 * scaleDenominator ** 2) / factor)} ${unit}²`;
}

export function polylineLength(points: Pt[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return total;
}

/** Shoelace area of a polygon in square millimetres. */
export function polygonArea(points: Pt[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Angle at `vertex` between the rays to `a` and `b`, in degrees (0..180). */
export function angleAt(a: Pt, vertex: Pt, b: Pt): number {
  const ax = a[0] - vertex[0];
  const ay = a[1] - vertex[1];
  const bx = b[0] - vertex[0];
  const by = b[1] - vertex[1];
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (denominator === 0) return 0;
  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / denominator));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export interface DistanceStats {
  distance: number;
  dx: number;
  dy: number;
  /** Screen/page angle of the segment in degrees, 0..360. */
  angle: number;
}

export function distanceStats(a: Pt, b: Pt): DistanceStats {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  return { distance: Math.hypot(dx, dy), dx, dy, angle };
}

/** Denominator from a calibration: `realLength` covers `pageLengthMm` on paper. */
export function calibrateDenominator(pageLengthMm: number, realLength: number, unit: MeasureUnit): number | null {
  if (pageLengthMm <= 0 || realLength <= 0) return null;
  return (realLength * MM_PER_UNIT[unit]) / pageLengthMm;
}

export function customScaleLabel(denominator: number): string {
  return `1:${formatNumber(denominator)}`;
}

const SCALES_KEY = "pm.measure.scales";
const ACTIVE_KEY = "pm.measure.scale";

function readScales(): MeasurementScale[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SCALES_KEY) ?? "[]") as MeasurementScale[];
    return Array.isArray(parsed) ? parsed.filter((scale) => scale && scale.denominator > 0) : [];
  } catch {
    return [];
  }
}

function readActive(): string {
  if (typeof localStorage === "undefined") return PRESET_SCALES[0].id;
  return localStorage.getItem(ACTIVE_KEY) ?? PRESET_SCALES[0].id;
}

interface ScaleState {
  custom: MeasurementScale[];
  activeId: string;
  addCustom: (scale: MeasurementScale) => void;
  setActive: (id: string) => void;
  all: () => MeasurementScale[];
  active: () => MeasurementScale;
}

export const useScaleStore = create<ScaleState>((set, get) => ({
  custom: readScales(),
  activeId: readActive(),
  addCustom: (scale) => {
    const custom = [...get().custom.filter((item) => item.id !== scale.id), scale];
    if (typeof localStorage !== "undefined") localStorage.setItem(SCALES_KEY, JSON.stringify(custom));
    set({ custom, activeId: scale.id });
    if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_KEY, scale.id);
  },
  setActive: (activeId) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_KEY, activeId);
    set({ activeId });
  },
  all: () => [...PRESET_SCALES, ...get().custom],
  active: () => get().all().find((scale) => scale.id === get().activeId) ?? PRESET_SCALES[0],
}));
