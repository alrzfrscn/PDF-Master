import { useEffect, useMemo, useRef, useState } from "react";
import { Command, FileText, Printer, Search } from "lucide-react";
import { paperTemplates } from "../lib/data";
import { TOOLS } from "../lib/tools";
import type { ToolId } from "../lib/types";
import { useDocStore } from "../stores/useDocStore";
import { useToolStore } from "../stores/useToolStore";
import { useUIStore } from "../stores/useUIStore";
import { TOOL_ICONS, type IconComponent } from "./toolIcons";

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  group: "Tools" | "Actions" | "Paper";
  Icon: IconComponent;
  run: () => void;
}

export function CommandPalette() {
  const open = useUIStore((state) => state.paletteOpen);
  const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
  const setTheme = useUIStore((state) => state.setTheme);
  const setNewDocOpen = useUIStore((state) => state.setNewDocOpen);
  const setLibraryOpen = useUIStore((state) => state.setLibraryOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const setPresentation = useUIStore((state) => state.setPresentation);
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);
  const setTool = useToolStore((state) => state.setTool);
  const newTab = useDocStore((state) => state.newTab);
  const setFit = useDocStore((state) => state.setFit);
  const setZoom = useDocStore((state) => state.setZoom);

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<CommandItem[]>(() => {
    const close = () => setPaletteOpen(false);
    const toolItems = TOOLS.map((tool) => ({
      id: `tool-${tool.id}`,
      label: tool.name,
      hint: tool.shortcut,
      group: "Tools" as const,
      Icon: TOOL_ICONS[tool.id],
      run: () => {
        setTool(tool.id as ToolId);
        close();
      },
    }));
    const actions: CommandItem[] = [
      {
        id: "new-document",
        label: "New document…",
        hint: "129 paper recipes",
        group: "Actions",
        Icon: FileText,
        run: () => {
          setNewDocOpen(true);
          close();
        },
      },
      {
        id: "stamp-library",
        label: "Open stamp library",
        hint: "Factory and own stamps",
        group: "Actions",
        Icon: TOOL_ICONS.stamp,
        run: () => {
          setLibraryOpen(true);
          close();
        },
      },
      {
        id: "settings",
        label: "Open settings",
        hint: "Shortcuts, preferences",
        group: "Actions",
        Icon: Command,
        run: () => {
          setSettingsOpen(true);
          close();
        },
      },
      {
        id: "print",
        label: "Print current page",
        hint: "Ctrl+P",
        group: "Actions",
        Icon: Printer,
        run: () => {
          close();
          window.print();
        },
      },
      {
        id: "fit-page",
        label: "Fit page",
        hint: "Zoom",
        group: "Actions",
        Icon: Command,
        run: () => {
          setFit("page");
          close();
        },
      },
      {
        id: "fit-width",
        label: "Fit width",
        hint: "Zoom",
        group: "Actions",
        Icon: Command,
        run: () => {
          setFit("width");
          close();
        },
      },
      {
        id: "zoom-100",
        label: "Zoom to 100 %",
        hint: "⌘0",
        group: "Actions",
        Icon: Command,
        run: () => {
          setZoom(1);
          close();
        },
      },
      {
        id: "toggle-sidebar",
        label: "Toggle sidebar",
        hint: "Panels",
        group: "Actions",
        Icon: FileText,
        run: () => {
          toggleSidebar();
          close();
        },
      },
      {
        id: "presentation",
        label: "Enter presentation mode",
        hint: "Full screen canvas",
        group: "Actions",
        Icon: Command,
        run: () => {
          setPresentation(true);
          close();
        },
      },
      { id: "theme-light", label: "Theme: Apple Light", hint: "Appearance", group: "Actions", Icon: Command, run: () => { setTheme("light"); close(); } },
      { id: "theme-dark", label: "Theme: Apple Dark", hint: "Appearance", group: "Actions", Icon: Command, run: () => { setTheme("dark"); close(); } },
      { id: "theme-sepia", label: "Theme: Sepia", hint: "Appearance", group: "Actions", Icon: Command, run: () => { setTheme("sepia"); close(); } },
    ];
    const paperItems: CommandItem[] = paperTemplates.map((template) => ({
      id: `paper-${template.id}`,
      label: template.name,
      hint: `${template.styleLabel} · ${template.detail || template.page.size}`,
      group: "Paper",
      Icon: FileText,
      run: () => {
        newTab(template.id, template.name);
        close();
      },
    }));
    return [...toolItems, ...actions, ...paperItems];
  }, [newTab, setFit, setLibraryOpen, setNewDocOpen, setPaletteOpen, setPresentation, setSettingsOpen, setTheme, setTool, setZoom, toggleSidebar]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? items.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(needle))
      : items.filter((item) => item.group !== "Paper").concat(items.filter((item) => item.group === "Paper").slice(0, 6));
    return matches.slice(0, 60);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  const run = (item: CommandItem | undefined) => {
    if (!item) return;
    item.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/25 px-4 pt-[10vh] backdrop-blur-[3px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setPaletteOpen(false);
      }}
    >
      <div
        className="glass-strong anim-in flex max-h-[70vh] w-full max-w-[580px] flex-col overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-3.5 py-3">
          <Search size={16} strokeWidth={1.75} className="text-muted" />
          <input
            ref={inputRef}
            className="flex-1 border-0 bg-transparent text-[13.5px] outline-none placeholder:text-muted"
            placeholder="Search tools, stamps, paper and actions…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((current) => Math.min(results.length - 1, current + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((current) => Math.max(0, current - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(results[index]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setPaletteOpen(false);
              }
            }}
            aria-label="Command search"
          />
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[9.5px] text-muted">Esc</kbd>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-[12px] text-muted">Nothing matches “{query}”.</p>
          )}
          {results.map((item, itemIndex) => {
            const showGroup = itemIndex === 0 || results[itemIndex - 1].group !== item.group;
            const Icon = item.Icon;
            return (
              <div key={item.id}>
                {showGroup && (
                  <div className="px-2.5 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {item.group}
                  </div>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left"
                  style={itemIndex === index ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
                  onPointerEnter={() => setIndex(itemIndex)}
                  onClick={() => run(item)}
                >
                  <Icon size={15} strokeWidth={1.75} />
                  <span className="flex-1 truncate text-[12.5px]">{item.label}</span>
                  <span className="shrink-0 text-[10px] text-muted">{item.hint}</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--border)] px-3.5 py-2 text-[10px] text-muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span className="ml-auto">{items.length} commands</span>
        </div>
      </div>
    </div>
  );
}
