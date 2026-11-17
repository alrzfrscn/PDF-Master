import { describe, expect, it } from "vitest";
import {
  angleAt,
  calibrateDenominator,
  customScaleLabel,
  distanceStats,
  formatArea,
  formatLength,
  polygonArea,
  polylineLength,
} from "./measure";

describe("measurement maths", () => {
  it("measures distance, angle and components", () => {
    const stats = distanceStats([0, 0], [30, 40]);
    expect(stats.distance).toBeCloseTo(50);
    expect(stats.dx).toBe(30);
    expect(stats.dy).toBe(40);
    expect(stats.angle).toBeCloseTo(53.13, 1);
  });

  it("formats lengths through the page scale and unit", () => {
    expect(formatLength(50, 1, "mm")).toBe("50 mm");
    expect(formatLength(50, 10, "cm")).toBe("50 cm");
    expect(formatLength(25.4, 1, "in")).toBe("1 in");
  });

  it("formats areas through the squared scale", () => {
    expect(formatArea(1000, 1, "cm")).toBe("10 cm²");
    expect(formatArea(100, 10, "m")).toBe("0.01 m²");
  });

  it("measures polyline length and shoelace area", () => {
    expect(polylineLength([[0, 0], [3, 4], [3, 10]])).toBeCloseTo(11);
    expect(polygonArea([[0, 0], [10, 0], [10, 10], [0, 10]])).toBeCloseTo(100);
    expect(polygonArea([[0, 0], [1, 1]])).toBe(0);
  });

  it("measures the angle at a vertex", () => {
    expect(angleAt([1, 0], [0, 0], [0, 1])).toBeCloseTo(90);
    expect(angleAt([1, 0], [0, 0], [-1, 0])).toBeCloseTo(180);
    expect(angleAt([0, 0], [0, 0], [1, 0])).toBe(0);
  });

  it("calibrates a scale denominator and labels it", () => {
    expect(calibrateDenominator(50, 500, "mm")).toBeCloseTo(10);
    expect(calibrateDenominator(50, 5, "m")).toBeCloseTo(100);
    expect(calibrateDenominator(0, 5, "mm")).toBeNull();
    expect(calibrateDenominator(50, 0, "mm")).toBeNull();
    expect(customScaleLabel(12.5)).toBe("1:12.5");
  });
});
