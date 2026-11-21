import { describe, expect, it } from "vitest";
import { PX_PER_MM, clampPan, getWorkspaceInsets, workspaceSafeArea } from "./paper";

const VIEWPORT = 1600;
const A4_WIDTH_PX = 210 * PX_PER_MM;

describe("workspace insets", () => {
  it("follows the floating chrome on the left", () => {
    expect(getWorkspaceInsets({}).leftInset).toBe(68);
    expect(getWorkspaceInsets({ favoritesOpen: true }).leftInset).toBe(124);
    expect(getWorkspaceInsets({ sidebarOpen: true }).leftInset).toBe(348);
    expect(getWorkspaceInsets({ sidebarOpen: true, favoritesOpen: true }).leftInset).toBe(404);
  });

  it("makes room for a pinned inspector on the right", () => {
    expect(getWorkspaceInsets({}).rightInset).toBe(76);
    // An unpinned tool popover floats over the page and closes on the first stroke.
    expect(getWorkspaceInsets({ inspectorOpen: true }).rightInset).toBe(76);
    expect(getWorkspaceInsets({ inspectorOpen: true, inspectorPinned: true }).rightInset).toBe(410);
  });
});

describe("safe-area centring", () => {
  it("centres between the rails for every open/closed combination", () => {
    for (const sidebarOpen of [false, true]) {
      for (const favoritesOpen of [false, true]) {
        const { leftInset, rightInset } = getWorkspaceInsets({ sidebarOpen, favoritesOpen });
        const { safeWidth, safeCenterX } = workspaceSafeArea(VIEWPORT, leftInset, rightInset);
        expect(safeWidth).toBe(VIEWPORT - leftInset - rightInset);
        expect(safeCenterX).toBe(leftInset + (VIEWPORT - leftInset - rightInset) / 2);
      }
    }
  });

  it("fit to width keeps the page inside the rails, never at x = 0", () => {
    for (const sidebarOpen of [false, true]) {
      for (const favoritesOpen of [false, true]) {
        const { leftInset, rightInset } = getWorkspaceInsets({ sidebarOpen, favoritesOpen });
        const { safeWidth, safeCenterX } = workspaceSafeArea(VIEWPORT, leftInset, rightInset);
        const zoom = (safeWidth - 24) / A4_WIDTH_PX;
        const pageWidth = A4_WIDTH_PX * zoom;
        const left = safeCenterX - pageWidth / 2;
        const right = safeCenterX + pageWidth / 2;
        expect(left).toBeCloseTo(leftInset + 12);
        expect(right).toBeCloseTo(VIEWPORT - rightInset - 12);
        expect(left).toBeGreaterThanOrEqual(leftInset);
      }
    }
  });

  it("fit to page stays centred in the same strip", () => {
    const { leftInset, rightInset } = getWorkspaceInsets({ favoritesOpen: true });
    const { safeWidth, safeCenterX } = workspaceSafeArea(VIEWPORT, leftInset, rightInset);
    const rowHeightPx = 297 * PX_PER_MM;
    const zoom = Math.min((safeWidth - 24) / A4_WIDTH_PX, (900 - 16) / rowHeightPx);
    const pageWidth = A4_WIDTH_PX * zoom;
    expect(pageWidth).toBeLessThanOrEqual(safeWidth - 24);
    expect(safeCenterX - pageWidth / 2).toBeGreaterThanOrEqual(leftInset);
  });

  it("keeps a usable strip on a very narrow window", () => {
    expect(workspaceSafeArea(400, 404, 76).safeWidth).toBe(200);
  });
});

describe("pan clamping", () => {
  const viewportWidth = 1600;
  const viewportHeight = 900;
  const { leftInset, rightInset } = getWorkspaceInsets({});
  const safeWidth = viewportWidth - leftInset - rightInset;

  it("keeps a fitted single page near the safe centre", () => {
    const pageWidth = 400;
    const pageHeight = 400;
    const clamped = clampPan(
      { x: 9999, y: -9999 },
      pageWidth,
      pageHeight,
      viewportWidth,
      viewportHeight,
      leftInset,
      rightInset,
    );
    expect(clamped.x).toBeCloseTo(safeWidth * 0.35);
    expect(clamped.y).toBeCloseTo(-viewportHeight * 0.35);
  });

  it("lets a zoomed page pan but never off the safe strip", () => {
    const rowWidth = safeWidth * 2;
    const clamped = clampPan({ x: 99999, y: 0 }, rowWidth, 2000, viewportWidth, viewportHeight, leftInset, rightInset);
    expect(clamped.x).toBeCloseTo((rowWidth - safeWidth) / 2 + 48);
  });

  it("leaves a pan inside the bounds untouched", () => {
    const pan = { x: 20, y: -20 };
    expect(clampPan(pan, safeWidth * 2, 2000, viewportWidth, viewportHeight, leftInset, rightInset)).toEqual(pan);
  });

  it("clamps both axes symmetrically", () => {
    const rowHeight = viewportHeight * 2;
    const clamped = clampPan({ x: 0, y: -99999 }, 100, rowHeight, viewportWidth, viewportHeight, leftInset, rightInset);
    expect(clamped.y).toBeCloseTo(-((rowHeight - viewportHeight) / 2 + 48));
  });
});
