import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ARROW_HEADS } from "../lib/presets";
import { inkPath, penStyleOptions } from "../lib/ink";
import type { InkPoint, PenStyle } from "../lib/annotationTypes";
import type { LineStyleName, ToolId, ToolProps } from "../lib/types";
import { useToolStore } from "../stores/useToolStore";
import { ColorRow, SectionTitle, Segmented, ToggleRow } from "./ui/controls";

const COLOR_TOOLS: ToolId[] = [
  "pen", "marker", "text", "formula", "line", "arrow", "rectangle", "ellipse", "polygon", "dimension",
];
const THICKNESS_TOOLS: ToolId[] = [
  "pen", "marker", "text", "formula", "line", "arrow", "rectangle", "ellipse", "polygon", "dimension",
];
const OPACITY_TOOLS: ToolId[] = ["pen", "marker", "text", "rectangle", "ellipse", "polygon"];
const FONT_TOOLS: ToolId[] = ["text", "formula"];
const FONTS = ["Arial", "Helvetica", "Times New Roman", "Georgia", "Courier New", "Verdana", "Calibri", "Trebuchet MS"];

const INK_COLORS = ["#EF4444", "#2563EB", "#000000", "#10B981", "#8B5CF6", "#F97316", "#FACC15", "#EC4899", "#06B6D4"];
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

const LINE_STYLES: { value: LineStyleName; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dash", label: "Dash" },
  { value: "dot", label: "Dot" },
  { value: "dash-dot", label: "Dash-dot" },
];

const STROKE_STYLES: { value: PenStyle; label: string; hint: string; patch: Partial<ToolProps> }[] = [
  { value: "basic", label: "Basic", hint: "Fixed width", patch: { penStyle: "basic", pressureLevel: 0, pressureSensitive: false, smoothing: false } },
  { value: "pro", label: "Pro", hint: "Variable width", patch: { penStyle: "pro", pressureLevel: 55, pressureSensitive: true, smoothing: false } },
  { value: "calligraphy", label: "Calligraphy", hint: "Dynamic width", patch: { penStyle: "calligraphy", pressureLevel: 85, pressureSensitive: true, smoothing: true } },
];

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

