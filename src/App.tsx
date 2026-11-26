import { useEffect, useRef } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { ContextMenu } from "./components/ContextMenu";
import { FavoriteToolsBar } from "./components/FavoriteToolsBar";
import { Inspector } from "./components/Inspector";
import { NewDocumentModal } from "./components/NewDocumentModal";
import { SearchBar } from "./components/SearchBar";
import { SettingsModal } from "./components/SettingsModal";
import { PaperViewport } from "./components/canvas/PaperViewport";
import { PresentationBar } from "./components/PresentationBar";
import { Sidebar } from "./components/Sidebar";
import { StampLibrary } from "./components/StampLibrary";
import { ToolBar } from "./components/ToolBar";
import { TopBar } from "./components/TopBar";
import { addImageStamp } from "./lib/images";
import { parseBootArgs, resolvePaperTarget } from "./lib/bootArgs";
import { paperTemplates } from "./lib/data";
import { loadMirroredStamps, useCustomStampStore } from "./lib/customStamps";
import { readImageFile } from "./lib/raster";
import { printActiveDocument, saveActiveDocument } from "./lib/save";
import { bindingFromEvent, normalizeBinding, useShortcutStore } from "./lib/shortcuts";
import { loadWorkspace, downloadWorkspaceBackup, saveWorkspace } from "./lib/storage";
import { base64ToBytes } from "./lib/base64";
import { TOOL_BY_ID } from "./lib/tools";
import type { ToolId } from "./lib/types";
import { useAnnotationStore } from "./stores/useAnnotationStore";
import { keepsNativeMenu } from "./stores/useContextMenuStore";
import { useDocStore } from "./stores/useDocStore";
import { useToolStore } from "./stores/useToolStore";
import { useUIStore } from "./stores/useUIStore";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

/** Shortcuts that need an open document; on the welcome screen they do nothing. */
const DOCUMENT_ACTIONS = new Set([
  "save",
  "print",
  "undo",
  "redo",
  "copy",
  "cut",
  "paste",
  "duplicate",
  "select-all",
  "group",
  "ungroup",
  "search",
  "fit-page",
  "view-one-page",
  "view-one-continuous",
  "view-two-continuous",
  "view-two-page",
  "toggle-cover-page",
  "presentation",
]);

/** The desktop shell bridge, present only when this page runs inside Tauri. */
function tauriBridge(): { invoke?: (command: string) => Promise<unknown> } | undefined {
  return (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: (command: string) => Promise<unknown> };
  }).__TAURI_INTERNALS__;
}

/**
 * A `.pdf` opened from Windows Explorer reaches the Rust shell as a positional
 * argument; it reads the file once and this bridge turns it into a tab.
 */
async function openStartupPdf(): Promise<void> {
  const bridge = tauriBridge();
  if (!bridge?.invoke) return;
  try {
    const pdf = (await bridge.invoke("get_startup_pdf")) as { name: string; base64: string } | null;
    if (!pdf?.base64) return;
    await useDocStore.getState().openPdfBytes(base64ToBytes(pdf.base64), pdf.name);
  } catch {
    // No document was requested, or this is not the desktop shell.
  }
}

/** `--new` / `--print` / `--fullscreen` from the shell, or the URL query in a browser. */
async function readBootQuery(): Promise<string> {
  const bridge = tauriBridge();
  if (!bridge?.invoke) return window.location.search;
  try {
    return (await bridge.invoke("get_boot_query")) as string;
  } catch {
    return window.location.search;
  }
}

