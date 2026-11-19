import { useEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";
import { SWATCHES } from "../../lib/presets";

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

interface Hsv {
  h: number;
  s: number;
  v: number;
}

const RECENT_KEY = "pm.recentColors";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean.padEnd(6, "0");
  const number = Number.parseInt(value.slice(0, 6), 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const part = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = parseHex(hex).map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const sector = Math.floor(h / 60) % 6;
  const [r, g, b] =
    sector === 0 ? [c, x, 0] :
    sector === 1 ? [x, c, 0] :
    sector === 2 ? [0, c, x] :
    sector === 3 ? [0, x, c] :
    sector === 4 ? [x, 0, c] :
    [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function readRecent(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(colors: string[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(RECENT_KEY, JSON.stringify(colors.slice(0, 8)));
}

const QUICK = SWATCHES.slice(0, 9);

/** Apple-style glass colour studio: SV square, hue slider, eyedropper, hex and RGB. */
export function CustomColorPicker({
  value,
  onChange,
  className = "",
}: {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value ?? "#101114"));
  const [hexText, setHexText] = useState(value ?? "#101114");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const dragging = useRef(false);
  const squareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const next = hexToHsv(value ?? "#101114");
    setHsv(next);
    setHexText(hsvToHex(next));
  }, [open, value]);

  const commit = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexText(hex);
    onChange(hex);
  };

  const remember = (color: string) => {
    setRecent((previous) => {
      const next = [color, ...previous.filter((item) => item.toLowerCase() !== color.toLowerCase())].slice(0, 8);
      saveRecent(next);
      return next;
    });
  };

  const pick = (clientX: number, clientY: number) => {
    const rect = squareRef.current?.getBoundingClientRect();
    if (!rect) return;
    commit({ ...hsv, s: clamp01((clientX - rect.left) / rect.width), v: 1 - clamp01((clientY - rect.top) / rect.height) });
  };

  const applyHex = (text: string) => {
    setHexText(text);
    if (/^#[0-9a-f]{6}$/i.test(text)) {
      const next = hexToHsv(text);
      setHsv(next);
      onChange(text.toUpperCase());
    }
  };

  const [r, g, b] = parseHex(hsvToHex(hsv));
  const rgb = { r, g, b };
  const solid = value ?? hsvToHex(hsv);

  const dropColor = async () => {
    if (!window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      applyHex(result.sRGBHex);
      remember(result.sRGBHex);
    } catch {
      // The user cancelled the eyedropper.
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        className="relative grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-[7px] border border-[var(--border)]"
        title="Custom colour"
        aria-label="Custom colour"
        aria-pressed={open}
        onClick={() => setOpen((state) => !state)}
        style={{
          backgroundColor: solid,
          backgroundImage: value ? undefined : "conic-gradient(#ff3b30, #ffcc00, #34c759, #0a84ff, #5e5ce6, #ff2d55, #ff3b30)",
        }}
      >
        {!value && <span className="text-[9px] font-bold text-white drop-shadow">+</span>}
      </button>

      {open && (
        <div
          className="menu-surface anim-in absolute right-0 top-[calc(100%+8px)] z-[100] w-[244px] rounded-2xl p-2.5"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            ref={squareRef}
            className="relative h-[132px] w-full cursor-crosshair overflow-hidden rounded-xl border border-[var(--border)]"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              pick(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (dragging.current) pick(event.clientX, event.clientY);
            }}
            onPointerUp={(event) => {
              dragging.current = false;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              remember(hsvToHex(hsv));
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
          >
            <span
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.55)]"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solid }}
            />
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              className="icon-btn h-7 w-7 shrink-0"
              title="Eyedropper"
              aria-label="Eyedropper"
              disabled={!window.EyeDropper}
              onClick={() => void dropColor()}
            >
              <Pipette size={13} />
            </button>
            <input
              type="range"
              className="hue-range min-w-0 flex-1"
              min={0}
              max={360}
              step={1}
              value={Math.round(hsv.h)}
              aria-label="Hue"
              onChange={(event) => commit({ ...hsv, h: Number(event.target.value) })}
            />
            <span
              className="h-6 w-6 shrink-0 rounded-[7px] border border-[var(--border)]"
              style={{ background: solid }}
              aria-hidden="true"
            />
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <input
              className="text-input h-7 min-w-0 flex-1 text-[11px] uppercase"
              value={hexText}
              aria-label="Hex colour"
              placeholder="#0044FF"
              onChange={(event) => applyHex(event.target.value)}
              onBlur={() => remember(hsvToHex(hsv))}
            />
            {(["r", "g", "b"] as const).map((channel) => (
              <label key={channel} className="flex items-center gap-0.5 rounded-md border border-[var(--border)] px-1 text-[9px] uppercase text-muted">
                {channel}
                <input
                  type="number"
                  min={0}
                  max={255}
                  className="h-6 w-8 bg-transparent text-[10.5px] tabular-nums outline-none"
                  value={rgb[channel]}
                  aria-label={`${channel.toUpperCase()} channel`}
                  onChange={(event) => {
                    const next = { ...rgb, [channel]: Number(event.target.value) };
                    applyHex(rgbToHex(next.r, next.g, next.b));
                  }}
                />
              </label>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-9 gap-1">
            {QUICK.map((color) => (
              <button
                key={color}
                type="button"
                className="h-5 w-full rounded-[5px] border border-[var(--border)]"
                style={{ background: color }}
                aria-label={`Colour ${color}`}
                onClick={() => {
                  applyHex(color);
                  remember(color);
                }}
              />
            ))}
          </div>

          {recent.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-[0.06em] text-muted">Recent</span>
              {recent.slice(0, 6).map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-4 w-4 rounded-full border border-[var(--border)]"
                  style={{ background: color }}
                  aria-label={`Recent colour ${color}`}
                  onClick={() => applyHex(color)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
