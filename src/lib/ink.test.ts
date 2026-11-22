import { describe, expect, it } from "vitest";
import { DOT_LENGTH_MM, initialInkPressure, inkOutline, inkPath, isDotStroke, penStyleOptions, smoothPressure } from "./ink";

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
