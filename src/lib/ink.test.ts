import { describe, expect, it } from "vitest";
import {
  DOT_LENGTH_MM,
  initialInkPressure,
  inkOutline,
  inkPath,
  isDotStroke,
  markerNibSize,
  markerPath,
  penStyleOptions,
  pressureFromVelocity,
  sampleInkPressure,
  smoothPressure,
} from "./ink";
import type { InkPoint } from "./annotationTypes";

describe("pen styles", () => {
  it("keeps basic ink at a fixed width", () => {
    expect(penStyleOptions("basic", 100)).toMatchObject({ thinning: 0, smoothing: 0.3, streamline: 0.2 });
    expect(penStyleOptions("basic", 0).simulatePressure).toBe(false);
  });

  it("maps the pressure level to pro and calligraphy thinning", () => {
    expect(penStyleOptions("pro", 55)).toMatchObject({ thinning: 0.45 * 0.55, smoothing: 0.38, streamline: 0.28 });
    expect(penStyleOptions("pro", 0).thinning).toBe(0);
    expect(penStyleOptions("calligraphy", 85)).toMatchObject({ thinning: 0.65 * 0.85, smoothing: 0.45, streamline: 0.35 });
    expect(penStyleOptions("calligraphy", 100).thinning).toBeCloseTo(0.65);
  });

  it("clamps the pressure level to 0..100", () => {
    expect(penStyleOptions("pro", -20).thinning).toBe(0);
    expect(penStyleOptions("pro", 240).thinning).toBeCloseTo(0.45);
  });

  it("caps both ends with no taper", () => {
    const long: [number, number, number][] = Array.from({ length: 20 }, (_, index) => [index * 2, index, 0.6]);
    const stroke = inkOutline(long, 2);
    expect(stroke.length).toBeGreaterThan(2);
    expect(stroke[0]).not.toEqual(stroke[stroke.length - 1]);
  });
});

describe("ink pressure", () => {
  it("starts mouse and touch at neutral half width", () => {
    expect(initialInkPressure("mouse", 0.5)).toBe(0.5);
    expect(initialInkPressure("touch", 0.25)).toBe(0.5);
  });

  it("keeps stylus pressure inside a safe band", () => {
    expect(initialInkPressure("pen", 0.1)).toBe(0.25);
    expect(initialInkPressure("pen", 0.7)).toBe(0.7);
    expect(initialInkPressure("pen", 1)).toBe(0.8);
  });

  it("smooths pressure exponentially", () => {
    expect(smoothPressure(0.5, 1)).toBeCloseTo(0.675);
    expect(smoothPressure(1, 0)).toBeCloseTo(0.65);
  });
});

describe("dot strokes", () => {
  it("treats a single point as a dot", () => {
    expect(isDotStroke([[10, 10, 0.5]])).toBe(true);
  });

  it("treats a path under the dot threshold as a dot", () => {
    expect(isDotStroke([[0, 0, 0.5], [0, DOT_LENGTH_MM / 2, 0.5]])).toBe(true);
    expect(isDotStroke([[0, 0, 0.5], [0, DOT_LENGTH_MM * 2, 0.5]])).toBe(false);
  });

  it("draws a dot as a circle of 0.45 × the pen width", () => {
    const path = inkPath([[10, 20, 0.5]], 4);
    expect(path).toContain(`M ${10 - 1.8} 20`);
    expect(path).toContain("a 1.8 1.8");
  });
});

