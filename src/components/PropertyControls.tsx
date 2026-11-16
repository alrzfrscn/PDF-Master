import { ARROW_HEADS } from "../lib/presets";
import type { LineStyleName, ToolId } from "../lib/types";
import { useToolStore } from "../stores/useToolStore";
import { ColorRow, SectionTitle, Segmented, SliderRow, ToggleRow } from "./ui/controls";

const COLOR_TOOLS: ToolId[] = [
  "pen", "marker", "text", "formula", "line", "arrow", "rectangle", "ellipse", "polygon", "dimension",
];
const THICKNESS_TOOLS: ToolId[] = [
  "pen", "marker", "text", "formula", "line", "arrow", "rectangle", "ellipse", "polygon", "dimension",
];
const OPACITY_TOOLS: ToolId[] = ["pen", "marker", "text", "rectangle", "ellipse", "polygon"];
const FONT_TOOLS: ToolId[] = ["text", "formula"];
const FONTS = ["Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New", "Verdana", "Calibri", "Trebuchet MS"];

const LINE_STYLES: { value: LineStyleName; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dash", label: "Dash" },
  { value: "dot", label: "Dot" },
  { value: "dash-dot", label: "Dash-dot" },
];

export function PropertyControls({ tool }: { tool: ToolId }) {
  const props = useToolStore((state) => state.props[tool]);
  const setProps = useToolStore((state) => state.setProps);

  const hasColor = COLOR_TOOLS.includes(tool);
  const hasThickness = THICKNESS_TOOLS.includes(tool);
  const hasOpacity = OPACITY_TOOLS.includes(tool);
  const hasFont = FONT_TOOLS.includes(tool);
  const hasFill = ["rectangle", "ellipse", "polygon"].includes(tool);
  const hasLine = tool === "line" || tool === "arrow";

  return (
    <div className="flex flex-col gap-3.5">
      <SectionTitle>Ink</SectionTitle>

      {hasColor && (
        <ColorRow label={hasFont ? "Ink colour" : "Colour"} value={props.color} onChange={(color) => color && setProps({ color })} />
      )}

      {hasThickness && (
        <SliderRow
          label={tool === "marker" ? "Marker width" : hasFont ? "Frame width" : "Ink width"}
          value={props.thicknessMm}
          min={tool === "marker" ? 2 : 0.2}
          max={tool === "marker" ? 32 : 10}
          step={0.1}
          unit="mm"
          onChange={(thicknessMm) => setProps({ thicknessMm })}
        />
      )}

      {hasOpacity && (
        <SliderRow
          label={hasFont ? "Box opacity" : "Ink opacity"}
          value={Math.round(props.opacity * 100)}
          min={5}
          max={100}
          step={1}
          unit="%"
          onChange={(percent) => setProps({ opacity: percent / 100 })}
        />
      )}

      {hasFill && (
        <ColorRow label="Fill" value={props.fill} allowNone onChange={(fill) => setProps({ fill })} />
      )}

      {hasLine && (
        <div className="field">
          <span className="field-label">Line style</span>
          <Segmented
            value={props.lineStyle}
            options={LINE_STYLES}
            onChange={(lineStyle) => setProps({ lineStyle })}
          />
        </div>
      )}

      {tool === "arrow" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="field">
            <span className="field-label">Head</span>
            <select
              className="text-input"
              value={props.arrowHead}
              onChange={(event) => setProps({ arrowHead: Number(event.target.value) })}
            >
              {ARROW_HEADS.map((head) => (
                <option key={head.value} value={head.value}>
                  {head.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Tail</span>
            <select
              className="text-input"
              value={props.arrowTail}
              onChange={(event) => setProps({ arrowTail: Number(event.target.value) })}
            >
              {ARROW_HEADS.map((head) => (
                <option key={head.value} value={head.value}>
                  {head.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {hasFont && (
        <>
          <SectionTitle>Type</SectionTitle>
          <label className="field">
            <span className="field-label">Font</span>
            <select
              className="text-input"
              value={props.fontName}
              onChange={(event) => setProps({ fontName: event.target.value })}
            >
              {FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
          <SliderRow
            label="Size"
            value={props.fontSize}
            min={6}
            max={72}
            step={1}
            unit="pt"
            onChange={(fontSize) => setProps({ fontSize })}
          />
          <div className="seg">
            <button
              type="button"
              aria-pressed={props.bold}
              onClick={() => setProps({ bold: !props.bold })}
              style={{ fontWeight: 700 }}
            >
              Bold
            </button>
            <button
              type="button"
              aria-pressed={props.italic}
              onClick={() => setProps({ italic: !props.italic })}
              style={{ fontStyle: "italic" }}
            >
              Italic
            </button>
            <button
              type="button"
              aria-pressed={props.underline}
              onClick={() => setProps({ underline: !props.underline })}
              style={{ textDecoration: "underline" }}
            >
              Underline
            </button>
          </div>
        </>
      )}

      {(tool === "pen" || tool === "marker" || tool === "formula") && (
        <>
          <div className="divider" />
          <ToggleRow
            label="Pressure-sensitive"
            hint="Stroke width follows pen pressure."
            checked={props.pressureSensitive}
            onChange={(pressureSensitive) => setProps({ pressureSensitive })}
          />
          <ToggleRow
            label="Smoothing"
            hint="Reduces hand jitter while drawing."
            checked={props.smoothing}
            onChange={(smoothing) => setProps({ smoothing })}
          />
        </>
      )}

      {tool === "dimension" && (
        <p className="rounded-lg px-2 py-1.5 text-[10.5px] leading-relaxed text-muted" style={{ background: "var(--track)" }}>
          Distances are calibrated per page at 144 dpi; the factory recipes carry metric and imperial units.
        </p>
      )}
    </div>
  );
}
