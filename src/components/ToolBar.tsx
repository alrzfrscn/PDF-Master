import { Shapes } from "lucide-react";
import { isShapeTool, NO_POPOVER_TOOLS, TOOLBAR, TOOL_BY_ID } from "../lib/tools";
import type { ToolId } from "../lib/types";
import { useAnnotationStore } from "../stores/useAnnotationStore";
import { useDocStore } from "../stores/useDocStore";
import { useToolStore } from "../stores/useToolStore";
import { useUIStore } from "../stores/useUIStore";
import { TOOL_ICONS } from "./toolIcons";

export function ToolBar() {
  const hasTab = useDocStore((state) => state.tabs.length > 0);
  const activeTool = useToolStore((state) => state.activeTool);
  const setTool = useToolStore((state) => state.setTool);
  const shapeActive = isShapeTool(activeTool);
  const ShapeIcon = shapeActive ? TOOL_ICONS[activeTool] : Shapes;

  if (!hasTab) return null;

  const pickTool = (tool: ToolId) => {
    const ui = useUIStore.getState();
    const selection = useAnnotationStore.getState().selection;
    if (useToolStore.getState().activeTool === tool) {
      if (!NO_POPOVER_TOOLS.includes(tool)) ui.toggleToolPopover();
      return;
    }
    setTool(tool);
    if (NO_POPOVER_TOOLS.includes(tool)) {
      if (tool === "select" && selection.length > 0) ui.openToolPopover();
      else ui.closeToolPopover();
    } else {
      ui.openToolPopover();
    }
    if (tool === "image") window.dispatchEvent(new Event("pm:pick-image"));
    if (tool === "formula") window.dispatchEvent(new Event("pm:open-formula"));
  };

  const renderButton = (entry: ToolId | "shapes") => {
    if (entry === "shapes") {
      return (
        <div key="shapes" className="tooltip tooltip-left">
          <button
            type="button"
            className="tool-btn"
            aria-pressed={shapeActive}
            aria-label="Shapes"
            onClick={() => {
              const tools = useToolStore.getState();
              const ui = useUIStore.getState();
              // A second click on the already-active Shapes button closes the popover.
              if (isShapeTool(tools.activeTool)) {
                ui.toggleToolPopover();
                return;
              }
              tools.setTool(tools.lastShapeTool);
              ui.openToolPopover();
            }}
          >
            <ShapeIcon size={18} strokeWidth={1.75} />
          </button>
          <span className="tooltip-body">{shapeActive ? `${TOOL_BY_ID.get(activeTool)?.name}` : "Shapes"}</span>
        </div>
      );
    }
    const meta = TOOL_BY_ID.get(entry);
    const Icon = TOOL_ICONS[entry];
    if (!meta) return null;
    return (
      <div key={entry} className="tooltip tooltip-left">
        <button
          type="button"
          className="tool-btn"
          aria-pressed={activeTool === entry}
          aria-label={meta.name}
          onClick={() => pickTool(entry)}
        >
          <Icon size={18} strokeWidth={1.75} />
        </button>
        <span className="tooltip-body">
          {meta.name} <span className="text-muted">{meta.shortcut}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="tool-rail absolute right-[18px] top-1/2 z-30 -translate-y-1/2">
      <div className="glass no-scrollbar relative flex flex-col items-center gap-1 rounded-[18px] p-1">
        {TOOLBAR.map((group, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            {index > 0 && <div className="my-0.5 h-px w-6 bg-[var(--border)]" />}
            {group.map(renderButton)}
          </div>
        ))}
      </div>
    </div>
  );
}
