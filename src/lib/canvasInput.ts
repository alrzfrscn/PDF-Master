/**
 * Chromium applies `touch-action` to pens as well as fingers, so the canvas keeps
 * `touch-action: none` in every mode; anything else cancels a stylus stroke after
 * a few pixels. Finger scrolling is therefore done in code, not by the browser.
 */
export const CANVAS_TOUCH_ACTION = "none";

/** A stylus or mouse always draws; a finger only when palm rejection is off. */
export function drawsWithPointer(pointerType: string, touchDrawEnabled: boolean): boolean {
  return pointerType !== "touch" || touchDrawEnabled;
}

/** One finger pans while finger drawing is off, or with the hand tool; pen and mouse never pan by drag. */
export function pansWithPointer(pointerType: string, touchDrawEnabled: boolean, canPan: boolean): boolean {
  if (pointerType === "touch") return !touchDrawEnabled || canPan;
  return canPan;
}

/**
 * A touch or mouse drag that starts on the empty workspace beside a page always
 * pans, even while finger drawing is on: the background is never a drawing surface.
 */
export function pansFromBackground(
  pointerType: string,
  onPaper: boolean,
  touchDrawEnabled: boolean,
  canPan: boolean,
): boolean {
  if (!onPaper && (pointerType === "touch" || pointerType === "mouse")) return true;
  return pansWithPointer(pointerType, touchDrawEnabled, canPan);
}
