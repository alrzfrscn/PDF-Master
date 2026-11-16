export type ThemeName = "light" | "dark" | "sepia";

export interface ColorValue {
  hex: string | null;
  transparent: boolean;
  system?: boolean;
}

export type PresetFamily = "pen" | "marker" | "text" | "stamp" | "graphical";

export interface PresetProps {
  color?: ColorValue;
  backColor?: ColorValue;
  fontColor?: ColorValue;
  textboxColor?: ColorValue;
  textboxFrameColor?: ColorValue;
  thicknessMm?: number;
  lineWidthMm?: number;
  pressureSensitive?: boolean;
  snapping?: boolean;
  inkOnText?: boolean;
  dpi?: number;
  fontName?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeOut?: boolean;
  textboxFrameType?: number;
  inkTransparency?: number;
  lineStyle?: number;
  arrowHead?: number;
  arrowTail?: number;
  grouped?: boolean;
  calibratedUnit?: string;
  measuredUnit?: string;
  calibratedDistance?: number;
  measuredDistance?: number;
  inkOnTextLineMode?: number;
}

export interface Preset {
  id: string;
  index: number;
  family: PresetFamily;
  groupId: string;
  groupSlug: string;
  category: number;
  position: number;
  schemaVersion: number;
  typeCode: number | null;
  typeName: string | null;
  title: string;
  subtitle: string;
  label: { en: string; de: string };
  props: PresetProps;
  lineStyleName?: string;
}

export interface ToolGroup {
  id: string;
  slug: string;
  category: number;
  position: number;
  captions: { en: string; de: string };
  schemaVersion: number;
  toolCount: number;
  families: Record<PresetFamily, number>;
}

export interface Stamp {
  id: string;
  groupId: string;
  groupSlug: string;
  category: number;
  position: number;
  grouped: boolean;
  width: number;
  height: number;
  assetWidth: number;
  assetHeight: number;
  vectorInkBytes: number | null;
  artSource: "gif-raster" | "app-thumbnail" | "generated-text" | "missing";
  imageUrl: string | null;
  title: { en: string; de: string };
}

export interface UserStamp {
  id: string;
  guid: string;
  groupId: string | null;
  groupSlug: string | null;
  groupName: string;
  position: number;
  grouped: boolean;
  name: string;
  width: number;
  height: number;
  inkWidth: number;
  inkHeight: number;
  imageUrl: string;
}

export type PaperStyle = "blank" | "line" | "karo" | "mm" | "grid";
export type PaperGroup = "blank" | "ruled" | "squared" | "millimeter" | "grid";

export interface PaperGrid {
  kind: "line" | "grid";
  widthMm: number;
  color: string;
  deltaXMm: number | null;
  deltaYMm: number | null;
  deltaMm: number | null;
  highlightMinor: number | null;
  highlightMajor: number | null;
}

export interface PaperTemplate {
  id: string;
  index: number;
  style: PaperStyle;
  styleLabel: string;
  group: PaperGroup;
  isMetric: boolean;
  units: "metric" | "imperial";
  description: string;
  page: { size: string; landscape: boolean; widthMm: number; heightMm: number; count: number };
  bounds: { left: number; top: number; right: number; bottom: number } | null;
  grid: PaperGrid | null;
  name: string;
  detail: string;
}

export type LineStyleName = "solid" | "dash" | "dot" | "dash-dot";

export interface ToolProps {
  color: string;
  thicknessMm: number;
  opacity: number;
  lineStyle: LineStyleName;
  arrowHead: number;
  arrowTail: number;
  fill: string | null;
  fontSize: number;
  fontName: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  pressureSensitive: boolean;
  smoothing: boolean;
}

export type ToolId =
  | "hand"
  | "select"
  | "lasso"
  | "pen"
  | "marker"
  | "text"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "polygon"
  | "dimension"
  | "stamp"
  | "eraser"
  | "measure"
  | "formula"
  | "crop"
  | "snapshot";

export type ShapeTool = "line" | "arrow" | "rectangle" | "ellipse" | "polygon" | "dimension";

export interface DocumentTab {
  id: string;
  title: string;
  templateId: string;
  landscape: boolean;
  pageCount: number;
}

export interface MigrationManifest {
  generatedAt: string;
  counts: {
    groups: number;
    presets: number;
    presetsByFamily: Record<PresetFamily, number>;
    stamps: number;
    stampArt: Record<string, number>;
    paperTemplates: number;
    userStamps: number;
    pdfTemplates: number;
  };
  allPassed: boolean;
  warnings: string[];
}
