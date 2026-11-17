import { pageSizeMm, pageTemplate } from "../lib/pageUtils";
import { TOOL_BY_ID } from "../lib/tools";
import { useAnnotationStore } from "../stores/useAnnotationStore";
import { useDocStore } from "../stores/useDocStore";
import { useToolStore } from "../stores/useToolStore";

export function StatusLine() {
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const zoom = useDocStore((state) => state.zoom);
  const pageIndex = useDocStore((state) => state.page);
  const activeTool = useToolStore((state) => state.activeTool);
  const selection = useAnnotationStore((state) => state.selection);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const page = tab.pages[pageIndex - 1] ?? tab.pages[0];
  const template = pageTemplate(page);
  const size = pageSizeMm(tab, page);
  const meta = TOOL_BY_ID.get(activeTool);

  return (
    <div className="status-line pointer-events-none absolute bottom-3 left-3.5 right-3.5 z-10 flex items-end justify-between gap-3">
      <div className="glass flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[10.5px] text-muted">
        <span className="font-medium text-fg">{page.pdf ? "PDF" : template.name}</span>
        <span className="h-3 w-px bg-[var(--border)]" />
        <span>
          {Number(size.widthMm.toFixed(1))} × {Number(size.heightMm.toFixed(1))} mm
        </span>
        <span className="h-3 w-px bg-[var(--border)]" />
        <span>
          Page {pageIndex} / {tab.pages.length}
        </span>
        <span className="h-3 w-px bg-[var(--border)]" />
        <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
        {page.rotation !== 0 && (
          <>
            <span className="h-3 w-px bg-[var(--border)]" />
            <span>{page.rotation}°</span>
          </>
        )}
      </div>
      <div className="glass hidden max-w-[46%] items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[10.5px] text-muted sm:flex">
        <span className="font-medium text-fg">{selection.length > 0 ? `${selection.length} selected` : meta?.name}</span>
        <span className="h-3 w-px bg-[var(--border)]" />
        <span className="truncate">{selection.length > 0 ? "Arrow keys nudge · Esc clears" : meta?.hint}</span>
      </div>
    </div>
  );
}
