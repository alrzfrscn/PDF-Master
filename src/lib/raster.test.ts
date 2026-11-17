import { describe, expect, it } from "vitest";
import { computeCanvasCropRect } from "./raster";

describe("canvas crop rect", () => {
  it("maps a region onto a portrait A4 canvas using the page height for Y", () => {
    const rect = computeCanvasCropRect({ x: 0, y: 0, width: 210, height: 297 }, 2100, 2970, 210, 297);
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 2100, sh: 2970 });
  });

  it("samples the vertical axis by page height, not width", () => {
    const rect = computeCanvasCropRect({ x: 105, y: 148.5, width: 105, height: 148.5 }, 595, 842, 210, 297);
    expect(rect.sx).toBeCloseTo(297.5, 6);
    expect(rect.sy).toBeCloseTo(421, 6);
    expect(rect.sw).toBeCloseTo(297.5, 6);
    expect(rect.sh).toBeCloseTo(421, 6);
  });
});
