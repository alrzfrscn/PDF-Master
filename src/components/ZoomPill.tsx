import { Minus, Plus } from "lucide-react";
import { useDocStore } from "../stores/useDocStore";

export function ZoomPill() {
  const zoom = useDocStore((state) => state.zoom);
  const fitMode = useDocStore((state) => state.fitMode);
  const zoomBy = useDocStore((state) => state.zoomBy);
  const setFit = useDocStore((state) => state.setFit);
  const setZoom = useDocStore((state) => state.setZoom);

  const cycle = () => {
    if (fitMode === "page") setFit("width");
    else if (fitMode === "width") setZoom(1);
    else setFit("page");
  };
  const label = fitMode === "page" ? "Fit page" : fitMode === "width" ? "Fit width" : "Custom zoom";

  return (
    <div className="pill">
      <button type="button" className="icon-btn h-7 w-7" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
        <Minus size={14} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="h-7 min-w-[62px] rounded-lg px-1 text-center text-[11.5px] font-medium tabular-nums hover:bg-[var(--hover)]"
        onClick={cycle}
        title={`${label} — click to cycle fit page, fit width, 100 %`}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className="icon-btn h-7 w-7" aria-label="Zoom in" onClick={() => zoomBy(1)}>
        <Plus size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
