import { Command, FileDown, FolderOpen, Grid3x3, PanelLeft, Play, Plus, Redo2, Save, Settings, Sparkles, Stamp, Undo2, X } from "lucide-react";
import { useState } from "react";
import { downloadPdf, exportInputFromTab, exportPdf, type PersistenceMode } from "../lib/pdfEngine";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { ZoomPill } from "./ZoomPill";

export function TopBar() {
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const setActive = useDocStore((state) => state.setActive);
  const closeTab = useDocStore((state) => state.closeTab);
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const auxLines = useUIStore((state) => state.auxLines);
  const toggleAuxLines = useUIStore((state) => state.toggleAuxLines);
  const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
  const setLibraryOpen = useUIStore((state) => state.setLibraryOpen);
  const libraryOpen = useUIStore((state) => state.libraryOpen);
  const setNewDocOpen = useUIStore((state) => state.setNewDocOpen);
  const setPresentation = useUIStore((state) => state.setPresentation);
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);
  const [busy, setBusy] = useState(false);

  const save = async (mode: PersistenceMode) => {
    const tab = useDocStore.getState().tabs.find((item) => item.id === useDocStore.getState().activeId);
    if (!tab || busy) return;
    setBusy(true);
    try {
      const bytes = await exportPdf(exportInputFromTab(tab, mode));
      downloadPdf(bytes, `${tab.title}${mode === "editable" ? "" : "-flattened"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="glass relative z-30 flex h-14 shrink-0 items-center gap-2 border-x-0 border-t-0 px-2.5">
      <button
        type="button"
        className="icon-btn"
        aria-label="Toggle sidebar"
        aria-pressed={sidebarOpen}
        onClick={toggleSidebar}
      >
        <PanelLeft size={17} strokeWidth={1.75} />
      </button>

      <div className="flex items-center gap-2 pl-1 pr-1">
        <div
          className="grid h-8 w-8 place-items-center rounded-[10px] text-white shadow-[0_6px_16px_-8px_rgba(10,132,255,0.9)]"
          style={{ background: "linear-gradient(150deg, #4aa8ff, #0a84ff 45%, #5e5ce6)" }}
        >
          <Sparkles size={16} strokeWidth={1.75} />
        </div>
        <div className="hidden leading-tight sm:block">
          <div className="text-[12.5px] font-semibold tracking-[-0.01em]">PDF Master</div>
          <div className="text-[10px] text-muted">Annotator suite</div>
        </div>
      </div>

      <div className="mx-1 h-7 w-px shrink-0 bg-[var(--border)]" />

      <div className="scroll-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
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
                onClick={() => closeTab(tab.id)}
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

      <div className="hidden md:block">
        <ZoomPill />
      </div>

      <div className="mx-0.5 hidden h-7 w-px bg-[var(--border)] md:block" />

      <button
        type="button"
        className="icon-btn hidden sm:grid"
        aria-label="Open PDF"
        title="Open PDF (Ctrl+O)"
        onClick={() => document.getElementById("pm-pdf-input")?.click()}
      >
        <FolderOpen size={16} strokeWidth={1.75} />
      </button>
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
        className="chip h-8"
        aria-label="Save editable PDF"
        title="Save as PDF with editable annotations (Ctrl+S)"
        disabled={busy}
        onClick={() => void save("editable")}
      >
        <Save size={13} strokeWidth={1.75} /> Save
      </button>
      <button
        type="button"
        className="chip hidden h-8 lg:inline-flex"
        aria-label="Export flattened PDF"
        title="Export flattened PDF"
        disabled={busy}
        onClick={() => void save("flattened")}
      >
        <FileDown size={13} strokeWidth={1.75} /> Flatten
      </button>

      <button
        type="button"
        className="icon-btn hidden md:grid"
        aria-label="Alignment guides"
        aria-pressed={auxLines}
        title="Alignment guides"
        onClick={toggleAuxLines}
      >
        <Grid3x3 size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="icon-btn hidden sm:grid"
        aria-label="Stamp library"
        aria-pressed={libraryOpen}
        title="Stamp library"
        onClick={() => setLibraryOpen(!libraryOpen)}
      >
        <Stamp size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="icon-btn hidden lg:grid"
        aria-label="Command palette"
        title="Command palette (Ctrl+K)"
        onClick={() => setPaletteOpen(true)}
      >
        <Command size={16} strokeWidth={1.75} />
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

      <div className="ml-1">
        <ThemeSwitcher />
      </div>
    </header>
  );
}
