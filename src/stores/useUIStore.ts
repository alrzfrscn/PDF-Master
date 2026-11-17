import { create } from "zustand";
import type { ThemeName } from "../lib/types";

const THEMES: ThemeName[] = ["light", "dark", "sepia"];
const stored = typeof localStorage === "undefined" ? null : localStorage.getItem("pa.theme");
const systemDark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme: ThemeName =
  stored && THEMES.includes(stored as ThemeName) ? (stored as ThemeName) : systemDark ? "dark" : "light";

if (typeof document !== "undefined") document.documentElement.dataset.theme = initialTheme;

export type SidebarTab = "pages" | "bookmarks" | "annotations" | "favorites";

interface UIState {
  theme: ThemeName;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  auxLines: boolean;
  paletteOpen: boolean;
  libraryOpen: boolean;
  newDocOpen: boolean;
  presentation: boolean;
  eraserSplit: boolean;
  setEraserSplit: (split: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  toggleSidebar: () => void;
  setSidebarTab: (tab: SidebarTab) => void;
  toggleAuxLines: () => void;
  setPaletteOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  setNewDocOpen: (open: boolean) => void;
  setPresentation: (on: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: initialTheme,
  sidebarOpen: true,
  sidebarTab: "pages",
  auxLines: false,
  paletteOpen: false,
  libraryOpen: false,
  newDocOpen: false,
  presentation: false,
  eraserSplit: false,
  setEraserSplit: (eraserSplit) => set({ eraserSplit }),
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pa.theme", theme);
    set({ theme });
  },
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarTab: (sidebarTab) => set({ sidebarTab, sidebarOpen: true }),
  toggleAuxLines: () => set((state) => ({ auxLines: !state.auxLines })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setNewDocOpen: (newDocOpen) => set({ newDocOpen }),
  setPresentation: (presentation) => set({ presentation }),
}));
