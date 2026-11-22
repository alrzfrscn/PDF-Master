import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOOL_BY_ID } from "../lib/tools";
import { clampMenuPosition, useContextMenuStore, type MenuItem } from "../stores/useContextMenuStore";
import { useToolStore } from "../stores/useToolStore";
import { TOOL_ICONS } from "./toolIcons";

/** The one floating menu for the whole app: zones only describe what goes in it. */
export function ContextMenu() {
  const menu = useContextMenuStore((state) => state.menu);
  const close = useContextMenuStore((state) => state.close);
  const activeTool = useToolStore((state) => state.activeTool);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(-1);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!menu || !node) return;
    const box = node.getBoundingClientRect();
    setPosition(clampMenuPosition(menu.x, menu.y, box.width, box.height, window.innerWidth, window.innerHeight));
    setActive(-1);
    node.focus();
  }, [menu]);

  // A menu that outlives its spot is a menu over the wrong thing.
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      close();
    };
    const onStray = (event: Event) => {
      if (event.type === "scroll" && ref.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onStray);
    window.addEventListener("scroll", onStray, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onStray);
      window.removeEventListener("scroll", onStray, true);
    };
  }, [menu, close]);

  if (!menu) return null;

  const run = (entry: MenuItem) => {
    if (entry.disabled) return;
    close();
    entry.onSelect();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (menu.entries.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      let next = active;
      for (let moved = 0; moved < menu.entries.length; moved += 1) {
        next = (next + step + menu.entries.length) % menu.entries.length;
        const entry = menu.entries[next];
        if (entry !== "divider" && !entry.disabled) break;
      }
      setActive(next);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      const entry = menu.entries[active];
      if (entry && entry !== "divider") run(entry);
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={menu.label}
      tabIndex={-1}
      className="menu-surface anim-in fixed z-[150] w-[236px] overflow-y-auto rounded-xl p-1.5 outline-none"
      style={{
        left: position?.x ?? menu.x,
        top: position?.y ?? menu.y,
        maxHeight: "calc(100vh - 16px)",
        visibility: position ? "visible" : "hidden",
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.quickTools && menu.quickTools.length > 0 && (
        <>
          <div className="flex items-center gap-1 px-1 py-1">
            {menu.quickTools.map((id) => {
              const Icon = TOOL_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="icon-btn h-8 w-8"
                  aria-pressed={activeTool === id}
                  title={TOOL_BY_ID.get(id)?.name ?? id}
                  onClick={() => {
                    useToolStore.getState().setTool(id);
                    close();
                  }}
                >
                  <Icon size={15} strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
          <div className="divider my-1" />
        </>
      )}

      {menu.entries.map((entry, index) =>
        entry === "divider" ? (
          <div key={`divider-${index}`} className="divider my-1" />
        ) : (
          <button
            key={entry.label}
            type="button"
            role="menuitem"
            aria-disabled={entry.disabled || undefined}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[11.5px] ${
              entry.disabled ? "cursor-default opacity-40" : "hover:bg-[var(--hover)]"
            } ${active === index && !entry.disabled ? "bg-[var(--hover)]" : ""}`}
            style={entry.danger ? { color: "var(--danger)" } : undefined}
            onPointerEnter={() => {
              if (!entry.disabled) setActive(index);
            }}
            onClick={() => run(entry)}
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center" style={{ color: entry.danger ? "var(--danger)" : "var(--muted)" }}>
              {entry.icon && <entry.icon size={13} strokeWidth={1.75} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.shortcut && <span className="shrink-0 text-[10px] text-muted">{entry.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
