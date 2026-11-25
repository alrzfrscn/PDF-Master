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

export type PenStyle = "basic" | "pro" | "calligraphy";

export interface PenAnnotation extends AnnotationBase {
  type: "pen";
  points: InkPoint[];
  color: string;
  thicknessMm: number;
  opacity: number;
  sensitivity: boolean;
  smoothed: boolean;
  /** Absent on ink drawn before Phase 7; the renderer falls back to sensitivity. */
  penStyle?: PenStyle;
  pressureLevel?: number;
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
export type DimensionUnit = "mm" | "cm" | "m" | "in" | "ft";

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
  /** Only kept when the stamp library cannot resolve `stampId`. */
  imageUrl?: string;
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

export type TextAlign = "left" | "center" | "right";
export type TextScript = "normal" | "sub" | "super";

/** A framed text box; geometry is the unrotated box, rotation pivots on its centre. */
export interface TextAnnotation extends AnnotationBase {
  type: "text";
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  text: string;
  /** PDF standard family: Helvetica, TimesRoman or Courier. */
  fontFamily: string;
  fontSizePt: number;
  textColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeOut: boolean;
  align: TextAlign;
  script: TextScript;
  boxFillColor: string;
  boxFillTransparent: boolean;
  /** 0 none, 1 rectangle border, 2 rounded border, 3 drop-shadow callout. */
  frameType: 0 | 1 | 2 | 3;
  frameColor: string;
  lineWidthMm: number;
  /** Shrink the type to stay inside the box instead of overflowing. */
  autoFit: boolean;
  rotation: number;
  opacity: number;
}

/** A LaTeX formula rendered with KaTeX on screen and rasterised into exports. */
export interface FormulaAnnotation extends AnnotationBase {
  type: "formula";
  latex: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  color: string;
  fontSizePt: number;
  fillColor: string;
  fillTransparent: boolean;
  rotation: number;
  opacity: number;
}

export type Annotation =
  | PenAnnotation
  | MarkerAnnotation
  | ShapeAnnotation
  | StampAnnotation
  | TextAnnotation
  | FormulaAnnotation;
export type AnnotationType = Annotation["type"];

/** Multi-line, wrapped text layout shared by the canvas and the PDF export. */
export interface TextLine {
  text: string;
  /** Offset from the top of the box, in millimetres. */
  topMm: number;
}

export interface TextLayout {
  lines: TextLine[];
  fontSizePt: number;
  lineHeightMm: number;
  /** Width of the widest line, in millimetres. */
  widthMm: number;
}

export interface TextMeasureOptions {
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  fontSizePt: number;
  align: TextAlign;
  autoFit: boolean;
  widthMm: number;
  heightMm: number;
  paddingMm?: number;
}

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
  text?: string;
  fontFamily?: string;
  fontSizePt?: number;
  textColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeOut?: boolean;
  align?: TextAlign;
  script?: TextScript;
  boxFillColor?: string;
  boxFillTransparent?: boolean;
  frameType?: 0 | 1 | 2 | 3;
  frameColor?: string;
  autoFit?: boolean;
  rotation?: number;
  latex?: string;
  widthMm?: number;
  heightMm?: number;
}

export const TEXT_FONTS = ["Helvetica", "TimesRoman", "Courier"] as const;

export type TextFontFamily = (typeof TEXT_FONTS)[number];

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
