import { useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import { penStyleOptions, inkPath } from "../lib/ink";
import type { InkPoint } from "../lib/annotationTypes";
import { useFavoritesStore, type FavoriteTool } from "../stores/useFavoritesStore";
import { useToolStore } from "../stores/useToolStore";
import { useUIStore } from "../stores/useUIStore";
import { TOOL_ICONS } from "./toolIcons";

/** A small ink swatch that shows the saved colour, nib and stroke style. */
function FavoriteGlyph({ item }: { item: FavoriteTool }) {
  const color = item.props.color ?? "#101114";
  const style = item.penStyle ?? item.props.penStyle ?? "pro";
  const level = item.props.pressureLevel ?? 55;
  // Capped so a 16 mm nib still reads as a delicate wave inside a 28 px icon.
  const nib = Math.max(1.4, Math.min(3, 1.4 + Math.sqrt(item.props.thicknessMm ?? 1) * 0.4));
  const opacity = item.props.opacity ?? 1;

  const wave = useMemo(() => {
    const points: InkPoint[] = [];
    for (let index = 0; index <= 24; index += 1) {
      const t = index / 24;
      points.push([3 + t * 26, 14 + Math.sin(t * Math.PI * 2) * 6, 0.35 + Math.sin(t * Math.PI * 3) * 0.5 + 0.5]);
    }
    return inkPath(points, nib, { ...penStyleOptions(style, level), simulatePressure: false });
  }, [level, nib, style]);

  if (item.tool === "pen" || item.tool === "formula") {
    return (
      <svg viewBox="0 0 32 28" className="h-7 w-7" aria-hidden="true">
        <path d={wave} fill={color} opacity={opacity} />
      </svg>
    );
  }
  if (item.tool === "marker") {
    return (
      <svg viewBox="0 0 32 28" className="h-7 w-7" aria-hidden="true">
        <circle cx="16" cy="14" r="9" fill={color} opacity={0.28} />
        <circle cx="16" cy="14" r="6" fill={color} opacity={Math.min(1, opacity + 0.35)} />
      </svg>
    );
  }
  if (item.tool === "text") {
    return (
      <svg viewBox="0 0 32 28" className="h-7 w-7" aria-hidden="true">
        <text x="16" y="21" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="18" fill={color}>
          T
        </text>
      </svg>
    );
  }
  if (item.tool === "line") {
    return (
      <svg viewBox="0 0 32 28" className="h-7 w-7" aria-hidden="true">
        <line x1="6" y1="22" x2="26" y2="7" stroke={color} strokeWidth={nib} strokeLinecap="round" />
      </svg>
    );
  }
  if (item.tool === "arrow") {
    return (
      <svg viewBox="0 0 32 28" className="h-7 w-7" aria-hidden="true">
        <line x1="5" y1="14" x2="24" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M20 9l7 5-7 5z" fill={color} />
      </svg>
    );
  }
  const Icon = TOOL_ICONS[item.tool];
  return <Icon size={18} strokeWidth={1.75} />;
}

export function FavoriteToolsBar() {
  const open = useUIStore((state) => state.favoritesOpen);
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const favorites = useFavoritesStore((state) => state.favorites);
  const remove = useFavoritesStore((state) => state.remove);
  const [editing, setEditing] = useState(false);

  if (!open) return null;

  const activate = (item: FavoriteTool) => {
    const tools = useToolStore.getState();
    tools.setTool(item.tool);
    tools.setProps({ ...item.props, ...(item.penStyle ? { penStyle: item.penStyle } : {}) });
    useUIStore.getState().openToolPopover();
  };

  return (
    <div className="favorite-dock absolute top-1/2 z-30 -translate-y-1/2" style={{ left: sidebarOpen ? 348 : 68 }}>
      <div className="glass no-scrollbar flex max-h-[calc(100vh-140px)] w-11 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto rounded-full px-0 py-1.5">
        {favorites.map((item) => (
          <div key={item.id} className="tooltip relative">
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full border border-transparent transition-colors hover:bg-[var(--hover)]"
              aria-label={item.label}
              title={item.label}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                remove(item.id);
              }}
              onClick={() => activate(item)}
            >
              <FavoriteGlyph item={item} />
            </button>
            {editing && (
              <button
                type="button"
                className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full"
                style={{ background: "var(--danger)", color: "#fff" }}
                aria-label={`Remove ${item.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  remove(item.id);
                }}
              >
                <X size={9} strokeWidth={2.5} />
              </button>
            )}
            <span className="tooltip-body">{item.label}</span>
          </div>
        ))}
        <div className="my-0.5 h-px w-5 bg-[var(--border)]" />
        <button
          type="button"
          className="icon-btn h-7 w-7"
          aria-label={editing ? "Finish editing favourites" : "Edit favourites"}
          aria-pressed={editing}
          title={editing ? "Done" : "Edit favourites"}
          onClick={() => setEditing((value) => !value)}
        >
          <Pencil size={12} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
