import { useMemo, type CSSProperties, type ReactNode } from "react";
import { SHAPE_LABEL, type DimensionUnit, type MarkerTip, type TextAlign } from "../lib/annotationTypes";
import { ARROW_HEADS, SWATCHES } from "../lib/presets";
import { inkPath, penStyleOptions } from "../lib/ink";
import type { InkPoint, PenStyle } from "../lib/annotationTypes";
import { isShapeTool, SHAPE_TOOLS } from "../lib/tools";
import type { LineStyleName, ShapeTool, ToolId, ToolProps } from "../lib/types";
import { useToolStore } from "../stores/useToolStore";
import { TOOL_ICONS } from "./toolIcons";
import { ColorRow, Segmented, ToggleRow } from "./ui/controls";
import { CustomColorPicker } from "./ui/CustomColorPicker";

const FONTS = ["Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New", "Verdana", "Calibri", "Trebuchet MS"];

const THICKNESS_PRESETS = [0.5, 0.7, 1, 1.5, 2, 2.5, 3, 5, 8, 12, 16];
const THICKNESS_TICKS = [
  { value: 0.5, label: "1" },
  { value: 1, label: "2" },
  { value: 2, label: "3" },
  { value: 4, label: "6" },
  { value: 8, label: "10" },
  { value: 16, label: "24" },
];
const OPACITY_TICKS = [
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 75, label: "75" },
];
const FONT_SIZES = [8, 10, 12, 14, 18, 24, 32, 48, 64, 72];

const LINE_STYLES: { value: LineStyleName; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dash", label: "Dash" },
  { value: "dot", label: "Dot" },
  { value: "dash-dot", label: "Dash-dot" },
];

const DIMENSION_UNITS: { value: DimensionUnit; label: string }[] = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "m", label: "m" },
  { value: "in", label: "in" },
  { value: "ft", label: "ft" },
];

const POLYGON_SIDES: { value: string; label: string }[] = [
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "8", label: "8" },
];

const MARKER_TIPS: { value: MarkerTip; label: string }[] = [
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
  { value: "squared", label: "Squared" },
  { value: "ball", label: "Ball" },
];

function TipIcon({ tip }: { tip: MarkerTip }) {
  if (tip === "vertical") return <rect x="15" y="5" width="8" height="22" rx="1.5" fill="currentColor" />;
  if (tip === "horizontal") return <rect x="5" y="15" width="22" height="8" rx="1.5" fill="currentColor" />;
  if (tip === "squared") return <rect x="9" y="9" width="14" height="14" rx="1.5" fill="currentColor" />;
  return <circle cx="16" cy="16" r="7.5" fill="currentColor" />;
}

const STROKE_STYLES: { value: PenStyle; label: string; hint: string; patch: Partial<ToolProps> }[] = [
  { value: "basic", label: "Basic", hint: "Fixed width", patch: { penStyle: "basic", pressureLevel: 0, pressureSensitive: false, smoothing: false } },
  { value: "pro", label: "Pro", hint: "Variable width", patch: { penStyle: "pro", pressureLevel: 55, pressureSensitive: true, smoothing: false } },
  { value: "calligraphy", label: "Calligraphy", hint: "Dynamic width", patch: { penStyle: "calligraphy", pressureLevel: 85, pressureSensitive: true, smoothing: true } },
];

const DASH: Record<LineStyleName, string | undefined> = {
  solid: undefined,
  dash: "10 6",
  dot: "1.5 5",
  "dash-dot": "10 5 1.5 5",
};

function wavePoints(): InkPoint[] {
  const points: InkPoint[] = [];
  for (let index = 0; index <= 72; index += 1) {
    const t = index / 72;
    points.push([6 + t * 308, 36 + Math.sin(t * Math.PI * 2.1) * 18, 0.25 + Math.abs(Math.sin(t * Math.PI * 2.6)) * 0.75]);
  }
  return points;
}

const WAVE_POINTS = wavePoints();

function strokePreview(style: PenStyle, level: number, thickness: number) {
  return inkPath(WAVE_POINTS, Math.max(0.6, thickness), {
    ...penStyleOptions(style, level),
    simulatePressure: false,
  });
}

/** A live nib always stays slender, however wide the real stroke is. */
function previewNib(tool: ToolId, thicknessMm: number) {
  return tool === "marker"
    ? Math.min(12, 3 + Math.sqrt(thicknessMm) * 1.5)
    : Math.min(9, 1.5 + Math.sqrt(thicknessMm) * 1.4);
}

