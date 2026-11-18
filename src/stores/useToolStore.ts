import { create } from "zustand";
import { presets, stamps } from "../lib/data";
import { BASE_PROPS, presetPatch, presetsFor } from "../lib/presets";
import { applyToolPatch } from "../lib/sync";
import { isShapeTool, TOOLS } from "../lib/tools";
import type { Preset, ShapeTool, ToolId, ToolProps } from "../lib/types";

function initialProps(): Record<ToolId, ToolProps> {
  const map = {} as Record<ToolId, ToolProps>;
  for (const tool of TOOLS) {
    const factory = presetsFor(tool.id, presets)[0];
    map[tool.id] = { ...BASE_PROPS, ...(factory ? presetPatch(factory) : {}) };
  }
  return map;
}

function stampPresetId(preset: Preset): string | null {
  if (preset.family !== "stamp") return null;
  return stamps.find((stamp) => stamp.title.en === preset.title)?.id ?? null;
}

interface ToolState {
  activeTool: ToolId;
  /** The shape the Shapes rail button reopens; remembers the last one picked. */
  lastShapeTool: ShapeTool;
  props: Record<ToolId, ToolProps>;
  sync: boolean;
  activePreset: Partial<Record<ToolId, string>>;
  selectedStampId: string | null;
  recentStamps: string[];
  setTool: (tool: ToolId) => void;
  setProps: (patch: Partial<ToolProps>) => void;
  setSync: (sync: boolean) => void;
  selectPreset: (preset: Preset) => void;
  selectStamp: (stampId: string) => void;
}

export const useToolStore = create<ToolState>((set, get) => ({
  activeTool: "pen",
  lastShapeTool: "rectangle",
  props: initialProps(),
  sync: false,
  activePreset: {},
  selectedStampId: stamps[0]?.id ?? null,
  recentStamps: [],
  setTool: (activeTool) =>
    set(isShapeTool(activeTool) ? { activeTool, lastShapeTool: activeTool } : { activeTool }),
  setProps: (patch) => {
    const { props, activeTool, sync } = get();
    set({ props: applyToolPatch(props, activeTool, patch, sync), activePreset: { ...get().activePreset, [activeTool]: "" } });
  },
  setSync: (sync) => set({ sync }),
  selectPreset: (preset) => {
    const { props, sync } = get();
    // Graphical presets are filtered by type, so they always belong to the active shape tool.
    const target: ToolId = preset.family === "graphical" ? get().activeTool : (preset.family as ToolId);
    const stampId = stampPresetId(preset);
    set({
      props: applyToolPatch(props, target, presetPatch(preset), sync),
      activePreset: { ...get().activePreset, [target]: preset.id },
      selectedStampId: stampId ?? get().selectedStampId,
    });
  },
  selectStamp: (selectedStampId) =>
    set((state) => ({
      selectedStampId,
      activeTool: "stamp",
      recentStamps: [selectedStampId, ...state.recentStamps.filter((id) => id !== selectedStampId)].slice(0, 8),
    })),
}));
