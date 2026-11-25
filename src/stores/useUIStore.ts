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

export type ViewMode = "one-page" | "one-continuous" | "two-page" | "two-continuous";

export type GridStyle = "none" | "squared-5" | "squared-10" | "ruled-8" | "dots-5" | "millimeter";

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
  /** Optional action rendered as an Undo button inside the toast. */
  toastAction: (() => void) | null;
  saving: boolean;
  /** Sticky banner text while workspace autosave keeps failing. */
  autosaveError: string | null;
  eraserSplit: boolean;
  eraserSizeMm: number;
  viewMode: ViewMode;
  separateCoverPage: boolean;
  gridStyle: GridStyle;
  searchOpen: boolean;
  setViewMode: (mode: ViewMode) => void;
  toggleSeparateCoverPage: () => void;
  setGridStyle: (style: GridStyle) => void;
  setSearchOpen: (open: boolean) => void;
  setEraserSplit: (split: boolean) => void;
  setEraserSize: (sizeMm: number) => void;
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
  setToast: (toast: string | null, action?: (() => void) | null) => void;
  setSaving: (saving: boolean) => void;
  setAutosaveError: (error: string | null) => void;
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
  toastAction: null,
  saving: false,
  autosaveError: null,
  eraserSplit: false,
  eraserSizeMm: 5.2,
  viewMode: "one-continuous",
  separateCoverPage: false,
  gridStyle: "none",
  searchOpen: false,
  setViewMode: (viewMode) => set({ viewMode }),
  toggleSeparateCoverPage: () => set((state) => ({ separateCoverPage: !state.separateCoverPage })),
  setGridStyle: (gridStyle) => set({ gridStyle }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setEraserSplit: (eraserSplit) => set({ eraserSplit }),
  setEraserSize: (eraserSizeMm) => set({ eraserSizeMm }),
  setSaving: (saving) => set({ saving }),
  setAutosaveError: (autosaveError) => set({ autosaveError }),
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
  setToast: (toast, action = null) => set({ toast, toastAction: toast ? action : null }),
}));
