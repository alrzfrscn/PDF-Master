import type { CSSProperties, ReactNode } from "react";
import { SWATCHES } from "../../lib/presets";
import { CustomColorPicker } from "./CustomColorPicker";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-150"
      style={{
        background: checked ? "var(--accent)" : "var(--track)",
        borderColor: checked ? "transparent" : "var(--border)",
      }}
    >
      <span
        className="absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(16,24,40,0.35)] transition-all duration-150"
        style={{ left: checked ? 18 : 2 }}
      />
    </button>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12px] font-medium">{label}</div>
        {hint && <div className="text-[10.5px] leading-snug text-muted">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const fill = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <label className="field">
      <span className="field-label">
        <span>{label}</span>
        <span className="field-value">
          {Number(value.toFixed(2))}
          {unit ? ` ${unit}` : ""}
        </span>
      </span>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--fill": `${fill}%` } as CSSProperties}
      />
    </label>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
      {aside}
    </div>
  );
}

export function ColorRow({
  label,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <span className="flex items-center gap-1.5">
          <span className="field-value">{value ?? "None"}</span>
          {allowNone && (
            <button
              type="button"
              className="chip h-5 shrink-0 px-1.5 text-[9px] normal-case tracking-normal"
              aria-pressed={value === null}
              onClick={() => onChange(null)}
            >
              None
            </button>
          )}
        </span>
      </div>
      <div className="flex items-center justify-between">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="swatch"
            style={{ background: swatch }}
            aria-label={`${label} ${swatch}`}
            aria-pressed={value?.toLowerCase() === swatch.toLowerCase()}
            onClick={() => onChange(swatch)}
          />
        ))}
        <CustomColorPicker value={value} onChange={onChange} />
      </div>
    </div>
  );
}
