import { create } from "zustand";
import type { ThemeName } from "../lib/types";

const THEMES: ThemeName[] = ["light", "dark", "sepia"];
const stored = typeof localStorage === "undefined" ? null : localStorage.getItem("pa.theme");
const systemDark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme: ThemeName =
  stored && THEMES.includes(stored as ThemeName) ? (stored as ThemeName) : systemDark ? "dark" : "light";

if (typeof document !== "undefined") document.documentElement.dataset.theme = initialTheme;

export type SidebarTab = "pages" | "bookmarks" | "annotations" | "stamps";

export type MeasureModeUi = "distance" | "perimeter" | "area" | "angle";

interface UIState {
  theme: ThemeName;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  drawerPinned: boolean;
  favoritesOpen: boolean;
  toolPopoverOpen: boolean;
  toolPopoverPinned: boolean;
  auxLines: boolean;
  paletteOpen: boolean;
  libraryOpen: boolean;
  newDocOpen: boolean;
  presentation: boolean;
  settingsOpen: boolean;
  measureMode: MeasureModeUi;
  toast: string | null;
  saving: boolean;
  eraserSplit: boolean;
  setEraserSplit: (split: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  toggleSidebar: () => void;
  setSidebarTab: (tab: SidebarTab) => void;
  toggleSidebarTab: (tab: SidebarTab) => void;
  toggleDrawerPinned: () => void;
  toggleFavorites: () => void;
  setFavoritesOpen: (open: boolean) => void;
  openToolPopover: () => void;
  closeToolPopover: () => void;
  toggleToolPopover: () => void;
  toggleToolPopoverPinned: () => void;
  toggleAuxLines: () => void;
  setPaletteOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  setNewDocOpen: (open: boolean) => void;
  setPresentation: (on: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setMeasureMode: (mode: MeasureModeUi) => void;
  setToast: (toast: string | null) => void;
  setSaving: (saving: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: initialTheme,
  sidebarOpen: false,
  sidebarTab: "pages",
  drawerPinned: false,
  favoritesOpen: true,
  toolPopoverOpen: true,
  toolPopoverPinned: false,
  auxLines: false,
  paletteOpen: false,
  libraryOpen: false,
  newDocOpen: false,
  presentation: false,
  settingsOpen: false,
  measureMode: "distance",
  toast: null,
  saving: false,
  eraserSplit: false,
  setEraserSplit: (eraserSplit) => set({ eraserSplit }),
  setSaving: (saving) => set({ saving }),
  setTheme: (theme) => {
    if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
    if (typeof localStorage !== "undefined") localStorage.setItem("pa.theme", theme);
    set({ theme });
  },
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarTab: (sidebarTab) => set({ sidebarTab, sidebarOpen: true }),
  toggleSidebarTab: (sidebarTab) =>
    set((state) => ({
      sidebarTab,
      sidebarOpen: state.sidebarOpen && state.sidebarTab === sidebarTab ? false : true,
    })),
  toggleDrawerPinned: () => set((state) => ({ drawerPinned: !state.drawerPinned })),
  toggleFavorites: () => set((state) => ({ favoritesOpen: !state.favoritesOpen })),
  setFavoritesOpen: (favoritesOpen) => set({ favoritesOpen }),
  openToolPopover: () => set({ toolPopoverOpen: true }),
  closeToolPopover: () => set({ toolPopoverOpen: false }),
  toggleToolPopover: () => set((state) => ({ toolPopoverOpen: !state.toolPopoverOpen })),
  toggleToolPopoverPinned: () => set((state) => ({ toolPopoverPinned: !state.toolPopoverPinned })),
  toggleAuxLines: () => set((state) => ({ auxLines: !state.auxLines })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setNewDocOpen: (newDocOpen) => set({ newDocOpen }),
  setPresentation: (presentation) => set({ presentation }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setMeasureMode: (measureMode) => set({ measureMode }),
  setToast: (toast) => set({ toast }),
}));
