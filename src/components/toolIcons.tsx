import type { ComponentType } from "react";
import {
  ArrowUpRight,
  Camera,
  Circle,
  Crop,
  Eraser,
  Hand,
  Hexagon,
  Highlighter,
  Lasso,
  Minus,
  MousePointer2,
  Pen,
  Image as ImageIcon,
  Ruler,
  ScanLine,
  Sigma,
  Square,
  Stamp,
  Type,
} from "lucide-react";
import type { ToolId } from "../lib/types";

export type IconComponent = ComponentType<{ size?: number | string; strokeWidth?: number; className?: string }>;

/** One lucide glyph per tool, drawn at the app's 1.75 px stroke. */
export const TOOL_ICONS: Record<ToolId, IconComponent> = {
  hand: Hand,
  select: MousePointer2,
  lasso: Lasso,
  pen: Pen,
  marker: Highlighter,
  text: Type,
  line: Minus,
  arrow: ArrowUpRight,
  rectangle: Square,
  ellipse: Circle,
  polygon: Hexagon,
  dimension: Ruler,
  stamp: Stamp,
  eraser: Eraser,
  measure: ScanLine,
  formula: Sigma,
  crop: Crop,
  snapshot: Camera,
  image: ImageIcon,
};
