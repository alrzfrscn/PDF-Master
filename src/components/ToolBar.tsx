import { useState } from "react";
import { Shapes } from "lucide-react";
import { isShapeTool, SHAPE_TOOLS, TOOLBAR, TOOL_BY_ID } from "../lib/tools";
import type { ToolId } from "../lib/types";
import { useToolStore } from "../stores/useToolStore";
import { TOOL_ICONS } from "./toolIcons";

const SHAPE_NOTE: Record<string, string> = {
  line: "Straight line",
  arrow: "Arrow",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  polygon: "Polygon",
  dimension: "Dimension",
};

export function ToolBar() {
  const activeTool = useToolStore((state) => state.activeTool);
  const setTool = useToolStore((state) => state.setTool);
  const [shapesOpen, setShapesOpen] = useState(false);

  const shapeActive = isShapeTool(activeTool);
  const ShapeIcon = shapeActive ? TOOL_ICONS[activeTool] : Shapes;

  const renderButton = (entry: ToolId | "shapes") => {
    if (entry === "shapes") {
      const meta = shapeActive ? TOOL_BY_ID.get(activeTool) : null;
      return (
        <div key="shapes" className="tooltip">
          <button
            type="button"
            className="tool-btn"
            aria-pressed={shapesOpen || shapeActive}
            aria-label={meta?.name ?? "Shapes"}
            onClick={() => setShapesOpen((open) => !open)}
          >
            <ShapeIcon size={18} strokeWidth={1.75} />
          </button>
          <span className="tooltip-body">{meta ? `${meta.name} (${meta.shortcut})` : "Shapes"}</span>
        </div>
      );
    }
    const meta = TOOL_BY_ID.get(entry);
    const Icon = TOOL_ICONS[entry];
    if (!meta) return null;
    return (
      <div key={entry} className="tooltip">
        <button
          type="button"
          className="tool-btn"
          aria-pressed={activeTool === entry}
          aria-label={meta.name}
          onClick={() => {
            setTool(entry);
            setShapesOpen(false);
            if (entry === "image") window.dispatchEvent(new Event("pm:pick-image"));
            if (entry === "formula") window.dispatchEvent(new Event("pm:open-formula"));
          }}
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
    <div className="tool-rail absolute left-3.5 top-1/2 z-20 -translate-y-1/2">
      <div className="glass relative flex flex-col items-center gap-1 rounded-[18px] p-1.5">
        {TOOLBAR.map((group, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            {index > 0 && <div className="my-0.5 h-px w-6 bg-[var(--border)]" />}
            {group.map(renderButton)}
          </div>
        ))}

        {shapesOpen && (
          <div className="glass-strong anim-in absolute left-[calc(100%+10px)] top-[76px] w-[168px] rounded-xl p-1">
            {SHAPE_TOOLS.map((shape) => {
              const meta = TOOL_BY_ID.get(shape);
              const Icon = TOOL_ICONS[shape];
              if (!meta) return null;
              return (
                <button
                  key={shape}
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--hover)]"
                  aria-pressed={activeTool === shape}
                  style={
                    activeTool === shape
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : undefined
                  }
                  onClick={() => {
                    setTool(shape);
                    setShapesOpen(false);
                  }}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  <span className="flex-1 text-[12px] font-medium">{SHAPE_NOTE[shape]}</span>
                  <span className="text-[10px] text-muted">{meta.shortcut}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
