import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Combine,
  CopyPlus,
  FileDown,
  FilePlus,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  Printer,
  Redo2,
  Save,
  Settings,
  Undo2,
  X,
} from "lucide-react";
import { printActiveDocument, saveActiveDocument } from "../lib/save";
import type { DocumentTab } from "../lib/types";
import { useContextMenuStore, keepsNativeMenu } from "../stores/useContextMenuStore";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";
import { CombineModal } from "./CombineModal";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { ZoomPill } from "./ZoomPill";

function FileAction({
  label,
  shortcut,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[11.5px] hover:bg-[var(--hover)] disabled:pointer-events-none disabled:opacity-40"
      disabled={disabled}
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
  if (!tab) return null;
  const count = tab.pages.length;
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
  const hasTab = tabs.length > 0;

  const [filesOpen, setFilesOpen] = useState(false);
  const [combineOpen, setCombineOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const filesRef = useRef<HTMLDivElement>(null);
  const tabStripRef = useRef<HTMLDivElement>(null);

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

  const closeWithUndo = (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (!tab) return;
    closeTab(id);
    if (useDocStore.getState().lastClosedTab?.tab.id === id) {
      setToast(`Closed "${tab.title}"`, () => useDocStore.getState().undoCloseTab());
    }
  };

  const commitRename = (id: string) => {
    useDocStore.getState().renameTab(id, renameDraft);
    setRenamingId(null);
  };

  const openTabMenu = (event: React.MouseEvent, tab: DocumentTab) => {
    if (keepsNativeMenu(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const doc = useDocStore.getState();
    useContextMenuStore.getState().openAt(event.clientX, event.clientY, tab.title, [
      {
        label: "Rename Tab...",
        icon: Pencil,
        onSelect: () => {
          setRenamingId(tab.id);
          setRenameDraft(tab.title);
        },
      },
      {
        label: "Save",
        icon: Save,
        shortcut: "Ctrl+S",
        onSelect: () => {
          doc.setActive(tab.id);
          void saveActiveDocument("editable");
        },
      },
      {
        label: "Save As...",
        icon: Save,
        onSelect: () => {
          doc.setActive(tab.id);
          void saveActiveDocument("editable", true);
        },
      },
      { label: "Duplicate Tab", icon: CopyPlus, onSelect: () => doc.duplicateTab(tab.id) },
      "divider",
      { label: "Close Tab", icon: X, onSelect: () => closeWithUndo(tab.id) },
      {
        label: "Close Other Tabs",
        icon: X,
        disabled: tabs.length <= 1,
        onSelect: () => doc.closeOtherTabs(tab.id),
      },
    ]);
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
                disabled={!hasTab}
                onClick={() => {
                  setFilesOpen(false);
                  void saveActiveDocument("editable");
                }}
              />
              <FileAction
                label="Save As..."
                icon={<Save size={13} />}
                disabled={!hasTab}
                onClick={() => {
                  setFilesOpen(false);
                  void saveActiveDocument("editable", true);
                }}
              />
              <FileAction
                label="Save Flattened PDF..."
                icon={<FileDown size={13} />}
                disabled={!hasTab}
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
                disabled={!hasTab}
                onClick={() => {
                  setFilesOpen(false);
                  void printActiveDocument();
                }}
              />
              <FileAction
                label="Print Current Page"
                icon={<Printer size={13} />}
                disabled={!hasTab}
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
                onContextMenu={(event) => openTabMenu(event, tab)}
              >
                {renamingId === tab.id ? (
                  <input
                    className="h-7 w-[150px] rounded-md border border-[var(--border)] bg-[var(--panel)] px-1.5 text-[11.5px] outline-none"
                    aria-label="Tab name"
                    value={renameDraft}
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={() => commitRename(tab.id)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitRename(tab.id);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setRenamingId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="max-w-[190px] truncate pl-2.5 pr-1 text-[11.5px] font-medium"
                    style={{ color: selected ? "var(--fg)" : "var(--muted)" }}
                    onClick={() => setActive(tab.id)}
                    title={tab.title}
                  >
                    {tab.title}
                  </button>
                )}
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
            aria-label="Open PDF file(s)"
            title="Open PDF file(s)..."
            onClick={() => document.getElementById("pm-pdf-input")?.click()}
          >
            <Plus size={16} strokeWidth={1.75} />
          </button>
        </div>

        {hasTab && (
          <div className="hidden sm:block">
            <PagePill />
          </div>
        )}
        {hasTab && (
          <div className="hidden md:block">
            <ZoomPill />
          </div>
        )}

        <div className="mx-0.5 hidden h-7 w-px bg-[var(--border)] sm:block" />

        <button
          type="button"
          className="icon-btn hidden sm:grid"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!hasTab}
          onClick={() => useDocStore.getState().undo()}
        >
          <Undo2 size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn hidden sm:grid"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          disabled={!hasTab}
          onClick={() => useDocStore.getState().redo()}
        >
          <Redo2 size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn hidden sm:grid"
          aria-label="Save editable PDF"
          title="Save as PDF with editable annotations (Ctrl+S)"
          disabled={!hasTab || saving}
          onClick={() => void saveActiveDocument("editable")}
        >
          <Save size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn hidden sm:grid"
          aria-label="Presentation mode"
          title="Presentation mode"
          disabled={!hasTab}
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

      <CombineModal open={combineOpen} onClose={() => setCombineOpen(false)} />
    </>
  );
}
