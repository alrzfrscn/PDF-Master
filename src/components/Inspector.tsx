import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical, BringToFront, Columns3, Ellipsis, Eraser, Group, HeartPlus, Lock, PanelRightClose, RotateCcw, Ruler, Rows3, Save, SendToBack, Trash2, Ungroup, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { presets, stamps, userStamps } from "../lib/data";
import { pageSizeMm } from "../lib/pageUtils";
import { SHAPE_LABEL, TEXT_FONTS, type Annotation, type AnnotationPatch, type AlignMode, type TextAlign } from "../lib/annotationTypes";
import { useCustomStampStore } from "../lib/customStamps";
import {
  MEASURE_MODES,
  MEASURE_UNITS,
  PRESET_SCALES,
  calibrateDenominator,
  customScaleLabel,
  useScaleStore,
} from "../lib/measure";
import { BASE_PROPS, presetPatch, presetsFor } from "../lib/presets";
import { usePrefsStore } from "../lib/prefs";
import { NO_POPOVER_TOOLS, TOOL_BY_ID } from "../lib/tools";
import { useAnnotationStore } from "../stores/useAnnotationStore";
import { useDocStore } from "../stores/useDocStore";
import { useFavoritesStore } from "../stores/useFavoritesStore";
import { useToolStore } from "../stores/useToolStore";
import { useUIStore } from "../stores/useUIStore";
import { PresetGallery } from "./PresetGallery";
import { PropertyControls } from "./PropertyControls";
import { StampGallery } from "./StampGallery";
import { TOOL_ICONS } from "./toolIcons";
import { ColorRow, SectionTitle, Segmented, SliderRow } from "./ui/controls";

