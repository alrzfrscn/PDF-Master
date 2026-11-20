import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Combine,
  FileDown,
  FilePlus,
  FolderOpen,
  Play,
  Plus,
  Printer,
  Redo2,
  Save,
  Settings,
  Undo2,
  X,
} from "lucide-react";
import { combinePdfs, exportInputFromTab, exportPdf } from "../lib/pdfEngine";
import { printActiveDocument, saveActiveDocument } from "../lib/save";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { ZoomPill } from "./ZoomPill";

function FileAction({
  label,
  shortcut,
  icon,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[11.5px] hover:bg-[var(--hover)]"
      onClick={onClick}
    >
      <span className="text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[10px] text-muted">{shortcut}</span>}
    </button>
  );
}

function PagePill() {
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const page = useDocStore((state) => state.page);
  const setPage = useDocStore((state) => state.setPage);
  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const count = tab?.pages.length ?? 1;
  const current = Math.min(Math.max(1, page), count);

  return (
    <div className="pill">
      <button type="button" className="icon-btn h-7 w-7" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}>
        <ChevronLeft size={14} strokeWidth={1.75} />
      </button>
      <select
        className="h-7 min-w-[64px] max-w-[96px] cursor-pointer whitespace-nowrap rounded-md bg-transparent px-0.5 text-center text-[11.5px] font-medium tabular-nums outline-none"
        aria-label="Jump to page"
        value={current}
        onChange={(event) => setPage(Number(event.target.value))}
      >
        {tab.pages.map((item, index) => (
          <option key={item.id} value={index + 1}>
            {index + 1} / {count}
          </option>
        ))}
      </select>
      <button type="button" className="icon-btn h-7 w-7" aria-label="Next page" disabled={current >= count} onClick={() => setPage(current + 1)}>
        <ChevronRight size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function TopBar() {
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const setActive = useDocStore((state) => state.setActive);
  const closeTab = useDocStore((state) => state.closeTab);
  const setNewDocOpen = useUIStore((state) => state.setNewDocOpen);
  const setPresentation = useUIStore((state) => state.setPresentation);
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);
  const saving = useUIStore((state) => state.saving);
  const setToast = useUIStore((state) => state.setToast);

  const [filesOpen, setFilesOpen] = useState(false);
  const [combineOpen, setCombineOpen] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<string[]>([]);
  const [combineFiles, setCombineFiles] = useState<File[]>([]);
  const filesRef = useRef<HTMLDivElement>(null);
  const combineRef = useRef<HTMLInputElement>(null);
  const tabStripRef = useRef<HTMLDivElement>(null);

  const pdfTabs = tabs;

  useEffect(() => {
    if (!filesOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (filesRef.current?.contains(event.target as Node)) return;
      setFilesOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [filesOpen]);

  // A mouse wheel over the tab strip walks through tabs instead of the page.
  useEffect(() => {
    const strip = tabStripRef.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      strip.scrollLeft -= event.deltaY;
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!combineOpen) return;
    setSelectedTabIds(pdfTabs.map((tab) => tab.id));
    setCombineFiles([]);
    // Only the tab list at opening time matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combineOpen]);

  const combine = async () => {
    const parts: Uint8Array[] = [];
    try {
      for (const id of selectedTabIds) {
        const tab = tabs.find((item) => item.id === id);
        // Export each tab so annotations, crops, page order and paper pages survive.
        if (tab) parts.push(await exportPdf(exportInputFromTab(tab, "flattened")));
      }
      for (const file of combineFiles) parts.push(new Uint8Array(await file.arrayBuffer()));
      if (parts.length < 2) {
        setToast("Choose at least two documents to combine");
        return;
      }
      const bytes = await combinePdfs(parts);
      await useDocStore.getState().openPdfBytes(bytes, `Combined ${parts.length} documents`);
      setCombineOpen(false);
      setToast(`Combined ${parts.length} documents`);
    } catch (error) {
      setToast(`Could not combine: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const closeWithUndo = (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (!tab) return;
    closeTab(id);
    if (useDocStore.getState().lastClosedTab?.tab.id === id) {
      setToast(`Closed "${tab.title}"`, () => useDocStore.getState().undoCloseTab());
    }
  };

  return (
    <>
      <header className="top-bar glass relative z-[120] flex h-14 shrink-0 items-center gap-2 border-x-0 border-t-0 px-2.5">
        <div ref={filesRef} className="relative">
          <button
            type="button"
            className="chip h-8 gap-1.5 px-2.5"
            aria-label="Files menu"
            aria-expanded={filesOpen}
            onClick={() => setFilesOpen((open) => !open)}
          >
            <FolderOpen size={14} strokeWidth={1.75} /> Files
          </button>
          {filesOpen && (
            <div className="menu-surface anim-in absolute left-0 top-[calc(100%+6px)] z-[100] w-[228px] rounded-xl p-1.5">
              <FileAction
                label="Open Document..."
                shortcut="Ctrl+O"
                icon={<FolderOpen size={13} />}
                onClick={() => {
                  setFilesOpen(false);
                  document.getElementById("pm-pdf-input")?.click();
                }}
              />
              <FileAction
                label="Create Document..."
                icon={<FilePlus size={13} />}
                onClick={() => {
                  setFilesOpen(false);
                  setNewDocOpen(true);
                }}
              />
              <FileAction
                label="Combine Documents..."
                icon={<Combine size={13} />}
                onClick={() => {
                  setFilesOpen(false);
                  setCombineOpen(true);
                }}
              />
              <div className="divider my-1" />
              <FileAction
                label="Save"
                shortcut="Ctrl+S"
                icon={<Save size={13} />}
                onClick={() => {
                  setFilesOpen(false);
                  void saveActiveDocument("editable");
                }}
              />
              <FileAction
                label="Save As..."
                icon={<Save size={13} />}
                onClick={() => {
                  setFilesOpen(false);
                  void saveActiveDocument("editable", true);
                }}
              />
              <FileAction
                label="Save Flattened PDF..."
                icon={<FileDown size={13} />}
                onClick={() => {
                  setFilesOpen(false);
                  void saveActiveDocument("flattened");
                }}
              />
              <div className="divider my-1" />
              <FileAction
                label="Print..."
                shortcut="Ctrl+P"
                icon={<Printer size={13} />}
                onClick={() => {
                  setFilesOpen(false);
                  void printActiveDocument();
                }}
              />
              <FileAction
                label="Print Current Page"
                icon={<Printer size={13} />}
                onClick={() => {
                  setFilesOpen(false);
                  window.print();
                }}
              />
            </div>
          )}
        </div>

        <div className="mx-0.5 h-7 w-px shrink-0 bg-[var(--border)]" />

        <div ref={tabStripRef} className="scroll-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
          {tabs.map((tab) => {
            const selected = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className={`group flex h-8 shrink-0 items-center gap-1 rounded-[10px] border pr-1 transition-colors ${
                  selected ? "border-[var(--border)] bg-[var(--glass-strong)] shadow-sm" : "border-transparent hover:bg-[var(--hover)]"
                }`}
              >
                <button
                  type="button"
                  className="max-w-[190px] truncate pl-2.5 pr-1 text-[11.5px] font-medium"
                  style={{ color: selected ? "var(--fg)" : "var(--muted)" }}
                  onClick={() => setActive(tab.id)}
                  title={tab.title}
                >
                  {tab.title}
                </button>
                <button
                  type="button"
                  className="grid h-5 w-5 place-items-center rounded-md text-muted opacity-0 transition-opacity hover:bg-[var(--active)] hover:text-fg group-hover:opacity-100"
                  aria-label={`Close ${tab.title}`}
                  onClick={() => closeWithUndo(tab.id)}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="icon-btn h-8 w-8 shrink-0"
            aria-label="New document"
            title="New document"
            onClick={() => setNewDocOpen(true)}
          >
            <Plus size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="hidden sm:block">
          <PagePill />
        </div>
        <div className="hidden md:block">
          <ZoomPill />
        </div>

        <div className="mx-0.5 hidden h-7 w-px bg-[var(--border)] sm:block" />

        <button
          type="button"
          className="icon-btn hidden sm:grid"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          onClick={() => useDocStore.getState().undo()}
        >
          <Undo2 size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn hidden sm:grid"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          onClick={() => useDocStore.getState().redo()}
        >
          <Redo2 size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn hidden sm:grid"
          aria-label="Save editable PDF"
          title="Save as PDF with editable annotations (Ctrl+S)"
          disabled={saving}
          onClick={() => void saveActiveDocument("editable")}
        >
          <Save size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn hidden sm:grid"
          aria-label="Presentation mode"
          title="Presentation mode"
          onClick={() => setPresentation(true)}
        >
          <Play size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn hidden sm:grid"
          aria-label="Settings"
          title="Settings (Ctrl+,)"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={16} strokeWidth={1.75} />
        </button>
        <div className="ml-1 hidden sm:block">
          <ThemeSwitcher />
        </div>
      </header>

      {combineOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[3px]"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setCombineOpen(false);
          }}
        >
          <div className="glass-strong anim-in flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl" role="dialog" aria-modal="true" aria-label="Combine documents">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <Combine size={16} />
              <span className="flex-1 text-[13px] font-semibold">Combine documents</span>
              <button type="button" className="icon-btn h-7 w-7" aria-label="Close combine dialog" onClick={() => setCombineOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-4 py-3">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Open tabs</span>
              {pdfTabs.length === 0 ? (
                <p className="text-[11px] text-muted">No tabs are open. Choose files below.</p>
              ) : (
                pdfTabs.map((tab) => (
                  <label key={tab.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-[11.5px] hover:bg-[var(--hover)]">
                    <input
                      type="checkbox"
                      checked={selectedTabIds.includes(tab.id)}
                      onChange={(event) =>
                        setSelectedTabIds((ids) =>
                          event.target.checked ? [...ids, tab.id] : ids.filter((id) => id !== tab.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                    <span className="text-[10px] text-muted">{tab.pages.length} pages</span>
                  </label>
                ))
              )}

              <div className="divider" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">PDF files</span>
                <button type="button" className="chip h-7" onClick={() => combineRef.current?.click()}>
                  <FilePlus size={12} /> Choose files
                </button>
              </div>
              {combineFiles.length > 0 && (
                <div className="flex flex-col gap-1">
                  {combineFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-[11.5px]">
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <button
                        type="button"
                        className="icon-btn h-5 w-5"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setCombineFiles((list) => list.filter((_, position) => position !== index))}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={combineRef}
                type="file"
                multiple
                accept="application/pdf,.pdf"
                className="hidden"
                aria-label="Choose PDF files to combine"
                onChange={(event) => {
                  setCombineFiles((list) => [...list, ...Array.from(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
              <button type="button" className="chip h-8" onClick={() => setCombineOpen(false)}>
                Cancel
              </button>
              <button type="button" className="chip h-8" aria-pressed="true" onClick={() => void combine()}>
                <Combine size={13} /> Combine
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
