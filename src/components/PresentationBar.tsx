import { ChevronLeft, ChevronRight, Minimize2 } from "lucide-react";
import { presets } from "../lib/data";
import type { ToolId } from "../lib/types";
import { useDocStore } from "../stores/useDocStore";
import { useToolStore } from "../stores/useToolStore";
import { useUIStore } from "../stores/useUIStore";
import { TOOL_ICONS } from "./toolIcons";

/** Category 6 holds the presentation recipes shipped with PDF Annotator. */
const presentationPresets = presets
  .filter((preset) => preset.category === 6 && preset.family !== "stamp")
  .filter(
    (preset, index, list) =>
      list.findIndex((other) => other.family === preset.family && other.title === preset.title) === index,
  );

export function PresentationBar() {
  const page = useDocStore((state) => state.page);
  const setPage = useDocStore((state) => state.setPage);
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const setTool = useToolStore((state) => state.setTool);
  const selectPreset = useToolStore((state) => state.selectPreset);
  const setPresentation = useUIStore((state) => state.setPresentation);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];

  return (
    <div className="glass-strong absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl px-2 py-1.5">
      <button
        type="button"
        className="icon-btn"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        <ChevronLeft size={17} strokeWidth={1.75} />
      </button>
      <span className="min-w-[86px] text-center text-[11.5px] tabular-nums text-muted">
        Page {page} / {tab.pageCount}
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Next page"
        disabled={page >= tab.pageCount}
        onClick={() => setPage(page + 1)}
      >
        <ChevronRight size={17} strokeWidth={1.75} />
      </button>

      <span className="mx-0.5 h-6 w-px bg-[var(--border)]" />

      <div className="flex items-center gap-1">
        {presentationPresets.slice(0, 6).map((preset) => {
          const Icon = TOOL_ICONS[preset.family as ToolId] ?? TOOL_ICONS.pen;
          return (
            <button
              key={preset.id}
              type="button"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] hover:bg-[var(--hover)]"
              title={`${preset.family} · ${preset.title}`}
              onClick={() => {
                setTool(preset.family as ToolId);
                selectPreset(preset);
              }}
            >
              <Icon size={15} strokeWidth={1.75} />
              <span className="hidden whitespace-nowrap sm:inline">{preset.title}</span>
            </button>
          );
        })}
      </div>

      <span className="mx-0.5 h-6 w-px bg-[var(--border)]" />

      <button
        type="button"
        className="icon-btn"
        aria-label="Exit presentation mode"
        title="Exit presentation mode (Esc)"
        onClick={() => setPresentation(false)}
      >
        <Minimize2 size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