describe("ribbon invariants", () => {
  const curve: InkPoint[] = Array.from({ length: 12 }, (_, index) => [index * 2, 0.02 * index * index, 0.55]);

  it("never moves earlier vertices when points are appended", () => {
    const options = { thinning: 0.45, simulatePressure: false };
    const short = inkOutline(curve.slice(0, 6), 1.5, options);
    const long = inkOutline(curve, 1.5, options);
    // The first 8 vertices are the round start cap; the left edge follows.
    const cap = 8;
    for (let index = 0; index < 10; index += 1) {
      expect(long[cap + index][0]).toBeCloseTo(short[cap + index][0], 5);
      expect(long[cap + index][1]).toBeCloseTo(short[cap + index][1], 5);
    }
  });

  it("keeps a 0.5 mm two-point stroke inside the pen band", () => {
    const outline = inkOutline(
      [
        [0, 0, 0.5],
        [0.5, 0, 0.5],
      ],
      1.5,
      { thinning: 0 },
    );
    expect(outline.length).toBeGreaterThan(8);
    for (const [x, y] of outline) {
      const nearestX = Math.min(0.5, Math.max(0, x));
      expect(Math.hypot(x - nearestX, y)).toBeLessThanOrEqual(1.5 * 0.7);
    }
  });

  it("keeps a basic pen at exactly half the nib width", () => {
    const points: InkPoint[] = [
      [0, 0, 0.1],
      [1, 0, 1],
      [2, 0, 0.2],
      [3, 0, 0.9],
    ];
    const outline = inkOutline(points, 2, { thinning: 0 });
    const half = 1;
    for (const [x, y] of outline) {
      const nearestX = Math.min(3, Math.max(0, x));
      expect(Math.hypot(x - nearestX, y)).toBeLessThanOrEqual(half + 1e-9);
    }
    const ys = outline.map(([, y]) => y);
    expect(Math.max(...ys)).toBeCloseTo(half, 6);
    expect(Math.min(...ys)).toBeCloseTo(-half, 6);
  });
});

describe("stylus lift pressure", () => {
  it("tapers a lifting real pen instead of spiking", () => {
    let hasRealPressure = true;
    let previousPressure = 0.4;
    const pressures: number[] = [];
    for (const raw of [0.1, 0]) {
      const sample = sampleInkPressure({
        pointerType: "pen",
        pressure: raw,
        previous: [0, 0],
        next: [0.2, 0],
        elapsedMs: 4,
        previousPressure,
        hasRealPressure,
      });
      hasRealPressure = sample.hasRealPressure;
      previousPressure = sample.pressure;
      pressures.push(sample.pressure);
    }
    expect(pressures[0]).toBeCloseTo(0.1);
    expect(pressures[1]).toBeLessThanOrEqual(0.1);
    expect(Math.max(...pressures)).toBeLessThanOrEqual(0.1);
  });

  it("keeps the previous width for a batched sample with no elapsed time", () => {
    expect(pressureFromVelocity([0, 0], [1, 0], 0, 0.62)).toBeCloseTo(0.62);
    expect(
      sampleInkPressure({
        pointerType: "mouse",
        pressure: 0.5,
        previous: [0, 0],
        next: [1, 0],
        elapsedMs: 0,
        previousPressure: 0.62,
        hasRealPressure: false,
      }).pressure,
    ).toBeCloseTo(0.62);
  });

  it("keeps simulated mouse pressure inside the balanced band", () => {
    expect(pressureFromVelocity([0, 0], [10, 0], 1, 0.5)).toBeCloseTo(0.35);
    expect(pressureFromVelocity([0, 0], [0.01, 0], 1000, 0.5)).toBeCloseTo(0.72);
  });
});

function markerSubpaths(path: string): string[] {
  return path
    .split("M ")
    .filter(Boolean)
    .map((part) => `M ${part.trim()}`);
}

function vertices(path: string): number[][] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).reduce<number[][]>((pairs, value, index, all) => {
    if (index % 2 === 0) pairs.push([value, all[index + 1]]);
    return pairs;
  }, []);
}

