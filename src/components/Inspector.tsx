import { useMemo } from "react";
import { paperById, paperTemplates, presets, stamps, userStamps } from "../lib/data";
import { pageMm } from "../lib/paper";
import { TOOL_BY_ID } from "../lib/tools";
import { useDocStore } from "../stores/useDocStore";
import { useToolStore } from "../stores/useToolStore";
import { PresetGallery } from "./PresetGallery";
import { PropertyControls } from "./PropertyControls";
import { StampGallery } from "./StampGallery";
import { TOOL_ICONS } from "./toolIcons";
import { SectionTitle, Segmented } from "./ui/controls";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11.5px]">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}

export function Inspector() {
  const activeTool = useToolStore((state) => state.activeTool);
  const sync = useToolStore((state) => state.sync);
  const setSync = useToolStore((state) => state.setSync);
  const selectedStampId = useToolStore((state) => state.selectedStampId);

  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const template = paperById.get(tab.templateId) ?? paperTemplates[0];
  const size = pageMm(template, tab.landscape);

  const meta = TOOL_BY_ID.get(activeTool);
  const Icon = TOOL_ICONS[activeTool];

  const selectedStamp = useMemo(() => {
    const factory = stamps.find((stamp) => stamp.id === selectedStampId);
    if (factory) return { name: factory.title.en, imageUrl: factory.imageUrl, width: factory.width, height: factory.height, sub: "Factory stamp" };
    const user = userStamps.find((stamp) => stamp.id === selectedStampId);
    if (user) return { name: user.name, imageUrl: user.imageUrl, width: user.inkWidth, height: user.inkHeight, sub: user.groupName };
    return null;
  }, [selectedStampId]);

  const gridLabel = template.grid
    ? template.grid.deltaXMm ?? template.grid.deltaYMm ?? template.grid.deltaMm
    : null;

  return (
    <aside className="glass m-2 ml-0 hidden w-[316px] shrink-0 flex-col overflow-hidden rounded-2xl lg:flex">
      <div className="flex items-start gap-2.5 border-b border-[var(--border)] px-3 py-2.5">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Icon size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold tracking-[-0.01em]">{meta?.name}</span>
            <kbd className="rounded border border-[var(--border)] px-1 py-px text-[9px] font-medium text-muted">
              {meta?.shortcut}
            </kbd>
          </div>
          <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{meta?.hint}</p>
        </div>
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
        {meta?.needsProperties ? (
          activeTool === "stamp" ? (
            <>
              {selectedStamp && (
                <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] p-2">
                  <span className="checker grid h-11 w-11 shrink-0 place-items-center rounded-lg p-1">
                    {selectedStamp.imageUrl && (
                      <img src={selectedStamp.imageUrl} alt={selectedStamp.name} className="max-h-full max-w-full object-contain" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium">{selectedStamp.name}</span>
                    <span className="block text-[10px] text-muted">
                      {selectedStamp.sub} · {selectedStamp.width} × {selectedStamp.height} px
                    </span>
                  </span>
                </div>
              )}

              <StampGallery />

              <div className="divider" />
              <p className="text-[10.5px] leading-relaxed text-muted">
                Stamps place at their native ink size, exactly as the factory recipes do. Your own stamps come from the
                PDF Annotator Tools folder; pick one here and click the page to place it in Phase 3.
              </p>
            </>
          ) : (
            <>
              <PresetGallery tool={activeTool} />
              <div className="divider" />
              <PropertyControls tool={activeTool} />

              <div className="divider" />
              <SectionTitle>Tool properties</SectionTitle>
              {activeTool === "marker" ? (
                <p className="rounded-lg px-2.5 py-2 text-[10.5px] leading-relaxed" style={{ background: "var(--track)" }}>
                  Highlighter ink is never synchronised, in either direction — the factory contract keeps marker
                  attributes per tool.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Segmented
                    value={sync ? "sync" : "separate"}
                    options={[
                      { value: "separate", label: "Separate" },
                      { value: "sync", label: "Synchronous" },
                    ]}
                    onChange={(value) => setSync(value === "sync")}
                  />
                  <p className="text-[10.5px] leading-relaxed text-muted">
                    {sync
                      ? "Colour and width follow Pen, Text, Formula and the shape tools; line style and fill follow their own groups."
                      : "Every tool keeps its own colour, width, style and fill."}
                  </p>
                </div>
              )}
            </>
          )
        ) : (
          <>
            <SectionTitle>Document</SectionTitle>
            <div className="flex flex-col gap-1.5">
              <InfoRow label="Template" value={template.name} />
              <InfoRow label="Style" value={template.styleLabel} />
              <InfoRow label="Size" value={`${Number(size.widthMm.toFixed(1))} × ${Number(size.heightMm.toFixed(1))} mm`} />
              <InfoRow label="Orientation" value={tab.landscape ? "Landscape" : "Portrait"} />
              <InfoRow label="Grid" value={gridLabel ? `${gridLabel} mm` : "None"} />
              <InfoRow
                label="Margins"
                value={
                  template.bounds
                    ? `${template.bounds.left} / ${template.bounds.top} / ${template.bounds.right} / ${template.bounds.bottom}`
                    : "Full bleed"
                }
              />
              <InfoRow label="Recipe" value={`paper-${String(template.index).padStart(3, "0")}`} />
            </div>
            <div className="divider" />
            <SectionTitle>Migration</SectionTitle>
            <div className="flex flex-col gap-1.5">
              <InfoRow label="Presets" value={`${presets.length} · 21 groups`} />
              <InfoRow label="Paper recipes" value={`${paperTemplates.length}`} />
              <InfoRow label="Factory stamps" value={`${stamps.length}`} />
              <InfoRow label="Your stamps" value={`${userStamps.length}`} />
            </div>
            <p className="text-[10.5px] leading-relaxed text-muted">
              Pick a drawing tool to see its factory presets and live controls.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
