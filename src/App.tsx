import { useEffect, useRef } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { Inspector } from "./components/Inspector";
import { NewDocumentModal } from "./components/NewDocumentModal";
import { SettingsModal } from "./components/SettingsModal";
import { PaperViewport } from "./components/canvas/PaperViewport";
import { PresentationBar } from "./components/PresentationBar";
import { Sidebar } from "./components/Sidebar";
import { StampLibrary } from "./components/StampLibrary";
import { StatusLine } from "./components/StatusLine";
import { ToolBar } from "./components/ToolBar";
import { TopBar } from "./components/TopBar";
import { addImageStamp } from "./lib/images";
import { parseBootArgs, resolvePaperTarget } from "./lib/bootArgs";
import { paperTemplates } from "./lib/data";
import { downloadPdf, exportInputFromTab, exportPdf } from "./lib/pdfEngine";
import { readImageFile } from "./lib/raster";
import { bindingFromEvent, normalizeBinding, useShortcutStore } from "./lib/shortcuts";
import { loadWorkspace, saveWorkspace } from "./lib/storage";
import { TOOL_BY_ID } from "./lib/tools";
import type { ToolId } from "./lib/types";
import { useAnnotationStore } from "./stores/useAnnotationStore";
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

export default function App() {
  const presentation = useUIStore((state) => state.presentation);
  const setPresentation = useUIStore((state) => state.setPresentation);
  const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
  const toast = useUIStore((state) => state.toast);
  const setTool = useToolStore((state) => state.setTool);
  const zoomBy = useDocStore((state) => state.zoomBy);
  const setFit = useDocStore((state) => state.setFit);
  const setPage = useDocStore((state) => state.setPage);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = useRef(false);
  const saveFailed = useRef(false);

  // Restore the last workspace, then autosave every change to IndexedDB.
  useEffect(() => {
    const boot = parseBootArgs(typeof window === "undefined" ? "" : window.location.search);
    void loadWorkspace().then((saved) => {
      if (saved) useDocStore.getState().restore(saved.tabs, saved.activeId);
      ready.current = true;
      // Desktop launch contract: a requested paper size, presentation, or print run.
      if (boot.newDoc) {
        const target = resolvePaperTarget(boot.newDoc, paperTemplates);
        if (target) useDocStore.getState().newTab(target.templateId, boot.newDoc.trim(), target.landscape);
      }
      if (boot.fullscreen) useUIStore.getState().setPresentation(true);
      if (boot.print) window.setTimeout(() => window.print(), 500);
    });
    let timer = 0;
    const unsubscribe = useDocStore.subscribe((state) => {
      if (!ready.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void saveWorkspace(state.tabs, state.activeId).then((ok) => {
          if (ok || saveFailed.current) return;
          saveFailed.current = true;
          useUIStore.getState().setToast("Workspace autosave failed — storage may be full. Export a backup from Settings.");
        });
      }, 700);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => useUIStore.getState().setToast(null), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const annotations = useAnnotationStore.getState();
      const pressed = bindingFromEvent(event);
      const action = pressed ? useShortcutStore.getState().resolve().get(normalizeBinding(pressed)) : undefined;

      if (command) {
        if (action === "palette") {
          event.preventDefault();
          useUIStore.getState().setPaletteOpen(!useUIStore.getState().paletteOpen);
          return;
        }
        if (action === "settings") {
          event.preventDefault();
          useUIStore.getState().setSettingsOpen(true);
          return;
        }
        if (action === "presentation") {
          event.preventDefault();
          setPresentation(true);
          return;
        }
        if (action === "open") {
          event.preventDefault();
          fileRef.current?.click();
          return;
        }
        if (action === "save") {
          event.preventDefault();
          const tab = useDocStore.getState().tabs.find((item) => item.id === useDocStore.getState().activeId);
          if (tab) {
            void exportPdf(exportInputFromTab(tab, "editable")).then((bytes) => downloadPdf(bytes, tab.title));
          }
          return;
        }
        if (action === "print") {
          event.preventDefault();
          window.print();
          return;
        }
        if (action === "undo" || (key === "z" && !event.shiftKey)) {
          event.preventDefault();
          useDocStore.getState().undo();
          return;
        }
        if (action === "redo" || key === "y" || (key === "z" && event.shiftKey)) {
          event.preventDefault();
          useDocStore.getState().redo();
          return;
        }
        if (key === "c") {
          if (annotations.selection.length === 0) return;
          event.preventDefault();
          annotations.copySelection();
          return;
        }
        if (key === "x") {
          if (annotations.selection.length === 0) return;
          event.preventDefault();
          annotations.cutSelection();
          return;
        }
        if (key === "v") {
          if (annotations.clipboard.length === 0) return;
          event.preventDefault();
          annotations.paste();
          return;
        }
        if (key === "d") {
          event.preventDefault();
          annotations.duplicateSelection();
          return;
        }
        if (key === "a") {
          event.preventDefault();
          const state = useDocStore.getState();
          const tab = state.tabs.find((item) => item.id === state.activeId);
          const page = tab?.pages[state.page - 1];
          if (page) {
            useAnnotationStore.getState().select(
              page.annotations.filter((annotation) => !annotation.hidden && !annotation.locked).map((annotation) => annotation.id),
            );
          }
          return;
        }
        if (key === "g") {
          event.preventDefault();
          if (event.shiftKey) annotations.ungroupSelection();
          else annotations.groupSelection();
          return;
        }
        return;
      }

      if (event.key === "Escape") {
        const ui = useUIStore.getState();
        if (ui.paletteOpen) ui.setPaletteOpen(false);
        else if (ui.libraryOpen) ui.setLibraryOpen(false);
        else if (ui.settingsOpen) ui.setSettingsOpen(false);
        else if (ui.newDocOpen) ui.setNewDocOpen(false);
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

      if (event.key === "+" || event.key === "=") {
        zoomBy(1);
        return;
      }
      if (event.key === "-") {
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
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void useDocStore.getState().openPdfFile(file);
          event.target.value = "";
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
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="relative min-w-0 flex-1">
              <PaperViewport />
              <ToolBar />
              <StatusLine />
            </main>
            <Inspector />
          </div>
          <CommandPalette />
          <StampLibrary />
          <NewDocumentModal />
          <SettingsModal />
        </>
      )}
      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] -translate-x-1/2">
          <div className="glass-strong rounded-xl px-3.5 py-2 text-[11.5px] shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}