/** Live ink preview: colour, nib, opacity and stroke style update as you type. */
function WavePreview({ tool, props }: { tool: ToolId; props: ToolProps }) {
  const path = useMemo(
    () => strokePreview(props.penStyle, props.pressureLevel, previewNib(tool, props.thicknessMm)),
    [props, tool],
  );
  const tip = props.tipStyle ?? "vertical";
  const band = tool === "marker" ? (tip === "horizontal" ? 8 : tip === "squared" ? 16 : tip === "ball" ? 16 : 22) : 0;
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[var(--border)]"
      style={{ height: 68, background: "linear-gradient(180deg, var(--glass-strong), var(--panel))" }}
    >
      <svg viewBox="0 0 320 72" className="h-full w-full" aria-hidden="true">
        <line x1="6" y1="36" x2="314" y2="36" stroke="var(--border)" strokeDasharray="2 4" />
        {tool === "marker" ? (
          <line
            x1="24"
            y1="36"
            x2="296"
            y2="36"
            stroke={props.color}
            strokeWidth={band}
            strokeLinecap={tip === "squared" ? "square" : tip === "ball" ? "round" : "butt"}
            opacity={props.opacity}
          />
        ) : (
          <path d={path} fill={props.color} opacity={props.opacity} />
        )}
      </svg>
      <span className="absolute bottom-1.5 right-2 text-[9.5px] font-medium text-muted">Live preview</span>
    </div>
  );
}

function MiniStroke({ style, color, selected }: { style: PenStyle; color: string; selected: boolean }) {
  const path = useMemo(
    () =>
      inkPath(
        Array.from({ length: 28 }, (_, index) => {
          const t = index / 27;
          return [3 + t * 50, 14 + Math.sin(t * Math.PI * 2) * 7, 0.25 + Math.abs(Math.sin(t * Math.PI * 2.4)) * 0.75];
        }),
        2.4,
        { ...penStyleOptions(style, 55), simulatePressure: false },
      ),
    [style],
  );
  return (
    <svg viewBox="0 0 56 28" className="h-7 w-full" aria-hidden="true">
      <path d={path} fill={selected ? color : "var(--muted)"} />
    </svg>
  );
}

