import { describe, expect, it } from "vitest";
import { penStyleOptions } from "./ink";

describe("pen styles", () => {
  it("keeps basic ink at a fixed width", () => {
    expect(penStyleOptions("basic", 100).thinning).toBe(0);
    expect(penStyleOptions("basic", 0).simulatePressure).toBe(false);
  });

  it("maps the pressure level to pro and calligraphy thinning", () => {
    expect(penStyleOptions("pro", 55).thinning).toBeCloseTo(0.55);
    expect(penStyleOptions("pro", 0).thinning).toBe(0);
    expect(penStyleOptions("calligraphy", 85).thinning).toBeCloseTo(0.85);
    expect(penStyleOptions("calligraphy", 100).thinning).toBe(1);
  });

  it("clamps the pressure level to 0..100", () => {
    expect(penStyleOptions("pro", -20).thinning).toBe(0);
    expect(penStyleOptions("pro", 240).thinning).toBe(1);
  });

  it("smoothes calligraphy ink harder than pro", () => {
    expect(penStyleOptions("calligraphy", 85).smoothing).toBeGreaterThan(penStyleOptions("pro", 55).smoothing);
  });
});
