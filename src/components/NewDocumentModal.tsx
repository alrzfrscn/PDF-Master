import { useEffect, useMemo, useState } from "react";
import { FileText, Search, X } from "lucide-react";
import { pdfTemplates, paperById, paperTemplates } from "../lib/data";
import type { PaperTemplate } from "../lib/types";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";
import { Segmented } from "./ui/controls";

function TemplateThumb({ template }: { template: PaperTemplate }) {
  const { widthMm, heightMm, landscape } = template.page;
  const w = landscape ? heightMm : widthMm;
  const h = landscape ? widthMm : heightMm;
  const ratio = w / h;
  const maxW = 58;
  const maxH = 82;
  const boxW = ratio >= maxW / maxH ? maxW : maxH * ratio;
  const boxH = ratio >= maxW / maxH ? maxW / ratio : maxH;
  const x = (70 - boxW) / 2;
  const y = (94 - boxH) / 2;
  const grid = template.grid;
  const stepMm = grid ? (grid.deltaYMm ?? grid.deltaMm ?? (grid.deltaXMm ? grid.deltaXMm : 5)) : 0;
  const rows = grid ? (stepMm <= 2 ? 11 : stepMm <= 6 ? 7 : 4) : 0;
  const cols = grid && (grid.deltaXMm || grid.kind === "grid") ? (stepMm <= 2 ? 8 : stepMm <= 6 ? 5 : 3) : 0;
  const bounds = template.bounds;

  return (
    <svg viewBox="0 0 70 94" className="h-[86px] w-[64px]" aria-hidden="true">
      <rect x={x} y={y} width={boxW} height={boxH} rx="1" fill="var(--paper)" stroke="var(--border)" />
      {rows > 0 &&
        Array.from({ length: rows - 1 }, (_, index) => (
          <line
            key={`r${index}`}
            x1={x + 2}
            x2={x + boxW - 2}
            y1={y + (boxH / rows) * (index + 1)}
            y2={y + (boxH / rows) * (index + 1)}
            stroke="#a9adb5"
            strokeWidth="0.5"
            opacity="0.65"
          />
        ))}
      {cols > 0 &&
        Array.from({ length: cols - 1 }, (_, index) => (
          <line
            key={`c${index}`}
            y1={y + 2}
            y2={y + boxH - 2}
            x1={x + (boxW / cols) * (index + 1)}
            x2={x + (boxW / cols) * (index + 1)}
            stroke="#a9adb5"
            strokeWidth="0.5"
            opacity="0.65"
          />
        ))}
      {bounds && (
        <rect
          x={x + (bounds.left / w) * boxW}
          y={y + (bounds.top / h) * boxH}
          width={boxW * (1 - (bounds.left + bounds.right) / w)}
          height={boxH * (1 - (bounds.top + bounds.bottom) / h)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="0.5"
          strokeDasharray="2 1.5"
          opacity="0.7"
        />
      )}
      <text x="35" y="92" textAnchor="middle" fontSize="4.6" fill="var(--muted)">
        {w} × {h} mm
      </text>
    </svg>
  );
}

export function NewDocumentModal() {
  const open = useUIStore((state) => state.newDocOpen);
  const setNewDocOpen = useUIStore((state) => state.setNewDocOpen);
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const activePageIndex = useDocStore((state) => state.page);
  const applyTemplate = useDocStore((state) => state.applyTemplate);
  const newTab = useDocStore((state) => state.newTab);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const activePage = tab.pages[activePageIndex - 1] ?? tab.pages[0];
  const [size, setSize] = useState("All");
  const [style, setStyle] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(activePage.templateId);

  useEffect(() => {
    if (open) {
      const state = useDocStore.getState();
      const current = state.tabs.find((item) => item.id === state.activeId);
      setSelectedId(current?.pages[state.page - 1]?.templateId ?? current?.templateId ?? tab.templateId);
    }
  }, [open, tab.templateId]);

  const styles = useMemo(() => {
    const seen: string[] = [];
    for (const recipe of paperTemplates) if (!seen.includes(recipe.styleLabel)) seen.push(recipe.styleLabel);
    return seen;
  }, []);
  const sizes = useMemo(() => ["All", ...new Set(paperTemplates.map((recipe) => recipe.page.size))], []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return paperTemplates.filter(
      (recipe) =>
        (size === "All" || recipe.page.size === size) &&
        (style === "All" || recipe.styleLabel === style) &&
        (!needle || recipe.name.toLowerCase().includes(needle)),
    );
  }, [query, size, style]);

  const selected = paperById.get(selectedId) ?? paperTemplates[0];

  if (!open) return null;

  const close = () => setNewDocOpen(false);
  const place = (asNewTab: boolean) => {
    const landscape = selected.page.landscape;
    if (asNewTab) newTab(selected.id, selected.name, landscape);
    else applyTemplate(selected.id, selected.name, landscape);
    useDocStore.getState().setPage(1);
    close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[3px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="glass-strong anim-in flex max-h-[88vh] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="New document"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">New document</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {paperTemplates.length} parametric paper recipes migrated from PAStyleTemplates.xml — every line is drawn as
              vector, not bitmap.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <Segmented
            value={size}
            options={sizes.map((value) => ({ value, label: value }))}
            onChange={setSize}
          />
          <div className="scroll-thin flex max-w-full items-center gap-1 overflow-x-auto">
            <button type="button" className="chip" aria-pressed={style === "All"} onClick={() => setStyle("All")}>
              All styles
            </button>
            {styles.map((label) => (
              <button
                key={label}
                type="button"
                className="chip"
                aria-pressed={style === label}
                onClick={() => setStyle(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative ml-auto block w-[170px]">
            <Search size={13} strokeWidth={1.75} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="text-input pl-7"
              placeholder="Find a recipe…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Find a paper recipe"
            />
          </label>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-2">
            {visible.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className="tile flex flex-col items-center gap-1 px-2 pb-2 pt-1.5 text-center"
                aria-pressed={selectedId === recipe.id}
                onClick={() => setSelectedId(recipe.id)}
                onDoubleClick={() => place(false)}
                title={`${recipe.name}${recipe.detail ? ` · ${recipe.detail}` : ""}`}
              >
                <TemplateThumb template={recipe} />
                <span className="w-full truncate text-[11px] font-medium leading-tight">{recipe.name}</span>
                <span className="w-full truncate text-[9.5px] text-muted">
                  {recipe.detail ? `${recipe.styleLabel} · ${recipe.detail}` : `${recipe.styleLabel} · ${recipe.page.size}`}
                </span>
              </button>
            ))}
          </div>
          {visible.length === 0 && (
            <p className="py-10 text-center text-[12px] text-muted">No recipe matches these filters.</p>
          )}

          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Note PDF templates</h3>
            <div className="flex flex-wrap gap-2">
              {pdfTemplates.map((pdf) => (
                <button
                  key={pdf.name}
                  type="button"
                  className="chip h-7"
                  title={`${Math.round(pdf.bytes / 1024)} kB · sha256 ${pdf.sha256.slice(0, 12)}…`}
                  onClick={() => {
                    void useDocStore.getState().openPdfUrl(pdf.url, pdf.name);
                    close();
                  }}
                >
                  <FileText size={12} strokeWidth={1.75} /> {pdf.name}
                </button>
              ))}
              <button
                type="button"
                className="chip h-7"
                onClick={() => {
                  document.getElementById("pm-pdf-input")?.click();
                  close();
                }}
              >
                <FileText size={12} strokeWidth={1.75} /> Open another PDF…
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
          <div className="min-w-0 text-[11.5px]">
            <span className="text-muted">Selected </span>
            <span className="font-medium">{selected.name}</span>
            <span className="text-muted"> · {selected.page.landscape ? "landscape" : "portrait"}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" className="chip h-8 px-3" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="h-8 rounded-[10px] border border-[var(--border)] bg-[var(--hover)] px-3 text-[12px] font-medium hover:bg-[var(--active)]"
              onClick={() => place(true)}
            >
              Open in new tab
            </button>
            <button
              type="button"
              className="h-8 rounded-[10px] px-3.5 text-[12px] font-semibold"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              onClick={() => place(false)}
            >
              Use template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