/** Slider with tick dots and their scale labels under the track. */
function TickSlider({
  label,
  value,
  min,
  max,
  step,
  ticks,
  color,
  onChange,
  aside,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  ticks: { value: number; label: string }[];
  color?: string;
  onChange: (value: number) => void;
  aside?: ReactNode;
}) {
  const percent = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className="field">
      <span className="field-label">
        <span>{label}</span>
        {aside}
      </span>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        style={
          {
            "--fill": `${percent}%`,
            ...(color
              ? { background: `linear-gradient(to right, ${color} ${percent}%, var(--track) ${percent}%)` }
              : {}),
          } as CSSProperties
        }
      />
      <div className="relative h-3">
        {ticks.map((tick) => {
          const left = Math.min(100, Math.max(0, ((tick.value - min) / (max - min)) * 100));
          return (
            <span key={tick.value} className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-0.5" style={{ left: `${left}%` }}>
              <span className="h-1 w-1 rounded-full" style={{ background: "var(--muted)", opacity: 0.65 }} />
              <span className="text-[8.5px] tabular-nums text-muted">{tick.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Compact dropdown that mirrors the slider value. */
function ValuePill({
  value,
  options,
  unit,
  onChange,
}: {
  value: number;
  options: number[];
  unit: string;
  onChange: (value: number) => void;
}) {
  const all = [...new Set([...options, value])].sort((a, b) => a - b);
  return (
    <select
      className="h-6 rounded-md border border-[var(--border)] bg-[var(--panel)] px-1 text-[10.5px] font-medium tabular-nums outline-none"
      value={value}
      aria-label={`Value in ${unit}`}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {all.map((option) => (
        <option key={option} value={option}>
          {Number(option.toFixed(2))} {unit}
        </option>
      ))}
    </select>
  );
}

function ColorGrid({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <span className="field-label">
        <span>Colour</span>
        <span className="field-value">{value.toUpperCase()}</span>
      </span>
      <div className="flex flex-wrap items-center justify-between gap-y-1">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            className="swatch"
            aria-label={`Ink ${color}`}
            aria-pressed={color.toLowerCase() === value.toLowerCase()}
            onClick={() => onChange(color)}
            style={{ background: color }}
          />
        ))}
        <CustomColorPicker value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function StudioInk({ tool, props, setProps }: { tool: ToolId; props: ToolProps; setProps: (patch: Partial<ToolProps>) => void }) {
  const isInk = tool === "pen" || tool === "marker";
  const percent = Math.round(props.opacity * 100);

  return (
    <div className="flex flex-col gap-3">
      {isInk && <WavePreview tool={tool} props={props} />}

      {tool === "marker" && (
        <div className="field">
          <span className="field-label">
            <span>Tip style</span>
            <span className="field-value">{MARKER_TIPS.find((tip) => tip.value === (props.tipStyle ?? "vertical"))?.label}</span>
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {MARKER_TIPS.map((tip) => (
              <button
                key={tip.value}
                type="button"
                className="tile flex flex-col items-center gap-0.5 px-1 py-1.5"
                aria-pressed={(props.tipStyle ?? "vertical") === tip.value}
                aria-label={`${tip.label} highlighter tip`}
                title={tip.label}
                onClick={() => setProps({ tipStyle: tip.value })}
              >
                <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true" style={{ color: props.color }}>
                  <TipIcon tip={tip.value} />
                </svg>
                <span className="text-[9px] font-medium">{tip.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tool === "marker" && (
        <ToggleRow
          label="Straight line highlight"
          hint="Snaps the highlight to a straight line between start and end."
          checked={Boolean(props.straightHighlight)}
          onChange={(straightHighlight) => setProps({ straightHighlight })}
        />
      )}

      {tool === "pen" && (
        <div className="grid grid-cols-3 gap-1.5">
          {STROKE_STYLES.map((style) => {
            const active = props.penStyle === style.value;
            return (
              <button
                key={style.value}
                type="button"
                className="tile flex flex-col items-center overflow-hidden px-1 pb-1.5 pt-1 text-center"
                aria-pressed={active}
                title={style.hint}
                onClick={() => setProps(style.patch)}
              >
                <MiniStroke style={style.value} color={props.color} selected={active} />
                <span className="text-[10.5px] font-semibold leading-tight">{style.label}</span>
                <span className="text-[9px] leading-tight text-muted">{style.hint}</span>
              </button>
            );
          })}
        </div>
      )}

      <TickSlider
        label={tool === "marker" ? "Marker width" : tool === "pen" ? "Ink width" : "Stroke"}
        value={props.thicknessMm}
        min={tool === "marker" ? 2 : 0.2}
        max={tool === "marker" ? 32 : 16}
        step={0.1}
        ticks={tool === "marker" ? [{ value: 2, label: "2" }, { value: 10, label: "10" }, { value: 20, label: "20" }, { value: 32, label: "32" }] : THICKNESS_TICKS}
        onChange={(thicknessMm) => setProps({ thicknessMm })}
        aside={<ValuePill value={props.thicknessMm} options={THICKNESS_PRESETS} unit="mm" onChange={(thicknessMm) => setProps({ thicknessMm })} />}
      />

      <ColorGrid value={props.color} onChange={(color) => setProps({ color })} />

      <TickSlider
        label="Opacity"
        value={percent}
        min={5}
        max={100}
        step={1}
        ticks={OPACITY_TICKS}
        color={props.color}
        onChange={(value) => setProps({ opacity: value / 100 })}
        aside={<ValuePill value={percent} options={[10, 25, 50, 70, 80, 100]} unit="%" onChange={(value) => setProps({ opacity: value / 100 })} />}
      />

      {isInk && (
        <details className="rounded-xl border border-[var(--border)] px-2.5 py-2">
          <summary className="cursor-pointer text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            Smart inking
          </summary>
          <div className="flex flex-col gap-3 pt-2.5">
            <TickSlider
              label="Ink pressure"
              value={props.pressureLevel}
              min={0}
              max={100}
              step={1}
              ticks={[{ value: 0, label: "0" }, { value: 50, label: "50" }, { value: 100, label: "100" }]}
              onChange={(pressureLevel) => setProps({ pressureLevel, pressureSensitive: pressureLevel > 0 })}
              aside={
                <ValuePill value={props.pressureLevel} options={[0, 25, 55, 85, 100]} unit="%" onChange={(pressureLevel) => setProps({ pressureLevel, pressureSensitive: pressureLevel > 0 })} />
              }
            />
            <button
              type="button"
              className="chip h-7 justify-center"
              aria-pressed={props.smoothing}
              onClick={() => setProps({ smoothing: !props.smoothing })}
            >
              Auto-smooth
            </button>
          </div>
        </details>
      )}
    </div>
  );
}

function TextStudio({ props, setProps }: { props: ToolProps; setProps: (patch: Partial<ToolProps>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="field">
        <span className="field-label">Font</span>
        <select className="text-input" value={props.fontName} onChange={(event) => setProps({ fontName: event.target.value })}>
          {FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>

      <TickSlider
        label="Size"
        value={props.fontSize}
        min={6}
        max={72}
        step={1}
        ticks={[{ value: 6, label: "6" }, { value: 24, label: "24" }, { value: 48, label: "48" }, { value: 72, label: "72" }]}
        onChange={(fontSize) => setProps({ fontSize })}
        aside={<ValuePill value={props.fontSize} options={FONT_SIZES} unit="pt" onChange={(fontSize) => setProps({ fontSize })} />}
      />

      <div className="seg">
        <button type="button" aria-pressed={props.bold} onClick={() => setProps({ bold: !props.bold })} style={{ fontWeight: 700 }}>
          B
        </button>
        <button type="button" aria-pressed={props.italic} onClick={() => setProps({ italic: !props.italic })} style={{ fontStyle: "italic" }}>
          I
        </button>
        <button type="button" aria-pressed={props.underline} onClick={() => setProps({ underline: !props.underline })} style={{ textDecoration: "underline" }}>
          U
        </button>
        <button type="button" aria-pressed={props.strikeOut} onClick={() => setProps({ strikeOut: !props.strikeOut })} style={{ textDecoration: "line-through" }}>
          S
        </button>
      </div>

      <div className="field">
        <span className="field-label">Align</span>
        <Segmented<TextAlign>
          value={props.textAlign}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Centre" },
            { value: "right", label: "Right" },
          ]}
          onChange={(textAlign) => setProps({ textAlign })}
        />
      </div>

      <ColorGrid value={props.color} onChange={(color) => setProps({ color })} />

      <details className="rounded-xl border border-[var(--border)] px-2.5 py-2">
        <summary className="cursor-pointer text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
          Box frame &amp; fill
        </summary>
        <div className="flex flex-col gap-3 pt-2.5">
          <TickSlider
            label="Frame width"
            value={props.thicknessMm}
            min={0.2}
            max={4}
            step={0.1}
            ticks={[{ value: 0.2, label: "0.2" }, { value: 1, label: "1" }, { value: 2, label: "2" }, { value: 4, label: "4" }]}
            onChange={(thicknessMm) => setProps({ thicknessMm })}
          />
          <ColorRow label="Box fill" value={props.fill} allowNone onChange={(fill) => setProps({ fill })} />
          <TickSlider
            label="Box opacity"
            value={Math.round(props.opacity * 100)}
            min={5}
            max={100}
            step={1}
            ticks={OPACITY_TICKS}
            onChange={(value) => setProps({ opacity: value / 100 })}
          />
        </div>
      </details>
    </div>
  );
}

const PREVIEW_STROKE = 2;

function arrowTip(x: number, y: number, direction: 1 | -1, code: number, stroke: string) {
  if (!code) return null;
  const size = 10;
  if (code === 3) {
    return (
      <path
        d={`M${x + direction * size} ${y - 6} L${x} ${y} L${x + direction * size} ${y + 6}`}
        fill="none"
        stroke={stroke}
        strokeWidth={PREVIEW_STROKE}
        strokeLinecap="round"
      />
    );
  }
  return (
    <path
      d={`M${x + direction * size} ${y - 6} L${x} ${y} L${x + direction * size} ${y + 6} Z`}
      fill={code === 7 ? "none" : stroke}
      stroke={stroke}
      strokeWidth={PREVIEW_STROKE}
    />
  );
}

/** Live SVG preview of the active shape's stroke, fill, dash and arrowheads. */
function ShapePreview({ tool, props }: { tool: ShapeTool; props: ToolProps }) {
  const stroke = props.color;
  const fill = props.fill ?? "none";
  const common = {
    stroke,
    fill,
    opacity: props.opacity,
    strokeWidth: PREVIEW_STROKE,
    strokeDasharray: DASH[props.lineStyle],
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const flat = { ...common, fill: "none" };

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[var(--border)]"
      style={{ height: 86, background: "linear-gradient(180deg, var(--glass-strong), var(--panel))" }}
    >
      <svg viewBox="0 0 320 86" className="h-full w-full" aria-hidden="true">
        {tool === "line" && <line x1="30" y1="62" x2="290" y2="24" {...flat} />}
        {tool === "arrow" && (
          <g {...flat}>
            <line x1="30" y1="62" x2="290" y2="24" />
            {arrowTip(30, 62, -1, props.arrowTail, stroke)}
            {arrowTip(290, 24, 1, props.arrowHead || 5, stroke)}
          </g>
        )}
        {tool === "rectangle" && <rect x="76" y="22" width="168" height="44" rx="3" {...common} />}
        {tool === "ellipse" && <ellipse cx="160" cy="44" rx="84" ry="22" {...common} />}
        {tool === "polygon" && <path d="M160 18 L238 32 L258 62 L160 76 L62 62 L82 32 Z" {...common} />}
        {tool === "dimension" && (
          <g {...flat}>
            <line x1="46" y1="44" x2="274" y2="44" />
            <path d="M46 44l12-6M46 44l12 6M274 44l-12-6M274 44l-12 6" />
          </g>
        )}
      </svg>
      <span className="absolute bottom-1.5 right-2 text-[9.5px] font-medium text-muted">Live preview</span>
    </div>
  );
}

function ShapeGrid({ tool }: { tool: ShapeTool }) {
  const setTool = useToolStore((state) => state.setTool);
  return (
    <div className="grid grid-cols-3 gap-1">
      {SHAPE_TOOLS.map((shape) => {
        const Icon = TOOL_ICONS[shape];
        return (
          <button
            key={shape}
            type="button"
            className="tile flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-medium"
            aria-pressed={shape === tool}
            aria-label={SHAPE_LABEL[shape]}
            onClick={() => setTool(shape)}
          >
            <Icon size={15} strokeWidth={1.75} />
            {SHAPE_LABEL[shape]}
          </button>
        );
      })}
    </div>
  );
}

export function PropertyControls({ tool }: { tool: ToolId }) {
  const props = useToolStore((state) => state.props[tool]);
  const setProps = useToolStore((state) => state.setProps);
  const shape = isShapeTool(tool) ? tool : null;

  if (shape) {
    return (
      <div className="flex flex-col gap-3">
        <ShapeGrid tool={shape} />
        <ShapePreview tool={shape} props={props} />
        {shape === "polygon" && (
          <div className="field">
            <span className="field-label">
              <span>Sides</span>
              <span className="field-value">{props.polygonSides ?? 6}</span>
            </span>
            <Segmented
              value={String(props.polygonSides ?? 6)}
              options={POLYGON_SIDES}
              onChange={(value) => setProps({ polygonSides: Number(value) as 3 | 4 | 5 | 6 | 8 })}
            />
          </div>
        )}
        <StudioInk tool={tool} props={props} setProps={setProps} />

        {shape !== "line" && shape !== "arrow" && shape !== "dimension" && (
          <ColorRow label="Fill" value={props.fill} allowNone onChange={(fill) => setProps({ fill })} />
        )}

        <div className="field">
          <span className="field-label">Line style</span>
          <Segmented value={props.lineStyle} options={LINE_STYLES} onChange={(lineStyle) => setProps({ lineStyle })} />
        </div>

        {shape === "arrow" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="field-label">Head</span>
              <select className="text-input" value={props.arrowHead} onChange={(event) => setProps({ arrowHead: Number(event.target.value) })}>
                {ARROW_HEADS.map((head) => (
                  <option key={head.value} value={head.value}>
                    {head.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Tail</span>
              <select className="text-input" value={props.arrowTail} onChange={(event) => setProps({ arrowTail: Number(event.target.value) })}>
                {ARROW_HEADS.map((head) => (
                  <option key={head.value} value={head.value}>
                    {head.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {shape === "dimension" && (
          <div className="field">
            <span className="field-label">Unit</span>
            <Segmented value={props.dimensionUnit} options={DIMENSION_UNITS} onChange={(dimensionUnit) => setProps({ dimensionUnit })} />
          </div>
        )}
      </div>
    );
  }

  if (tool === "text") return <TextStudio props={props} setProps={setProps} />;
  if (tool === "pen" || tool === "marker") return <StudioInk tool={tool} props={props} setProps={setProps} />;
  return null;
}
