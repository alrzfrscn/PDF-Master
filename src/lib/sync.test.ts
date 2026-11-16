import { describe, expect, it } from "vitest";
import { applyToolPatch, syncTargets } from "./sync";
import type { ToolId, ToolProps } from "./types";

const BASE: ToolProps = {
  color: "#000000",
  thicknessMm: 1,
  opacity: 1,
  lineStyle: "solid",
  arrowHead: 0,
  arrowTail: 0,
  fill: null,
  fontSize: 10,
  fontName: "Arial",
  bold: false,
  italic: false,
  underline: false,
  pressureSensitive: true,
  smoothing: false,
};

const TOOLS: ToolId[] = [
  "hand", "select", "lasso", "pen", "marker", "text", "line", "arrow", "rectangle",
  "ellipse", "polygon", "dimension", "stamp", "eraser", "measure", "formula", "crop", "snapshot",
];

function all(): Record<ToolId, ToolProps> {
  return Object.fromEntries(TOOLS.map((tool) => [tool, { ...BASE }])) as Record<ToolId, ToolProps>;
}

describe("tool property synchronisation", () => {
  it("keeps every tool separate when sync is off", () => {
    const next = applyToolPatch(all(), "pen", { color: "#ff0000" }, false);
    expect(next.pen.color).toBe("#ff0000");
    expect(next.text.color).toBe("#000000");
    expect(next.arrow.color).toBe("#000000");
  });

  it("syncs colour and width from Pen, and never touches Marker", () => {
    const next = applyToolPatch(all(), "pen", { color: "#ff0000", thicknessMm: 2.4 }, true);
    for (const tool of ["pen", "text", "line", "arrow", "rectangle", "ellipse", "polygon", "dimension", "formula"] as ToolId[]) {
      expect(next[tool].color, tool).toBe("#ff0000");
      expect(next[tool].thicknessMm, tool).toBe(2.4);
    }
    expect(next.marker.color).toBe("#000000");
    expect(next.marker.thicknessMm).toBe(1);
  });

  it("does not broadcast changes made on Marker", () => {
    const next = applyToolPatch(all(), "marker", { color: "#ffff00", thicknessMm: 16 }, true);
    expect(next.marker.color).toBe("#ffff00");
    expect(next.pen.color).toBe("#000000");
    expect(next.ellipse.thicknessMm).toBe(1);
  });

  it("syncs line style only across line and arrow", () => {
    expect(syncTargets("lineStyle", "line", true)).toEqual(["line", "arrow"]);
    const next = applyToolPatch(all(), "line", { lineStyle: "dash" }, true);
    expect(next.line.lineStyle).toBe("dash");
    expect(next.arrow.lineStyle).toBe("dash");
    expect(next.rectangle.lineStyle).toBe("solid");
    expect(next.pen.lineStyle).toBe("solid");
  });

  it("syncs fill and opacity only across the area shapes", () => {
    const next = applyToolPatch(all(), "rectangle", { fill: "#00ff00", opacity: 0.5 }, true);
    for (const tool of ["rectangle", "ellipse", "polygon"] as ToolId[]) {
      expect(next[tool].fill, tool).toBe("#00ff00");
      expect(next[tool].opacity, tool).toBe(0.5);
    }
    expect(next.line.fill).toBeNull();
    expect(next.pen.opacity).toBe(1);
  });

  it("leaves fields outside the contract alone", () => {
    const next = applyToolPatch(all(), "text", { fontSize: 18 }, true);
    expect(next.text.fontSize).toBe(18);
    expect(next.pen.fontSize).toBe(10);
  });
});
