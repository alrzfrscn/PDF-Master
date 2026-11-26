import type { PaperTemplate } from "./types";

/** CSS pixels per millimetre at 100 % (96 dpi). */
export const PX_PER_MM = 96 / 25.4;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pageMm(template: PaperTemplate, landscape: boolean): { widthMm: number; heightMm: number } {
  const { widthMm, heightMm, landscape: sourceLandscape } = template.page;
  const flipped = landscape !== sourceLandscape;
  return flipped ? { widthMm: heightMm, heightMm: widthMm } : { widthMm, heightMm };
}

export interface PaperGeometry {
  widthMm: number;
  heightMm: number;
  color: string;
  widthStrokeMm: number;
  base: string;
  minor: string;
  major: string;
  hasGrid: boolean;
}

/**
 * Turns a parametric recipe into three SVG paths (base, every 5th, every 10th line).
 * `line` templates only rule horizontally; `karo`/`mm`/`grid` rule both ways.
 */
export function paperGeometry(template: PaperTemplate, landscape = false): PaperGeometry {
  const { widthMm, heightMm } = pageMm(template, landscape);
  const empty: PaperGeometry = {
    widthMm, heightMm, color: "#aaaaaa", widthStrokeMm: 0.1,
    base: "", minor: "", major: "", hasGrid: false,
  };
  const grid = template.grid;
  if (!grid) return empty;

  const bounds = template.bounds ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const x0 = bounds.left;
  const x1 = widthMm - bounds.right;
  const y0 = bounds.top;
  const y1 = heightMm - bounds.bottom;
  if (x1 <= x0 || y1 <= y0) return empty;

  const base: string[] = [];
  const minor: string[] = [];
  const major: string[] = [];

  const bucket = (index: number): string[] => {
    if (grid.highlightMajor && index % grid.highlightMajor === 0) return major;
    if (grid.highlightMinor && index % grid.highlightMinor === 0) return minor;
    return base;
  };
  const round = (value: number) => Number(value.toFixed(3));
  const horizontal = (step: number) => {
    for (let index = 1; y0 + index * step < y1; index += 1) {
      const y = round(y0 + index * step);
      bucket(index).push(`M${round(x0)} ${y}H${round(x1)}`);
    }
  };
  const vertical = (step: number) => {
    for (let index = 1; x0 + index * step < x1; index += 1) {
      const x = round(x0 + index * step);
      bucket(index).push(`M${x} ${round(y0)}V${round(y1)}`);
    }
  };

  if (grid.kind === "grid") {
    const step = grid.deltaMm ?? 5;
    horizontal(step);
    vertical(step);
  } else {
    if (grid.deltaYMm) horizontal(grid.deltaYMm);
    if (grid.deltaXMm) vertical(grid.deltaXMm);
  }

  return {
    ...empty,
    color: grid.color,
    widthStrokeMm: grid.widthMm,
    base: base.join(""),
    minor: minor.join(""),
    major: major.join(""),
    hasGrid: base.length + minor.length + major.length > 0,
  };
}

/** Horizontal space the floating chrome takes on each side of the page. */
export interface WorkspaceInsets {
  leftInset: number;
  rightInset: number;
}

/** Left rail 12+44, favourite dock 68..112, sidebar drawer to 332, inspector 398..718. */
export function getWorkspaceInsets({
  sidebarOpen = false,
  favoritesOpen = false,
  inspectorOpen = false,
  inspectorPinned = false,
  pagesCompactMode = false,
}: {
  sidebarOpen?: boolean;
  favoritesOpen?: boolean;
  inspectorOpen?: boolean;
  inspectorPinned?: boolean;
  /** The pages drawer is the narrow 104 px strip at x 68..172. */
  pagesCompactMode?: boolean;
}): WorkspaceInsets {
  const leftInset = sidebarOpen
    ? pagesCompactMode
      ? favoritesOpen
        ? 240
        : 184
      : favoritesOpen
        ? 404
        : 348
    : favoritesOpen
      ? 124
      : 68;
  const rightInset = inspectorOpen && inspectorPinned ? 410 : 76;
  return { leftInset, rightInset };
}

/** The page-safe strip between the rails: its width and its centre in viewport pixels. */
export function workspaceSafeArea(
  viewportWidth: number,
  leftInset: number,
  rightInset: number,
): { safeWidth: number; safeCenterX: number } {
  const safeWidth = Math.max(200, viewportWidth - leftInset - rightInset);
  return { safeWidth, safeCenterX: leftInset + safeWidth / 2 };
}

export interface PanOffset {
  x: number;
  y: number;
}

/**
 * Keeps a panned page on screen: a row that fits keeps a 12 px horizontal and
 * 16 px vertical margin, a larger row keeps 24 px beside the rail and 32 px
 * below the top bar.
 */
export function clampPan(
  pan: PanOffset,
  rowWidthPx: number,
  rowHeightPx: number,
  viewportWidth: number,
  viewportHeight: number,
  leftInset: number,
  rightInset: number,
): PanOffset {
  const { safeWidth } = workspaceSafeArea(viewportWidth, leftInset, rightInset);
  const fitWidth = safeWidth - 24;
  const fitHeight = viewportHeight - 32;
  const maxX = rowWidthPx <= fitWidth ? (fitWidth - rowWidthPx) / 2 : (rowWidthPx - safeWidth) / 2 + 24;
  const maxY = rowHeightPx <= fitHeight ? (fitHeight - rowHeightPx) / 2 : (rowHeightPx - viewportHeight) / 2 + 32;
  return { x: clamp(pan.x, -maxX, maxX), y: clamp(pan.y, -maxY, maxY) };
}
