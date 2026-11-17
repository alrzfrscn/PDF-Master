import { useEffect, useRef } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { Inspector } from "./components/Inspector";
import { NewDocumentModal } from "./components/NewDocumentModal";
import { PaperViewport } from "./components/canvas/PaperViewport";
import { PresentationBar } from "./components/PresentationBar";
import { Sidebar } from "./components/Sidebar";
import { StampLibrary } from "./components/StampLibrary";
import { StatusLine } from "./components/StatusLine";
import { ToolBar } from "./components/ToolBar";
import { TopBar } from "./components/TopBar";
import { downloadPdf, exportInputFromTab, exportPdf } from "./lib/pdfEngine";
import { loadWorkspace, saveWorkspace } from "./lib/storage";
import { TOOLS } from "./lib/tools";
import type { ToolId } from "./lib/types";
import { useAnnotationStore } from "./stores/useAnnotationStore";
import { useDocStore } from "./stores/useDocStore";
import { useToolStore } from "./stores/useToolStore";
import { useUIStore } from "./stores/useUIStore";

const KEY_TO_TOOL = new Map<string, ToolId>(
  TOOLS.filter((tool) => tool.shortcut.length === 1).map((tool) => [tool.shortcut.toLowerCase(), tool.id]),
);

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
  const setTool = useToolStore((state) => state.setTool);
  const zoomBy = useDocStore((state) => state.zoomBy);
  const setFit = useDocStore((state) => state.setFit);
  const setPage = useDocStore((state) => state.setPage);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = useRef(false);

  // Restore the last workspace, then autosave every change to IndexedDB.
  useEffect(() => {
    void loadWorkspace().then((saved) => {
      if (saved) useDocStore.getState().restore(saved.tabs, saved.activeId);
      ready.current = true;
    });
    let timer = 0;
    const unsubscribe = useDocStore.subscribe((state) => {
      if (!ready.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void saveWorkspace(state.tabs, state.activeId), 700);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const annotations = useAnnotationStore.getState();

      if (command) {
        if (key === "k") {
          event.preventDefault();
          useUIStore.getState().setPaletteOpen(!useUIStore.getState().paletteOpen);
          return;
        }
        if (key === "o") {
          event.preventDefault();
          fileRef.current?.click();
          return;
        }
        if (key === "s") {
          event.preventDefault();
          const tab = useDocStore.getState().tabs.find((item) => item.id === useDocStore.getState().activeId);
          if (tab) {
            void exportPdf(exportInputFromTab(tab, "editable")).then((bytes) => downloadPdf(bytes, tab.title));
          }
          return;
        }
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) useDocStore.getState().redo();
          else useDocStore.getState().undo();
          return;
        }
        if (key === "y") {
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

      if (event.altKey) return;

      if (event.key === "+" || event.key === "=") {
        zoomBy(1);
        return;
      }
      if (event.key === "-") {
        zoomBy(-1);
        return;
      }
      if (event.key === "0") {
        setFit("page");
        return;
      }
      if (event.key === "PageDown" || event.key === "PageUp") {
        event.preventDefault();
        setPage(useDocStore.getState().page + (event.key === "PageDown" ? 1 : -1));
        return;
      }

      const tool = KEY_TO_TOOL.get(key);
      if (tool) setTool(tool);
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
        </>
      )}
    </div>
  );
}