export default function App() {
  const presentation = useUIStore((state) => state.presentation);
  const setPresentation = useUIStore((state) => state.setPresentation);
  const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
  const toast = useUIStore((state) => state.toast);
  const toastAction = useUIStore((state) => state.toastAction);
  const autosaveError = useUIStore((state) => state.autosaveError);
  const setTool = useToolStore((state) => state.setTool);
  const zoomBy = useDocStore((state) => state.zoomBy);
  const setFit = useDocStore((state) => state.setFit);
  const setPage = useDocStore((state) => state.setPage);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = useRef(false);
  const saveFailed = useRef(false);

  // Restore the last workspace, then autosave every change to IndexedDB.
  useEffect(() => {
    void Promise.all([readBootQuery(), loadWorkspace()]).then(async ([query, saved]) => {
      const boot = parseBootArgs(query);
      if (saved) useDocStore.getState().restore(saved.tabs, saved.activeId);
      // The IndexedDB mirror survives a cleared localStorage; only a newer copy wins.
      void loadMirroredStamps().then((mirrored) => {
        if (mirrored) useCustomStampStore.getState().restoreIfNewer(mirrored);
      });
      ready.current = true;
      // Desktop launch contract: a requested paper size, presentation, or print run.
      if (boot.newDoc) {
        const target = resolvePaperTarget(boot.newDoc, paperTemplates);
        if (target) useDocStore.getState().newTab(target.templateId, boot.newDoc.trim(), target.landscape);
      }
      if (boot.fullscreen) useUIStore.getState().setPresentation(true);
      // After the workspace restore, so a file opened from Explorer becomes the active tab.
      await openStartupPdf();
      if (boot.print) void printActiveDocument();
    });
    let timer = 0;
    let pending: { tabs: import("./lib/types").DocumentTab[]; activeId: string } | null = null;
    // Structural changes only: zoom, page and tool updates do not touch `tabs`.
    let lastTabs = useDocStore.getState().tabs;
    let lastActiveId = useDocStore.getState().activeId;
    const flush = () => {
      window.clearTimeout(timer);
      timer = 0;
      const value = pending;
      pending = null;
      if (!value) return;
      void saveWorkspace(value.tabs, value.activeId).then((ok) => {
        if (ok) {
          saveFailed.current = false;
          useUIStore.getState().setAutosaveError(null);
          return;
        }
        if (saveFailed.current) return;
        saveFailed.current = true;
        useUIStore
          .getState()
          .setAutosaveError("Workspace autosave failed — storage may be full. Export a backup.");
      });
    };
    const unsubscribe = useDocStore.subscribe((state) => {
      if (!ready.current) return;
      if (state.tabs === lastTabs && state.activeId === lastActiveId) return;
      lastTabs = state.tabs;
      lastActiveId = state.activeId;
      pending = { tabs: state.tabs, activeId: state.activeId };
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 1000);
    });
    // A hidden page or a closed window must not lose the last second of edits.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => useUIStore.getState().setToast(null), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // The workspace owns its context menus; only text fields keep the browser's.
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (!keepsNativeMenu(event.target)) event.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

  // An unpinned tool popover collapses as soon as the next stroke starts.
  useEffect(() => {
    const onStrokeBegin = () => {
      const ui = useUIStore.getState();
      if (!ui.toolPopoverPinned) ui.closeToolPopover();
    };
    window.addEventListener("pm:stroke-begin", onStrokeBegin);
    return () => window.removeEventListener("pm:stroke-begin", onStrokeBegin);
  }, []);

  // Images arrive through the clipboard as files, not annotations.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const items = [...(event.clipboardData?.items ?? [])];
      const item = items.find((entry) => entry.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void readImageFile(file)
        .then((image) => addImageStamp(image))
        .catch(() => useUIStore.getState().setToast("That clipboard image could not be read"));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // WebView2 claims Ctrl/⌘ +/-/0 for its own UI scaling before the app sees it.
  // Capture the keys, stop the default zoom, and let the app's shortcuts run.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const zoomKey = ["+", "=", "-", "_", "0"].includes(event.key) ||
        ["Equal", "Minus", "NumpadAdd", "NumpadSubtract", "Digit0", "Numpad0"].includes(event.code);
      if (zoomKey) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const annotations = useAnnotationStore.getState();
      const pressed = bindingFromEvent(event);
      const action = pressed ? useShortcutStore.getState().resolve().get(normalizeBinding(pressed)) : undefined;
      if (action && DOCUMENT_ACTIONS.has(action) && useDocStore.getState().tabs.length === 0) return;

      switch (action) {
        case "palette":
          event.preventDefault();
          useUIStore.getState().setPaletteOpen(!useUIStore.getState().paletteOpen);
          return;
        case "settings":
          event.preventDefault();
          useUIStore.getState().setSettingsOpen(true);
          return;
        case "presentation":
          event.preventDefault();
          setPresentation(true);
          return;
        case "open":
          event.preventDefault();
          fileRef.current?.click();
          return;
        case "save":
          event.preventDefault();
          void saveActiveDocument("editable");
          return;
        case "print":
          event.preventDefault();
          void printActiveDocument();
          return;
        case "undo":
          event.preventDefault();
          useDocStore.getState().undo();
          return;
        case "redo":
          event.preventDefault();
          useDocStore.getState().redo();
          return;
        case "copy":
          if (annotations.selection.length === 0) return;
          event.preventDefault();
          annotations.copySelection();
          return;
        case "cut":
          if (annotations.selection.length === 0) return;
          event.preventDefault();
          annotations.cutSelection();
          return;
        case "paste":
          if (annotations.clipboard.length === 0) return;
          event.preventDefault();
          annotations.paste();
          return;
        case "duplicate":
          event.preventDefault();
          annotations.duplicateSelection();
          return;
        case "select-all": {
          event.preventDefault();
          const state = useDocStore.getState();
          const tab = state.tabs.find((item) => item.id === state.activeId);
          const page = tab?.pages[state.page - 1];
          if (page) {
            annotations.select(
              page.annotations.filter((annotation) => !annotation.hidden && !annotation.locked).map((annotation) => annotation.id),
            );
          }
          return;
        }
        case "group":
          event.preventDefault();
          annotations.groupSelection();
          return;
        case "ungroup":
          event.preventDefault();
          annotations.ungroupSelection();
          return;
        case "search":
          event.preventDefault();
          useUIStore.getState().setSearchOpen(true);
          return;
        case "view-one-page":
          event.preventDefault();
          useUIStore.getState().setViewMode("one-page");
          return;
        case "view-one-continuous":
          event.preventDefault();
          useUIStore.getState().setViewMode("one-continuous");
          return;
        case "view-two-continuous":
          event.preventDefault();
          useUIStore.getState().setViewMode("two-continuous");
          return;
        case "view-two-page":
          event.preventDefault();
          useUIStore.getState().setViewMode("two-page");
          return;
        case "toggle-cover-page":
          event.preventDefault();
          useUIStore.getState().toggleSeparateCoverPage();
          return;
      }

      if (event.key === "Escape") {
        const ui = useUIStore.getState();
        if (ui.searchOpen) ui.setSearchOpen(false);
        else if (ui.paletteOpen) ui.setPaletteOpen(false);
        else if (ui.libraryOpen) ui.setLibraryOpen(false);
        else if (ui.settingsOpen) ui.setSettingsOpen(false);
        else if (ui.newDocOpen) ui.setNewDocOpen(false);
        else if (ui.toolPopoverOpen) ui.closeToolPopover();
        else if (ui.sidebarOpen) ui.toggleSidebar();
        else if (ui.presentation) setPresentation(false);
        else useAnnotationStore.getState().clearSelection();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (annotations.selection.length === 0) return;
        event.preventDefault();
        annotations.deleteSelection();
        return;
      }

      if (event.key.startsWith("Arrow")) {
        if (annotations.selection.length === 0) return;
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        annotations.nudge(dx, dy);
        return;
      }

      if (action === "fit-page") {
        setFit("page");
        return;
      }
      if (action && TOOL_BY_ID.has(action as ToolId)) {
        setTool(action as ToolId);
        return;
      }

      if (event.altKey) return;

      if (event.code === "Equal" || event.code === "NumpadAdd" || event.key === "+") {
        zoomBy(1);
        return;
      }
      if (event.code === "Minus" || event.code === "NumpadSubtract" || event.key === "-") {
        zoomBy(-1);
        return;
      }
      if (event.key === "PageDown" || event.key === "PageUp") {
        event.preventDefault();
        setPage(useDocStore.getState().page + (event.key === "PageDown" ? 1 : -1));
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setFit, setPage, setPaletteOpen, setPresentation, setTool, zoomBy]);

  return (
    <div className="app-bg flex h-full flex-col overflow-hidden">
      <input
        ref={fileRef}
        id="pm-pdf-input"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void (async () => {
            for (const file of files) await useDocStore.getState().openPdfFile(file);
          })();
        }}
      />
      {presentation ? (
        <div className="relative h-full w-full overflow-hidden">
          <PaperViewport />
          <PresentationBar />
        </div>
      ) : (
        <>
          <TopBar />
          {autosaveError && (
            <div
              className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[11px]"
              style={{ background: "var(--track)", color: "var(--warning, #b26a00)" }}
            >
              <span className="min-w-0 flex-1">{autosaveError}</span>
              <button
                type="button"
                className="chip h-6 px-2"
                onClick={() => {
                  const state = useDocStore.getState();
                  downloadWorkspaceBackup(state.tabs, state.activeId);
                }}
              >
                Export Backup
              </button>
              <button
                type="button"
                className="chip h-6 px-2"
                onClick={() => {
                  const state = useDocStore.getState();
                  void saveWorkspace(state.tabs, state.activeId).then((ok) => {
                    if (!ok) return;
                    saveFailed.current = false;
                    useUIStore.getState().setAutosaveError(null);
                  });
                }}
              >
                Retry
              </button>
            </div>
          )}
          <div className="relative flex min-h-0 flex-1">
            <Sidebar />
            <FavoriteToolsBar />
            <main className="relative h-full min-w-0 flex-1 overflow-hidden">
              <PaperViewport />
              <ToolBar />
              <Inspector />
            </main>
            <SearchBar />
          </div>
          <CommandPalette />
          <StampLibrary />
          <NewDocumentModal />
          <SettingsModal />
        </>
      )}
      <ContextMenu />
      {toast && (
        <div className={`fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 ${toastAction ? "pointer-events-auto" : "pointer-events-none"}`}>
          <div className="glass-strong flex items-center gap-2 rounded-xl px-3.5 py-2 text-[11.5px] shadow-lg">
            <span>{toast}</span>
            {toastAction && (
              <button
                type="button"
                className="chip h-6 px-2"
                onClick={() => {
                  toastAction();
                  useUIStore.getState().setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
