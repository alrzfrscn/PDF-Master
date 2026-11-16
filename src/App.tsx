import { useEffect } from "react";
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
import { TOOLS } from "./lib/tools";
import type { ToolId } from "./lib/types";
import { useDocStore } from "./stores/useDocStore";
import { useToolStore } from "./stores/useToolStore";
import { useUIStore } from "./stores/useUIStore";

const KEY_TO_TOOL = new Map<string, ToolId>(
  TOOLS.filter((tool) => tool.shortcut.length === 1).map((tool) => [tool.shortcut.toLowerCase(), tool.id]),
);

export default function App() {
  const presentation = useUIStore((state) => state.presentation);
  const setPresentation = useUIStore((state) => state.setPresentation);
  const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
  const setTool = useToolStore((state) => state.setTool);
  const zoomBy = useDocStore((state) => state.zoomBy);
  const setFit = useDocStore((state) => state.setFit);
  const setPage = useDocStore((state) => state.setPage);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useUIStore.getState().setPaletteOpen(!useUIStore.getState().paletteOpen);
        return;
      }

      if (event.key === "Escape") {
        const ui = useUIStore.getState();
        if (ui.paletteOpen) ui.setPaletteOpen(false);
        else if (ui.libraryOpen) ui.setLibraryOpen(false);
        else if (ui.newDocOpen) ui.setNewDocOpen(false);
        else if (ui.presentation) setPresentation(false);
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;

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

      const tool = KEY_TO_TOOL.get(event.key.toLowerCase());
      if (tool) setTool(tool);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setFit, setPage, setPaletteOpen, setPresentation, setTool, zoomBy]);

  if (presentation) {
    return (
      <div className="app-bg relative h-full w-full overflow-hidden">
        <PaperViewport />
        <PresentationBar />
      </div>
    );
  }

  return (
    <div className="app-bg flex h-full flex-col overflow-hidden">
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
    </div>
  );
}