/** Live ink preview: colour, nib, opacity and stroke style update as you type. */
function WavePreview({ props }: { props: ToolProps }) {
  const path = useMemo(
    () => strokePreview(props.penStyle, props.pressureLevel, props.thicknessMm * 2.2),
    [props],
  );
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[var(--border)]"
      style={{ height: 68, background: "linear-gradient(180deg, var(--glass-strong), var(--panel))" }}
    >
      <svg viewBox="0 0 320 72" className="h-full w-full" aria-hidden="true">
        <line x1="6" y1="36" x2="314" y2="36" stroke="var(--border)" strokeDasharray="2 4" />
        <path d={path} fill={props.color} opacity={props.opacity} />
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
  const [customOpen, setCustomOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const selected = INK_COLORS.find((color) => color.toLowerCase() === value.toLowerCase());

  const apply = (next: string) => {
    setHex(next);
    if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next);
  };

  return (
    <div className="field">
      <span className="field-label">
        <span>Colour</span>
        <span className="field-value">{value.toUpperCase()}</span>
      </span>
      <div className="flex items-center justify-between gap-1">
        {INK_COLORS.map((color) => {
          const active = selected === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={`Ink ${color}`}
              aria-pressed={active}
              onClick={() => onChange(color)}
              className="h-[22px] w-[22px] rounded-[7px] border border-black/15"
              style={{
                background: color,
                outline: active ? "2px solid #fff" : undefined,
                outlineOffset: active ? 1 : undefined,
                boxShadow: active ? "0 0 0 3px var(--accent)" : "inset 0 1px 0 rgba(255,255,255,0.3)",
              }}
            />
          );
        })}
        <button
          type="button"
          className="grid h-[22px] w-[22px] place-items-center rounded-[7px] border border-[var(--border)] text-[10px] font-semibold text-muted"
          aria-label="Custom colour"
          aria-pressed={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
        >
          ...
        </button>
      </div>
      {customOpen && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
            aria-label="Pick custom colour"
            onChange={(event) => apply(event.target.value)}
            className="h-7 w-9 cursor-pointer rounded-md border border-[var(--border)] bg-transparent p-0.5"
          />
          <input
            className="text-input h-7 text-[11px]"
            value={hex}
            aria-label="Hex colour"
            placeholder="#0044FF"
            onChange={(event) => apply(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function StudioInk({ tool, props, setProps }: { tool: ToolId; props: ToolProps; setProps: (patch: Partial<ToolProps>) => void }) {
  const isInk = tool === "pen" || tool === "marker";
  const percent = Math.round(props.opacity * 100);

  return (
    <div className="flex flex-col gap-3">
      {isInk && <WavePreview props={props} />}

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
        label={tool === "marker" ? "Marker width" : tool === "text" || tool === "formula" ? "Frame width" : "Ink width"}
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
        label={tool === "text" ? "Box opacity" : "Opacity"}
        value={percent}
        min={5}
        max={100}
        step={1}
        ticks={OPACITY_TICKS}
        color={props.color}
        onChange={(value) => setProps({ opacity: value / 100 })}
        aside={<ValuePill value={percent} options={[10, 25, 50, 70, 80, 100]} unit="%" onChange={(value) => setProps({ opacity: value / 100 })} />}
      />

      {(tool === "pen" || tool === "marker") && (
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
            <ToggleRow
              label="Ink to line / auto-smooth"
              hint="Smooths jitter and snaps held strokes to straight lines."
              checked={props.smoothing}
              onChange={(smoothing) => setProps({ smoothing })}
            />
          </div>
        </details>
      )}

      {tool === "dimension" && (
        <p className="rounded-lg px-2 py-1.5 text-[10.5px] leading-relaxed text-muted" style={{ background: "var(--track)" }}>
          Distances are calibrated per page at 144 dpi; the factory recipes carry metric and imperial units.
        </p>
      )}
    </div>
  );
}

export function PropertyControls({ tool }: { tool: ToolId }) {
  const props = useToolStore((state) => state.props[tool]);
  const setProps = useToolStore((state) => state.setProps);

  const hasColor = COLOR_TOOLS.includes(tool);
  const hasThickness = THICKNESS_TOOLS.includes(tool);
  const hasOpacity = OPACITY_TOOLS.includes(tool);
  const hasFont = FONT_TOOLS.includes(tool);
  const hasFill = ["rectangle", "ellipse", "polygon"].includes(tool);
  const hasLine = tool === "line" || tool === "arrow";
  const studio = tool === "pen" || tool === "marker" || hasFill || hasLine;

  return (
    <div className="flex flex-col gap-3.5">
      <SectionTitle>{studio ? "Ink studio" : "Ink"}</SectionTitle>

      {studio ? (
        <StudioInk tool={tool} props={props} setProps={setProps} />
      ) : (
        <>
          {hasColor && (
            <ColorRow label={hasFont ? "Ink colour" : "Colour"} value={props.color} onChange={(color) => color && setProps({ color })} />
          )}
          {hasThickness && (
            <div className="field">
              <span className="field-label">
                <span>{hasFont ? "Frame width" : "Ink width"}</span>
                <span className="field-value">{Number(props.thicknessMm.toFixed(2))} mm</span>
              </span>
              <input
                type="range"
                className="range"
                min={0.2}
                max={10}
                step={0.1}
                value={props.thicknessMm}
                onChange={(event) => setProps({ thicknessMm: Number(event.target.value) })}
                style={{ "--fill": `${Math.min(100, (props.thicknessMm / 10) * 100)}%` } as CSSProperties}
              />
            </div>
          )}
          {hasOpacity && (
            <div className="field">
              <span className="field-label">
                <span>Ink opacity</span>
                <span className="field-value">{Math.round(props.opacity * 100)} %</span>
              </span>
              <input
                type="range"
                className="range"
                min={5}
                max={100}
                step={1}
                value={Math.round(props.opacity * 100)}
                onChange={(event) => setProps({ opacity: Number(event.target.value) / 100 })}
                style={{ "--fill": `${Math.round(props.opacity * 100)}%` } as CSSProperties}
              />
            </div>
          )}
        </>
      )}

      {hasFill && (
        <ColorRow label="Fill" value={props.fill} allowNone onChange={(fill) => setProps({ fill })} />
      )}

      {hasLine && (
        <div className="field">
          <span className="field-label">Line style</span>
          <Segmented value={props.lineStyle} options={LINE_STYLES} onChange={(lineStyle) => setProps({ lineStyle })} />
        </div>
      )}

      {tool === "arrow" && (
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

      {hasFont && (
        <>
          <SectionTitle>Type</SectionTitle>
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
          <div className="field">
            <span className="field-label">
              <span>Size</span>
              <span className="field-value">{props.fontSize} pt</span>
            </span>
            <input
              type="range"
              className="range"
              min={6}
              max={72}
              step={1}
              value={props.fontSize}
              onChange={(event) => setProps({ fontSize: Number(event.target.value) })}
              style={{ "--fill": `${((props.fontSize - 6) / 66) * 100}%` } as CSSProperties}
            />
          </div>
          <div className="seg">
            <button type="button" aria-pressed={props.bold} onClick={() => setProps({ bold: !props.bold })} style={{ fontWeight: 700 }}>
              Bold
            </button>
            <button type="button" aria-pressed={props.italic} onClick={() => setProps({ italic: !props.italic })} style={{ fontStyle: "italic" }}>
              Italic
            </button>
            <button type="button" aria-pressed={props.underline} onClick={() => setProps({ underline: !props.underline })} style={{ textDecoration: "underline" }}>
              Underline
            </button>
          </div>
        </>
      )}

    </div>
  );
}
