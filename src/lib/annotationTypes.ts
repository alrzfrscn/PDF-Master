import type { LineStyleName } from "./types";

/** Page-local millimetres, never pixels: 0..pageWidthMm / 0..pageHeightMm. */
export type Pt = [number, number];

/** `[xMm, yMm, pressure]` — pressure is 0..1 and only used for ink rendering. */
export type InkPoint = [number, number, number];

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AnnotationBase {
  id: string;
  /** Shared id for a group; annotations in a group select and move together. */
  groupId?: string | null;
  locked?: boolean;
  hidden?: boolean;
}

export interface PenAnnotation extends AnnotationBase {
  type: "pen";
  points: InkPoint[];
  color: string;
  thicknessMm: number;
  opacity: number;
  sensitivity: boolean;
  smoothed: boolean;
}

export type MarkerTip = "vertical" | "horizontal" | "squared" | "ball";

export interface MarkerAnnotation extends AnnotationBase {
  type: "marker";
  points: InkPoint[];
  color: string;
  thicknessMm: number;
  opacity: number;
  tipStyle: MarkerTip;
}

export type ShapeType = "line" | "arrow" | "rectangle" | "ellipse" | "polygon" | "dimension";
export type DimensionUnit = "mm" | "cm" | "in";

export interface ShapeAnnotation extends AnnotationBase {
  type: "shape";
  shapeType: ShapeType;
  start: Pt;
  end: Pt;
  /** Polygon vertices; empty for every other shape type. */
  points: Pt[];
  strokeColor: string;
  fillColor: string | null;
  fillTransparent: boolean;
  lineWidthMm: number;
  lineStyle: LineStyleName;
  opacity: number;
  arrowHead: number;
  arrowTail: number;
  dimensionUnit: DimensionUnit;
  dimensionScale: number;
}

export interface StampAnnotation extends AnnotationBase {
  type: "stamp";
  stampId: string;
  imageUrl: string;
  svgPath?: string | null;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  opacity: number;
}

export type Annotation = PenAnnotation | MarkerAnnotation | ShapeAnnotation | StampAnnotation;
export type AnnotationType = Annotation["type"];

/** Loose property patch used by the Inspector across mixed selections. */
export interface AnnotationPatch {
  color?: string;
  thicknessMm?: number;
  strokeColor?: string;
  lineWidthMm?: number;
  opacity?: number;
  fillColor?: string | null;
  fillTransparent?: boolean;
  lineStyle?: LineStyleName;
  arrowHead?: number;
  arrowTail?: number;
  dimensionUnit?: DimensionUnit;
  dimensionScale?: number;
  tipStyle?: MarkerTip;
  locked?: boolean;
  hidden?: boolean;
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

export const SHAPE_LABEL: Record<ShapeType, string> = {
  line: "Line",
  arrow: "Arrow",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  polygon: "Polygon",
  dimension: "Dimension",
};

export function isInk(annotation: Annotation): annotation is PenAnnotation | MarkerAnnotation {
  return annotation.type === "pen" || annotation.type === "marker";
}
