import { create } from "zustand";
import type { PenStyle } from "../lib/annotationTypes";
import type { ToolId, ToolProps } from "../lib/types";

export interface FavoriteTool {
  id: string;
  label: string;
  tool: ToolId;
  props: Partial<ToolProps>;
  penStyle?: PenStyle;
}

const KEY = "pm.favoriteTools";

/** The ten shortcuts the Phase 7 wireframe starts with. */
export const DEFAULT_FAVORITES: FavoriteTool[] = [
  { id: "fav-thin-blue", label: "Thin Blue Pen", tool: "pen", penStyle: "pro", props: { color: "#0044FF", thicknessMm: 0.7, opacity: 1, pressureSensitive: true, pressureLevel: 55 } },
  { id: "fav-medium-blue", label: "Medium Blue Pen", tool: "pen", penStyle: "pro", props: { color: "#0044FF", thicknessMm: 1.5, opacity: 1, pressureSensitive: true, pressureLevel: 55 } },
  { id: "fav-thick-blue", label: "Thick Blue Pen", tool: "pen", penStyle: "calligraphy", props: { color: "#0044FF", thicknessMm: 3, opacity: 1, pressureSensitive: true, pressureLevel: 85, smoothing: true } },
  { id: "fav-yellow", label: "Yellow Highlighter", tool: "marker", props: { color: "#FFE600", thicknessMm: 10, opacity: 0.4 } },
  { id: "fav-cyan", label: "Cyan Highlighter", tool: "marker", props: { color: "#00D4FF", thicknessMm: 10, opacity: 0.4 } },
  { id: "fav-green", label: "Green Highlighter", tool: "marker", props: { color: "#10B981", thicknessMm: 10, opacity: 0.4 } },
  { id: "fav-text", label: "Text Tool", tool: "text", props: { color: "#000000", fontSize: 12 } },
  { id: "fav-blue-line", label: "Thin Blue Line", tool: "line", props: { color: "#0044FF", thicknessMm: 1, lineStyle: "solid" } },
  { id: "fav-blue-arrow", label: "Blue Arrow", tool: "arrow", props: { color: "#0044FF", thicknessMm: 1.2, arrowHead: 5, arrowTail: 0 } },
  { id: "fav-amber-arrow", label: "Amber Arrow", tool: "arrow", props: { color: "#F59E0B", thicknessMm: 1.2, arrowHead: 5, arrowTail: 0 } },
];

function readFavorites(): FavoriteTool[] {
  if (typeof localStorage === "undefined") return DEFAULT_FAVORITES;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_FAVORITES;
    const parsed = JSON.parse(raw) as FavoriteTool[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.tool && item?.label) : DEFAULT_FAVORITES;
  } catch {
    return DEFAULT_FAVORITES;
  }
}

function persist(favorites: FavoriteTool[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(favorites));
  } catch {
    // Quota exceeded: the dock stays usable for this session.
  }
}

interface FavoritesState {
  favorites: FavoriteTool[];
  add: (favorite: Omit<FavoriteTool, "id">) => void;
  remove: (id: string) => void;
  /** Replaces the dock from a workspace backup. */
  restore: (favorites: FavoriteTool[]) => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: readFavorites(),
  add: (favorite) => {
    const created: FavoriteTool = {
      ...favorite,
      id: `fav-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)}`,
    };
    const favorites = [...get().favorites, created];
    persist(favorites);
    set({ favorites });
  },
  remove: (id) => {
    const favorites = get().favorites.filter((item) => item.id !== id);
    persist(favorites);
    set({ favorites });
  },
  restore: (favorites) => {
    const valid = favorites.filter((item) => item?.id && item?.tool && item?.label);
    persist(valid);
    set({ favorites: valid });
  },
}));
