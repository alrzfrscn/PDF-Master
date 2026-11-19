import { describe, expect, it } from "vitest";
import type { FormulaAnnotation, TextAnnotation } from "./annotationTypes";
import { annotationBounds, hitTest, regularPolygonPoints, rotateAnnotation, scaleAnnotation } from "./annotationGeometry";

const text: TextAnnotation = {
  id: "text-1",
  type: "text",
  xMm: 20,
  yMm: 30,
  widthMm: 60,
  heightMm: 16,
  text: "Hello",
  fontFamily: "Helvetica",
  fontSizePt: 12,
  textColor: "#101114",
  bold: false,
  italic: false,
  underline: false,
  strikeOut: false,
  align: "left",
  script: "normal",
  boxFillColor: "#ffffff",
  boxFillTransparent: true,
  frameType: 0,
  frameColor: "#101114",
  lineWidthMm: 0.4,
  autoFit: false,
  rotation: 0,
  opacity: 1,
};

const formula: FormulaAnnotation = {
  id: "formula-1",
  type: "formula",
  latex: "E = mc^2",
  xMm: 100,
  yMm: 40,
  widthMm: 40,
  heightMm: 20,
  color: "#0a84ff",
  fontSizePt: 14,
  fillColor: "#ffffff",
  fillTransparent: true,
  rotation: 0,
  opacity: 1,
};

describe("box annotation geometry", () => {
  it("bounds an unrotated text box by its frame", () => {
    expect(annotationBounds(text)).toEqual({ x: 20, y: 30, width: 60, height: 16 });
  });

  it("swaps width and height when the box is rotated 90°", () => {
    const bounds = annotationBounds({ ...text, rotation: 90 });
    expect(bounds.width).toBeCloseTo(16);
    expect(bounds.height).toBeCloseTo(60);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(50);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(38);
  });

  it("hit-tests inside a rotated formula and misses outside it", () => {
    const rotated = { ...formula, rotation: 90 };
    expect(hitTest(rotated, [120, 60])).toBe(true);
    expect(hitTest(rotated, [140, 40])).toBe(false);
  });

  it("grows the font with the box and keeps text centred", () => {
    const scaled = scaleAnnotation(text, [50, 38], 2, 2);
    expect(scaled.type).toBe("text");
    if (scaled.type !== "text") return;
    expect(scaled.widthMm).toBeCloseTo(120);
    expect(scaled.heightMm).toBeCloseTo(32);
    expect(scaled.fontSizePt).toBeCloseTo(24);
    expect(scaled.xMm + scaled.widthMm / 2).toBeCloseTo(50);
    expect(scaled.yMm + scaled.heightMm / 2).toBeCloseTo(38);
  });

  it("rotates text about its centre and normalises the angle", () => {
    const rotated = rotateAnnotation(text, [50, 38], 400);
    expect(rotated.type).toBe("text");
    if (rotated.type !== "text") return;
    expect(rotated.rotation).toBeCloseTo(40);
    expect(rotated.xMm + rotated.widthMm / 2).toBeCloseTo(50);
    expect(rotated.yMm + rotated.heightMm / 2).toBeCloseTo(38);
  });
});

describe("regular polygon drag", () => {
  it("fits a hexagon inside the drag box", () => {
    const points = regularPolygonPoints([10, 20], [60, 70], 6);
    expect(points).toHaveLength(6);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(x).toBeLessThanOrEqual(60 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(y).toBeLessThanOrEqual(70 + 1e-9);
    }
    expect(new Set(points.map(([x]) => Number(x.toFixed(4)))).size).toBeGreaterThan(2);
  });
});
