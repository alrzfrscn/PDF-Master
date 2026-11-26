import { Maximize2, Minus, MoveHorizontal, Plus } from "lucide-react";
import { isMarkdownTab } from "../lib/types";
import { useDocStore } from "../stores/useDocStore";

export function ZoomPill() {
  const zoom = useDocStore((state) => state.zoom);
  const fitMode = useDocStore((state) => state.fitMode);
  const zoomBy = useDocStore((state) => state.zoomBy);
  const setFit = useDocStore((state) => state.setFit);
  const setZoom = useDocStore((state) => state.setZoom);
  const markdown = useDocStore((state) => {
    const tab = state.tabs.find((item) => item.id === state.activeId) ?? state.tabs[0];
    return isMarkdownTab(tab);
  });

  return (
    <div className="pill">
      {!markdown && (
        <>
          <button
            type="button"
            className="icon-btn h-7 w-7"
            aria-label="Fit to page"
            aria-pressed={fitMode === "page"}
            title="Fit to page"
            onClick={() => setFit("page")}
          >
            <Maximize2 size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn h-7 w-7"
            aria-label="Fit to width"
            aria-pressed={fitMode === "width"}
            title="Fit to width"
            onClick={() => setFit("width")}
          >
            <MoveHorizontal size={14} strokeWidth={1.75} />
          </button>
        </>
      )}
      <button
        type="button"
        className="h-7 min-w-[54px] rounded-lg px-1 text-center text-[11.5px] font-medium tabular-nums hover:bg-[var(--hover)]"
        title="Reset to 100 %"
        data-zoom="reset"
        onClick={() => setZoom(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className="icon-btn h-7 w-7" aria-label="Zoom out" data-zoom="out" onClick={() => zoomBy(-1)}>
        <Minus size={14} strokeWidth={1.75} />
      </button>
      <button type="button" className="icon-btn h-7 w-7" aria-label="Zoom in" data-zoom="in" onClick={() => zoomBy(1)}>
        <Plus size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