function signedArea(polygon: number[][]): number {
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const [x1, y1] = polygon[index];
    const [x2, y2] = polygon[(index + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

describe("chisel marker nibs", () => {
  const tips = ["vertical", "horizontal", "squared"] as const;

  it("defines upright nib extents that never depend on stroke direction", () => {
    expect(markerNibSize("vertical", 10).halfW).toBeCloseTo(1.4);
    expect(markerNibSize("vertical", 10).halfH).toBeCloseTo(5);
    expect(markerNibSize("horizontal", 10).halfW).toBeCloseTo(5);
    expect(markerNibSize("horizontal", 10).halfH).toBeCloseTo(1.4);
    expect(markerNibSize("squared", 10)).toEqual({ halfW: 5, halfH: 5 });
    expect(markerNibSize("ball", 10)).toEqual({ halfW: 5, halfH: 5 });
  });

  it("delegates the ball tip to the fixed-width round ribbon", () => {
    const points: InkPoint[] = [
      [0, 0, 0.5],
      [10, 4, 0.7],
      [20, 0, 0.3],
    ];
    expect(markerPath(points, 6, "ball")).toBe(inkPath(points, 6, { thinning: 0 }));
  });

  it("draws a single tap as an exact upright rectangle", () => {
    for (const tip of tips) {
      const nib = markerNibSize(tip, 10);
      const parts = markerSubpaths(markerPath([[10, 20, 0.5]], 10, tip));
      expect(parts).toHaveLength(1);
      const corners = vertices(parts[0]);
      expect(corners).toHaveLength(4);
      expect(Math.min(...corners.map(([x]) => x))).toBeCloseTo(10 - nib.halfW, 6);
      expect(Math.max(...corners.map(([x]) => x))).toBeCloseTo(10 + nib.halfW, 6);
      expect(Math.min(...corners.map(([, y]) => y))).toBeCloseTo(20 - nib.halfH, 6);
      expect(Math.max(...corners.map(([, y]) => y))).toBeCloseTo(20 + nib.halfH, 6);
    }
  });

  it("keeps every vertex inside the exact upright nib band", () => {
    const { halfW, halfH } = markerNibSize("vertical", 10);
    const path = markerPath(
      [
        [10, 20, 0.5],
        [40, 20, 0.5],
      ],
      10,
      "vertical",
    );
    const all = vertices(path);
    expect(all.length).toBeGreaterThan(8);
    for (const [x, y] of all) {
      expect(x).toBeGreaterThanOrEqual(10 - halfW - 1e-6);
      expect(x).toBeLessThanOrEqual(40 + halfW + 1e-6);
      expect(y).toBeGreaterThanOrEqual(20 - halfH - 1e-6);
      expect(y).toBeLessThanOrEqual(20 + halfH + 1e-6);
    }
    expect(Math.max(...all.map(([, y]) => y))).toBeCloseTo(20 + halfH, 6);
    expect(Math.min(...all.map(([, y]) => y))).toBeCloseTo(20 - halfH, 6);
  });

  it("never moves earlier sub-paths when points are appended", () => {
    const curve: InkPoint[] = Array.from({ length: 12 }, (_, index) => [index * 20, 0.4 * index * index, 0.55]);
    for (const tip of tips) {
      const short = markerSubpaths(markerPath(curve.slice(0, 8), 10, tip));
      const long = markerSubpaths(markerPath(curve, 10, tip));
      // Only the final quadratic segment changes, and it emits at most 16 hulls.
      const stable = short.length - 16;
      expect(stable).toBeGreaterThan(0);
      for (let index = 0; index < stable; index += 1) expect(long[index]).toBe(short[index]);
    }
  });

  it("winds every swept hull clockwise for nonzero fill", () => {
    const curve: InkPoint[] = Array.from({ length: 10 }, (_, index) => [index * 6, Math.sin(index) * 8, 0.5]);
    for (const tip of tips) {
      const parts = markerSubpaths(markerPath(curve, 8, tip));
      expect(parts.length).toBeGreaterThan(4);
      for (const part of parts) expect(signedArea(vertices(part))).toBeGreaterThan(0);
    }
  });
});
