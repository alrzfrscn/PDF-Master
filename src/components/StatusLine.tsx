import { paperById, paperTemplates } from "../lib/data";
import { pageMm } from "../lib/paper";
import { TOOL_BY_ID } from "../lib/tools";
import { useDocStore } from "../stores/useDocStore";
import { useToolStore } from "../stores/useToolStore";

export function StatusLine() {
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const zoom = useDocStore((state) => state.zoom);
  const page = useDocStore((state) => state.page);
  const activeTool = useToolStore((state) => state.activeTool);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const template = paperById.get(tab.templateId) ?? paperTemplates[0];
  const size = pageMm(template, tab.landscape);
  const meta = TOOL_BY_ID.get(activeTool);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3.5 right-3.5 z-10 flex items-end justify-between gap-3">
      <div className="glass flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[10.5px] text-muted">
        <span className="font-medium text-fg">{template.name}</span>
        <span className="h-3 w-px bg-[var(--border)]" />
        <span>
          {Number(size.widthMm.toFixed(1))} × {Number(size.heightMm.toFixed(1))} mm
        </span>
        <span className="h-3 w-px bg-[var(--border)]" />
        <span>
          Page {page} / {tab.pageCount}
        </span>
        <span className="h-3 w-px bg-[var(--border)]" />
        <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="glass hidden max-w-[46%] items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[10.5px] text-muted sm:flex">
        <span className="font-medium text-fg">{meta?.name}</span>
        <span className="h-3 w-px bg-[var(--border)]" />
        <span className="truncate">{meta?.hint}</span>
      </div>
    </div>
  );
}
