import { describe, expect, it } from "vitest";
import { CANVAS_TOUCH_ACTION, drawsWithPointer, pansFromBackground, pansWithPointer } from "./canvasInput";

describe("stylus and finger routing", () => {
  it("always lets a pen draw, even with finger drawing switched off", () => {
    expect(drawsWithPointer("pen", false)).toBe(true);
    expect(drawsWithPointer("mouse", false)).toBe(true);
    expect(drawsWithPointer("touch", false)).toBe(false);
    expect(drawsWithPointer("touch", true)).toBe(true);
  });

  it("never hands the canvas to native touch-action", () => {
    // Chromium cancels a pen stroke after 2-3px when touch-action is auto/pan.
    expect(CANVAS_TOUCH_ACTION).toBe("none");
  });

  it("pans with one finger while finger drawing is off or the hand tool is active", () => {
    expect(pansWithPointer("touch", false, false)).toBe(true);
    expect(pansWithPointer("touch", true, false)).toBe(false);
    expect(pansWithPointer("touch", true, true)).toBe(true);
    expect(pansWithPointer("pen", false, false)).toBe(false);
    expect(pansWithPointer("pen", false, true)).toBe(true);
  });

  it("always pans from the empty background, even with finger drawing on", () => {
    expect(pansFromBackground("touch", false, true, false)).toBe(true);
    expect(pansFromBackground("mouse", false, true, false)).toBe(true);
    // On the paper the drawing tool keeps the finger.
    expect(pansFromBackground("touch", true, true, false)).toBe(false);
    expect(pansFromBackground("touch", true, false, false)).toBe(true);
    // A pen is a drawing instrument everywhere.
    expect(pansFromBackground("pen", false, true, false)).toBe(false);
    expect(pansFromBackground("pen", false, true, true)).toBe(true);
  });
});
