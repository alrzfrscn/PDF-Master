import type { ShapeTool, ToolId } from "./types";

export interface ToolMeta {
  id: ToolId;
  name: string;
  shortcut: string;
  needsProperties: boolean;
  hint: string;
}

export const TOOLS: ToolMeta[] = [
  { id: "hand", name: "Hand", shortcut: "H", needsProperties: false, hint: "Pan the page. Hold Space anywhere." },
  { id: "select", name: "Select", shortcut: "V", needsProperties: false, hint: "Select, move and resize annotations." },
  { id: "lasso", name: "Lasso", shortcut: "Q", needsProperties: false, hint: "Freeform selection." },
  { id: "pen", name: "Pen", shortcut: "P", needsProperties: true, hint: "Vector ink with pressure width." },
  { id: "marker", name: "Highlighter", shortcut: "M", needsProperties: true, hint: "Broad marker. Its ink is never synchronised." },
  { id: "text", name: "Text", shortcut: "T", needsProperties: true, hint: "Text box with fill, frame and type styles." },
  { id: "line", name: "Line", shortcut: "L", needsProperties: true, hint: "Straight line, snapped to 15° with Shift." },
  { id: "arrow", name: "Arrow", shortcut: "A", needsProperties: true, hint: "Line with head and tail shapes." },
  { id: "rectangle", name: "Rectangle", shortcut: "R", needsProperties: true, hint: "Shift for a square." },
  { id: "ellipse", name: "Ellipse", shortcut: "O", needsProperties: true, hint: "Shift for a circle." },
  { id: "polygon", name: "Polygon", shortcut: "G", needsProperties: true, hint: "Click to add points, Enter to close." },
  { id: "dimension", name: "Dimension", shortcut: "D", needsProperties: true, hint: "Calibrated distance and area." },
  { id: "stamp", name: "Stamp", shortcut: "S", needsProperties: true, hint: "464 factory stamps plus your own." },
  { id: "eraser", name: "Eraser", shortcut: "E", needsProperties: false, hint: "Whole annotation or split strokes." },
  { id: "measure", name: "Measure", shortcut: "U", needsProperties: false, hint: "Distance, perimeter, area and angle." },
  { id: "formula", name: "Formula", shortcut: "F", needsProperties: true, hint: "LaTeX expressions as ink." },
  { id: "crop", name: "Crop", shortcut: "C", needsProperties: false, hint: "Crop the page box." },
  { id: "snapshot", name: "Snapshot", shortcut: "⇧S", needsProperties: false, hint: "Copy a region or save it as a stamp." },
];

export const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

export const SHAPE_TOOLS: ShapeTool[] = ["line", "arrow", "rectangle", "ellipse", "polygon", "dimension"];

export function isShapeTool(tool: ToolId): tool is ShapeTool {
  return (SHAPE_TOOLS as ToolId[]).includes(tool);
}

/** Toolbar order; `shapes` is the one virtual button that opens the shape palette. */
export type ToolbarEntry = ToolId | "shapes";
export const TOOLBAR: ToolbarEntry[][] = [
  ["hand", "select", "lasso"],
  ["pen", "marker", "text", "shapes"],
  ["stamp", "eraser"],
  ["measure", "formula", "crop", "snapshot"],
];

export const SIDEBAR_TABS = [
  { id: "pages", label: "Pages" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "annotations", label: "Annotations" },
  { id: "favorites", label: "Favourites" },
] as const;

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