const ALIGNMENTS: { mode: AlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
  { mode: "left", label: "Align left", Icon: AlignStartVertical },
  { mode: "center", label: "Align centre", Icon: AlignCenterVertical },
  { mode: "right", label: "Align right", Icon: AlignEndVertical },
  { mode: "top", label: "Align top", Icon: AlignStartHorizontal },
  { mode: "middle", label: "Align middle", Icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom", Icon: AlignEndHorizontal },
];

function firstValue<T>(annotations: Annotation[], pick: (annotation: Annotation) => T | undefined): T | undefined {
  for (const annotation of annotations) {
    const value = pick(annotation);
    if (value !== undefined) return value;
  }
  return undefined;
}

function MeasureInspector({ pageWidthMm }: { pageWidthMm: number }) {
  const measureMode = useUIStore((state) => state.measureMode);
  const setMeasureMode = useUIStore((state) => state.setMeasureMode);
  const measureUnit = usePrefsStore((state) => state.measureUnit);
  const setPrefs = usePrefsStore((state) => state.set);
  const custom = useScaleStore((state) => state.custom);
  const activeId = useScaleStore((state) => state.activeId);
  const setActive = useScaleStore((state) => state.setActive);
  const addCustom = useScaleStore((state) => state.addCustom);
  const [pageLength, setPageLength] = useState(() => Number(pageWidthMm.toFixed(1)));
  const [realLength, setRealLength] = useState(210);

  const denominator = calibrateDenominator(pageLength, realLength, measureUnit);
  const scales = [...PRESET_SCALES, ...custom];

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--border)] p-2.5">
      <div className="flex items-center gap-2 text-[12px] font-medium">
        <Ruler size={14} /> Measure
      </div>
      <Segmented value={measureMode} options={MEASURE_MODES} onChange={setMeasureMode} />

      <div className="field">
        <span className="field-label">Scale</span>
        <select className="text-input" value={activeId} onChange={(event) => setActive(event.target.value)} aria-label="Measurement scale">
          {scales.map((scale) => (
            <option key={scale.id} value={scale.id}>
              {scale.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span className="field-label">Default unit</span>
        <Segmented
          value={measureUnit}
          options={MEASURE_UNITS}
          onChange={(value) => setPrefs({ measureUnit: value })}
        />
      </div>

      <details className="rounded-xl border border-[var(--border)] px-2.5 py-2">
        <summary className="cursor-pointer text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Calibrate</summary>
        <div className="flex flex-col gap-2 pt-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <label className="field">
              <span className="field-label">On page (mm)</span>
              <input
                type="number"
                min={1}
                step={0.1}
                className="text-input"
                value={pageLength}
                onChange={(event) => setPageLength(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Real length ({measureUnit})</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                className="text-input"
                value={realLength}
                onChange={(event) => setRealLength(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" className="chip h-7 justify-center" onClick={() => setPageLength(Number(pageWidthMm.toFixed(1)))}>
              From page
            </button>
            <button
              type="button"
              className="chip h-7 justify-center"
              disabled={!denominator}
              onClick={() => {
                if (!denominator) return;
                addCustom({ id: `custom-${Date.now().toString(36)}`, label: customScaleLabel(denominator), denominator });
              }}
            >
              <Save size={11} /> Save scale
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

function EraserPanel({ count }: { count: number }) {
  const split = useUIStore((state) => state.eraserSplit);
  const setSplit = useUIStore((state) => state.setEraserSplit);
  const size = useUIStore((state) => state.eraserSizeMm);
  const setSize = useUIStore((state) => state.setEraserSize);

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--border)] p-2.5">
      <div className="flex items-center gap-2 text-[12px] font-medium">
        <Eraser size={14} /> Eraser
      </div>
      <Segmented
        value={split ? "split" : "whole"}
        options={[
          { value: "whole", label: "Whole" },
          { value: "split", label: "Split" },
        ]}
        onChange={(value) => setSplit(value === "split")}
      />
      <SliderRow label="Size" value={size} min={2} max={20} step={0.2} unit="mm" onChange={setSize} />
      <button
        type="button"
        className="chip h-7 justify-center"
        disabled={count === 0}
        onClick={() => useAnnotationStore.getState().mutate(() => [])}
      >
        <Trash2 size={12} /> Clear all
      </button>
    </div>
  );
}

function SelectionInspector({ annotations }: { annotations: Annotation[] }) {
  const update = useAnnotationStore((state) => state.update);
  const align = useAnnotationStore((state) => state.align);
  const distribute = useAnnotationStore((state) => state.distribute);
  const groupSelection = useAnnotationStore((state) => state.groupSelection);
  const ungroupSelection = useAnnotationStore((state) => state.ungroupSelection);
  const setLocked = useAnnotationStore((state) => state.setLocked);
  const bringToFront = useAnnotationStore((state) => state.bringToFront);
  const sendToBack = useAnnotationStore((state) => state.sendToBack);
  const deleteSelection = useAnnotationStore((state) => state.deleteSelection);
  const ids = annotations.map((annotation) => annotation.id);

  const color = firstValue(annotations, (annotation) =>
    annotation.type === "shape"
      ? annotation.strokeColor
      : annotation.type === "text"
        ? annotation.textColor
        : annotation.type === "stamp"
          ? undefined
          : annotation.color,
  );
  const thickness = firstValue(annotations, (annotation) =>
    annotation.type === "shape"
      ? annotation.lineWidthMm
      : annotation.type === "pen" || annotation.type === "marker"
        ? annotation.thicknessMm
        : undefined,
  );
  const opacity = annotations[0]?.opacity ?? 1;
  const fill = firstValue(annotations, (annotation) => (annotation.type === "shape" ? annotation.fillColor : undefined));
  const lineStyle = firstValue(annotations, (annotation) => (annotation.type === "shape" ? annotation.lineStyle : undefined));
  const locked = annotations.every((annotation) => annotation.locked);
  const grouped = annotations.some((annotation) => annotation.groupId);
  const kinds = [...new Set(annotations.map((annotation) => annotation.type === "shape" ? SHAPE_LABEL[annotation.shapeType] : annotation.type === "pen" ? "Pen" : annotation.type === "marker" ? "Highlighter" : annotation.type === "text" ? "Text" : annotation.type === "formula" ? "Formula" : "Stamp"))];

  const patch = (next: AnnotationPatch) => update(ids, next);
  const singleText = annotations.length === 1 && annotations[0].type === "text" ? annotations[0] : null;
  const singleFormula = annotations.length === 1 && annotations[0].type === "formula" ? annotations[0] : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-2.5" style={{ background: "var(--panel)" }}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          <Group size={14} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold">
            {annotations.length} selected
          </div>
          <div className="truncate text-[10px] text-muted">{kinds.join(" · ")}</div>
        </div>
        <button type="button" className="icon-btn h-6 w-6" title="Delete" aria-label="Delete selection" onClick={deleteSelection}>
          <Trash2 size={12} />
        </button>
      </div>

      {color !== undefined && (
        <ColorRow
          label="Colour"
          value={color}
          onChange={(value) => value && patch({ color: value, strokeColor: value, textColor: value })}
        />
      )}
      {thickness !== undefined && (
        <SliderRow
          label="Width"
          value={thickness}
          min={0.2}
          max={32}
          step={0.1}
          unit="mm"
          onChange={(value) => patch({ thicknessMm: value, lineWidthMm: value })}
        />
      )}
      <SliderRow
        label="Opacity"
        value={Math.round(opacity * 100)}
        min={5}
        max={100}
        step={1}
        unit="%"
        onChange={(value) => patch({ opacity: value / 100 })}
      />
      {fill !== undefined && (
        <ColorRow
          label="Fill"
          value={fill}
          allowNone
          onChange={(value) => patch({ fillColor: value, fillTransparent: value === null })}
        />
      )}
      {lineStyle !== undefined && (
        <div className="field">
          <span className="field-label">Line style</span>
          <Segmented
            value={lineStyle}
            options={[
              { value: "solid", label: "Solid" },
              { value: "dash", label: "Dash" },
              { value: "dot", label: "Dot" },
              { value: "dash-dot", label: "Dash-dot" },
            ]}
            onChange={(value) => patch({ lineStyle: value })}
          />
        </div>
      )}

      {singleText && (
        <>
          <SectionTitle>Text</SectionTitle>
          <div className="field">
            <span className="field-label">Font</span>
            <select
              className="text-input"
              value={singleText.fontFamily}
              aria-label="Text font"
              onChange={(event) => patch({ fontFamily: event.target.value })}
            >
              {TEXT_FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>
          <SliderRow
            label="Size"
            value={singleText.fontSizePt}
            min={6}
            max={72}
            step={1}
            unit="pt"
            onChange={(value) => patch({ fontSizePt: value })}
          />
          <ColorRow label="Text" value={singleText.textColor} onChange={(value) => value && patch({ textColor: value })} />
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: "Bold", active: singleText.bold, toggle: () => patch({ bold: !singleText.bold }) },
              { label: "Italic", active: singleText.italic, toggle: () => patch({ italic: !singleText.italic }) },
              { label: "Underline", active: singleText.underline, toggle: () => patch({ underline: !singleText.underline }) },
              { label: "Strike", active: singleText.strikeOut, toggle: () => patch({ strikeOut: !singleText.strikeOut }) },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className="chip h-7 justify-center"
                aria-pressed={item.active}
                onClick={item.toggle}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="field">
            <span className="field-label">Align</span>
            <Segmented<TextAlign>
              value={singleText.align}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Centre" },
                { value: "right", label: "Right" },
              ]}
              onChange={(value) => patch({ align: value })}
            />
          </div>
          <div className="field">
            <span className="field-label">Frame</span>
            <Segmented
              value={String(singleText.frameType)}
              options={[
                { value: "0", label: "None" },
                { value: "1", label: "Box" },
                { value: "2", label: "Round" },
                { value: "3", label: "Shadow" },
              ]}
              onChange={(value) => patch({ frameType: Number(value) as 0 | 1 | 2 | 3 })}
            />
          </div>
          <ColorRow
            label="Text box fill"
            value={singleText.boxFillTransparent ? null : singleText.boxFillColor}
            allowNone
            onChange={(value) =>
              patch({ boxFillColor: value ?? "#ffffff", boxFillTransparent: value === null })
            }
          />
        </>
      )}

      {singleFormula && (
        <>
          <SectionTitle>Formula</SectionTitle>
          <label className="field">
            <span className="field-label">LaTeX</span>
            <input
              className="text-input"
              value={singleFormula.latex}
              aria-label="Formula LaTeX"
              onChange={(event) => patch({ latex: event.target.value })}
            />
          </label>
          <SliderRow
            label="Size"
            value={singleFormula.fontSizePt}
            min={6}
            max={72}
            step={1}
            unit="pt"
            onChange={(value) => patch({ fontSizePt: value })}
          />
          <ColorRow label="Ink" value={singleFormula.color} onChange={(value) => value && patch({ color: value })} />
          <ColorRow
            label="Fill"
            value={singleFormula.fillTransparent ? null : singleFormula.fillColor}
            allowNone
            onChange={(value) => patch({ fillColor: value ?? "#ffffff", fillTransparent: value === null })}
          />
        </>
      )}

      {annotations.length >= 2 && (
        <>
          <SectionTitle>Align</SectionTitle>
          <div className="grid grid-cols-6 gap-1">
            {ALIGNMENTS.map(({ mode, label, Icon }) => (
              <button key={mode} type="button" className="icon-btn h-7 w-full" title={label} aria-label={label} onClick={() => align(mode)}>
                <Icon size={13} />
              </button>
            ))}
          </div>
        </>
      )}
      {annotations.length >= 3 && (
        <div className="grid grid-cols-2 gap-1">
          <button type="button" className="chip h-7 justify-center" onClick={() => distribute("x")}>
            <Columns3 size={12} /> Distribute H
          </button>
          <button type="button" className="chip h-7 justify-center" onClick={() => distribute("y")}>
            <Rows3 size={12} /> Distribute V
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1">
        <button type="button" className="chip h-7 justify-center" onClick={grouped ? ungroupSelection : groupSelection} title={grouped ? "Ungroup" : "Group"}>
          {grouped ? <Ungroup size={12} /> : <Group size={12} />} {grouped ? "Ungroup" : "Group"}
        </button>
        <button type="button" className="chip h-7 justify-center" onClick={() => setLocked(!locked)}>
          {locked ? <Unlock size={12} /> : <Lock size={12} />} {locked ? "Unlock" : "Lock"}
        </button>
        <button type="button" className="chip h-7 justify-center" onClick={locked ? sendToBack : bringToFront}>
          {locked ? <SendToBack size={12} /> : <BringToFront size={12} />} {locked ? "Back" : "Front"}
        </button>
      </div>
    </div>
  );
}

export function Inspector() {
  const activeTool = useToolStore((state) => state.activeTool);
  const selectedStampId = useToolStore((state) => state.selectedStampId);
  const props = useToolStore((state) => state.props[state.activeTool]);
  const setProps = useToolStore((state) => state.setProps);
  const addFavorite = useFavoritesStore((state) => state.add);
  const toolPopoverOpen = useUIStore((state) => state.toolPopoverOpen);
  const toolPopoverPinned = useUIStore((state) => state.toolPopoverPinned);
  const toggleToolPopoverPinned = useUIStore((state) => state.toggleToolPopoverPinned);
  const closeToolPopover = useUIStore((state) => state.closeToolPopover);
  const setToast = useUIStore((state) => state.setToast);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const pageIndex = useDocStore((state) => state.page);
  const selection = useAnnotationStore((state) => state.selection);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const pageNumber = Math.min(Math.max(1, pageIndex), tab.pages.length);
  const page = tab.pages[pageNumber - 1] ?? tab.pages[0];
  const size = pageSizeMm(tab, page);
  const chosen = page.annotations.filter((annotation) => selection.includes(annotation.id));
  const customStamps = useCustomStampStore((state) => state.stamps);

  const meta = TOOL_BY_ID.get(activeTool);
  const Icon = TOOL_ICONS[activeTool];

  const selectedStamp = useMemo(() => {
    const factory = stamps.find((stamp) => stamp.id === selectedStampId);
    if (factory) return { name: factory.title.en, imageUrl: factory.imageUrl, width: factory.width, height: factory.height, sub: "Factory stamp" };
    const user = userStamps.find((stamp) => stamp.id === selectedStampId);
    if (user) return { name: user.name, imageUrl: user.imageUrl, width: user.inkWidth, height: user.inkHeight, sub: user.groupName };
    const custom = customStamps.find((stamp) => stamp.id === selectedStampId);
    if (custom) return { name: custom.name, imageUrl: custom.imageUrl, width: custom.width, height: custom.height, sub: "Saved stamp" };
    return null;
  }, [customStamps, selectedStampId]);

  if (!toolPopoverOpen) return null;
  // Direct-acting tools stay bare unless something is selected.
  if (chosen.length === 0 && NO_POPOVER_TOOLS.includes(activeTool)) return null;

  const addCurrentFavorite = () => {
    addFavorite({ label: meta?.name ?? "Tool", tool: activeTool, props: { ...props }, penStyle: props.penStyle });
    setToast(`${meta?.name ?? "Tool"} added to favourite tools`);
  };

  const resetTool = () => {
    const factory = presetsFor(activeTool, presets)[0];
    setProps({ ...BASE_PROPS, ...(factory ? presetPatch(factory) : {}) });
  };

  return (
    <aside className="inspector glass anim-in absolute right-[74px] top-1/2 z-30 flex max-h-[calc(100vh-96px)] w-[320px] -translate-y-1/2 flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          <Icon size={18} strokeWidth={1.75} />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="text-[13px] font-semibold tracking-[-0.01em]">{chosen.length > 0 ? "Selection" : meta?.name}</span>
          {chosen.length === 0 && (
            <kbd className="rounded border border-[var(--border)] px-1 py-px text-[9px] font-medium text-muted">{meta?.shortcut}</kbd>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {chosen.length === 0 && meta?.needsProperties && activeTool !== "stamp" && (
            <button type="button" className="icon-btn h-7 w-7" aria-label="Add to favourite tools" title="Add to favourite tools" onClick={addCurrentFavorite}>
              <HeartPlus size={13} strokeWidth={1.75} />
            </button>
          )}
          {chosen.length === 0 && meta?.needsProperties && (
            <button type="button" className="icon-btn h-7 w-7" aria-label="Reset tool defaults" title="Reset tool defaults" onClick={resetTool}>
              <RotateCcw size={13} strokeWidth={1.75} />
            </button>
          )}
          {chosen.length === 0 && meta?.needsProperties && activeTool !== "stamp" && (
            <button
              type="button"
              className="icon-btn h-7 w-7"
              aria-label="Factory presets"
              aria-pressed={presetsOpen}
              title="Factory presets"
              onClick={() => setPresetsOpen((open) => !open)}
            >
              <Ellipsis size={13} strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn h-7 w-7"
            aria-label={toolPopoverPinned ? "Unpin popover" : "Pin popover"}
            aria-pressed={toolPopoverPinned}
            title={toolPopoverPinned ? "Pinned: stays open while drawing" : "Unpinned: collapses when you draw"}
            onClick={toggleToolPopoverPinned}
          >
            {toolPopoverPinned ? <Lock size={13} strokeWidth={1.75} /> : <Unlock size={13} strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            className="icon-btn h-7 w-7"
            aria-label="Close popover"
            title="Close"
            onClick={closeToolPopover}
          >
            <PanelRightClose size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-3 py-3">
        {chosen.length > 0 ? (
          <SelectionInspector annotations={chosen} />
        ) : (
          <>
            {activeTool === "eraser" && <EraserPanel count={page.annotations.length} />}
            {activeTool === "measure" && <MeasureInspector pageWidthMm={size.widthMm} />}

            {meta?.needsProperties &&
              (activeTool === "stamp" ? (
                <>
                  {selectedStamp && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] p-2">
                      <span className="checker grid h-11 w-11 shrink-0 place-items-center rounded-lg p-1">
                        {selectedStamp.imageUrl && <img src={selectedStamp.imageUrl} alt={selectedStamp.name} className="max-h-full max-w-full object-contain" />}
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
                </>
              ) : (
                <>
                  <PropertyControls tool={activeTool} />

                  {presetsOpen && (
                    <>
                      <div className="divider" />
                      <PresetGallery tool={activeTool} />
                    </>
                  )}
                </>
              ))}
          </>
        )}
      </div>
    </aside>
  );
}
