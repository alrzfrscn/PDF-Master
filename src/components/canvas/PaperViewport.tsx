import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { paperById, paperTemplates } from "../../lib/data";
import { clamp, fitScale, pageMm } from "../../lib/paper";
import { useDocStore } from "../../stores/useDocStore";
import { useToolStore } from "../../stores/useToolStore";
import { useUIStore } from "../../stores/useUIStore";
import { PaperSheet } from "./PaperSheet";

export function PaperViewport() {
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const zoom = useDocStore((state) => state.zoom);
  const fitMode = useDocStore((state) => state.fitMode);
  const activeTool = useToolStore((state) => state.activeTool);
  const auxLines = useUIStore((state) => state.auxLines);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const template = paperById.get(tab.templateId) ?? paperTemplates[0];

  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);

  // Fit to the viewport whenever that fit was requested or the page changes.
  useLayoutEffect(() => {
    if (!fitMode) return;
    const element = viewportRef.current;
    if (!element) return;
    const apply = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // Keep `fitMode` so the page keeps refitting while the window resizes.
      useDocStore.setState({
        zoom: fitScale(rect.width, rect.height, pageMm(template, tab.landscape), fitMode, 120),
      });
      setPan({ x: 0, y: 0 });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitMode, template, tab.landscape]);

  // Ctrl/⌘ + wheel zooms about the cursor; a bare wheel pans the workspace.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        const cursorX = event.clientX - rect.left - rect.width / 2;
        const cursorY = event.clientY - rect.top - rect.height / 2;
        const next = clamp(zoom * Math.exp(-event.deltaY * 0.0016), 0.1, 6);
        const ratio = next / zoom;
        setPan((current) => ({
          x: cursorX - (cursorX - current.x) * ratio,
          y: cursorY - (cursorY - current.y) * ratio,
        }));
        useDocStore.setState({ zoom: next, fitMode: null });
      } else {
        setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoom]);

  // Hold space to pan with any tool active.
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTyping(event.target)) {
        event.preventDefault();
        setSpaceDown(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const canPan = activeTool === "hand" || spaceDown;
  const cursor = drag.current ? "grabbing" : canPan ? "grab" : "default";

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full overflow-hidden"
      style={{ cursor }}
      onPointerDown={(event) => {
        if (!canPan && event.button !== 1) return;
        drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        setPan({
          x: drag.current.panX + event.clientX - drag.current.x,
          y: drag.current.panY + event.clientY - drag.current.y,
        });
      }}
      onPointerUp={(event) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => useDocStore.getState().setFit("page")}
    >
      <div
        className="absolute left-1/2 top-1/2 will-change-transform"
        style={{
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <PaperSheet template={template} landscape={tab.landscape} aux={auxLines} />
      </div>
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border), transparent)" }}
      />
    </div>
  );
}
