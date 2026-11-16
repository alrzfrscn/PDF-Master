import { useMemo } from "react";
import { groupById, presets } from "../lib/data";
import { presetsFor } from "../lib/presets";
import type { Preset, ToolId } from "../lib/types";
import { useToolStore } from "../stores/useToolStore";
import { SectionTitle } from "./ui/controls";

function PresetSwatch({ preset }: { preset: Preset }) {
  const props = preset.props;
  const color = props.color?.hex ?? props.fontColor?.hex ?? "var(--fg)";
  const back = props.backColor && !props.backColor.transparent ? props.backColor.hex : null;
  const stroke = Math.min(11, Math.max(1, (props.thicknessMm ?? props.lineWidthMm ?? 1) * 1.6));
  const opacity = 1 - (props.inkTransparency ?? 0) / 100;

  if (preset.family === "text") {
    return (
      <svg viewBox="0 0 100 40" className="h-full w-full" aria-hidden="true">
        <text
          x="50"
          y="26"
          textAnchor="middle"
          fill={color}
          fontSize={Math.min(22, 8 + (props.fontSize ?? 10) * 0.8)}
          fontFamily={props.fontName ?? "Arial"}
          fontWeight={props.bold ? 700 : 400}
          fontStyle={props.italic ? "italic" : "normal"}
        >
          Aa
        </text>
      </svg>
    );
  }

  if (preset.family === "stamp") {
    return (
      <svg viewBox="0 0 100 40" className="h-full w-full" aria-hidden="true">
        <circle cx="50" cy="20" r="12" fill="none" stroke={color} strokeWidth="1.6" opacity="0.8" />
        <path d="M44 20.5l4.5 4.5L57 14.5" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (preset.family === "graphical") {
    const common = { fill: "none", stroke: color, strokeWidth: stroke, opacity };
    return (
      <svg viewBox="0 0 100 40" className="h-full w-full" aria-hidden="true">
        {preset.typeCode === 0 && <line x1="14" y1="28" x2="86" y2="12" {...common} strokeLinecap="round" />}
        {preset.typeCode === 1 && (
          <g {...common} strokeLinecap="round">
            <line x1="14" y1="28" x2="82" y2="12" />
            <path d="M82 12l-10-1 4 9z" fill={color} stroke="none" />
          </g>
        )}
        {preset.typeCode === 2 && (
          <rect x="22" y="8" width="56" height="24" rx="2" {...common} fill={back ?? "none"} />
        )}
        {preset.typeCode === 3 && <ellipse cx="50" cy="20" rx="28" ry="12" {...common} fill={back ?? "none"} />}
        {preset.typeCode === 6 && (
          <g {...common} strokeLinecap="round">
            <line x1="16" y1="20" x2="84" y2="20" />
            <path d="M16 20l5-3M16 20l5 3M84 20l-5-3M84 20l-5 3" />
          </g>
        )}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 40" className="h-full w-full" aria-hidden="true">
      <line
        x1="12"
        y1="20"
        x2="88"
        y2="20"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        opacity={preset.family === "marker" ? Math.min(1, opacity * 0.75) : opacity}
      />
    </svg>
  );
}

export function PresetGallery({ tool }: { tool: ToolId }) {
  const list = useMemo(() => presetsFor(tool, presets), [tool]);
  const activePreset = useToolStore((state) => state.activePreset[tool]);
  const selectPreset = useToolStore((state) => state.selectPreset);

  const grouped = useMemo(() => {
    const map = new Map<string, Preset[]>();
    for (const preset of list) {
      const bucket = map.get(preset.groupSlug) ?? [];
      bucket.push(preset);
      map.set(preset.groupSlug, bucket);
    }
    return [...map.entries()];
  }, [list]);

  if (list.length === 0) {
    return <p className="text-[11.5px] leading-relaxed text-muted">This tool has no factory presets; it uses the live controls below.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle aside={<span className="text-[10px] text-muted">{list.length} factory</span>}>Presets</SectionTitle>
      {grouped.map(([slug, items]) => (
        <div key={slug} className="flex flex-col gap-1.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.07em] text-muted/80">
            {groupById.get(items[0].groupId)?.captions.en ?? items[0].subtitle}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {items.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="tile flex flex-col overflow-hidden text-left"
                aria-pressed={activePreset === preset.id}
                onClick={() => selectPreset(preset)}
                title={`${preset.title} · ${preset.subtitle}`}
              >
                <span className="h-8 w-full px-2 pt-1.5">
                  <PresetSwatch preset={preset} />
                </span>
                <span className="flex flex-col px-2 pb-1.5 pt-0.5">
                  <span className="truncate text-[11px] font-medium leading-tight">{preset.title}</span>
                  <span className="truncate text-[9.5px] text-muted">{preset.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
