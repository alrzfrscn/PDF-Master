import type { LineStyleName, Preset, PresetFamily, ToolId, ToolProps } from "./types";

const LINE_STYLE_BY_CODE: Record<number, LineStyleName> = {
  0: "solid",
  1: "dash",
  2: "dot",
  3: "dash-dot",
  5: "dash-dot",
};

/** Which factory family (and graphical type) feeds a tool's preset drawer. */
export const PRESET_QUERY: Partial<Record<ToolId, { family: PresetFamily; typeCode?: number; note?: string }>> = {
  pen: { family: "pen" },
  marker: { family: "marker" },
  text: { family: "text" },
  formula: { family: "text", note: "Formula ink borrows the text colour and size." },
  line: { family: "graphical", typeCode: 0 },
  arrow: { family: "graphical", typeCode: 1 },
  rectangle: { family: "graphical", typeCode: 2 },
  ellipse: { family: "graphical", typeCode: 3 },
  polygon: { family: "graphical", typeCode: 2, note: "The factory set has no polygon preset; rectangle styles apply." },
  dimension: { family: "graphical", typeCode: 6 },
  stamp: { family: "stamp" },
};

export function presetsFor(tool: ToolId, all: Preset[]): Preset[] {
  const query = PRESET_QUERY[tool];
  if (!query) return [];
  return all.filter(
    (preset) =>
      preset.family === query.family &&
      (query.typeCode === undefined || preset.typeCode === query.typeCode),
  );
}

/** The preset's attributes as a patch on the unified ink property model. */
export function presetPatch(preset: Preset): Partial<ToolProps> {
  const props = preset.props;
  const patch: Partial<ToolProps> = {};
  const color = props.color?.hex ?? props.fontColor?.hex;
  if (color) patch.color = color;
  const thickness = props.thicknessMm ?? props.lineWidthMm;
  if (thickness !== undefined && thickness > 0) patch.thicknessMm = thickness;
  if (props.inkTransparency !== undefined) patch.opacity = 1 - props.inkTransparency / 100;
  if (props.lineStyle !== undefined) patch.lineStyle = LINE_STYLE_BY_CODE[props.lineStyle] ?? "solid";
  if (props.arrowHead !== undefined) patch.arrowHead = props.arrowHead;
  if (props.arrowTail !== undefined) patch.arrowTail = props.arrowTail;
  if (props.backColor !== undefined) patch.fill = props.backColor.transparent ? null : props.backColor.hex;
  if (props.fontSize !== undefined) patch.fontSize = props.fontSize;
  if (props.fontName !== undefined) patch.fontName = props.fontName;
  if (props.bold !== undefined) patch.bold = props.bold;
  if (props.italic !== undefined) patch.italic = props.italic;
  if (props.underline !== undefined) patch.underline = props.underline;
  if (props.strikeOut !== undefined) patch.strikeOut = props.strikeOut;
  if (props.pressureSensitive !== undefined) patch.pressureSensitive = props.pressureSensitive;
  return patch;
}

export const BASE_PROPS: ToolProps = {
  color: "#101114",
  thicknessMm: 1,
  opacity: 1,
  lineStyle: "solid",
  arrowHead: 0,
  arrowTail: 0,
  fill: null,
  fontSize: 12,
  fontName: "Arial",
  bold: false,
  italic: false,
  underline: false,
  strikeOut: false,
  textAlign: "left",
  dimensionUnit: "mm",
  pressureSensitive: true,
  smoothing: false,
  penStyle: "pro",
  pressureLevel: 55,
  tipStyle: "vertical",
  polygonSides: 6,
  straightHighlight: false,
};

export const ARROW_HEADS = [
  { value: 0, label: "None" },
  { value: 3, label: "Open" },
  { value: 5, label: "Filled" },
  { value: 7, label: "Hollow" },
  { value: 10, label: "Solid" },
];

/** The one palette every colour picker in the app shares. */
export const SWATCHES = ["#EF4444", "#2563EB", "#000000", "#10B981", "#8B5CF6", "#F97316", "#FACC15", "#EC4899", "#06B6D4"];
