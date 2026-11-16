import { create } from "zustand";
import { DEFAULT_TEMPLATE_ID } from "../lib/data";
import { clamp } from "../lib/paper";
import { ZOOM_STEPS } from "../lib/tools";
import type { DocumentTab } from "../lib/types";

const MILLIMETER_TEMPLATE_ID = "paper-103";

const initialTabs: DocumentTab[] = [
  { id: "doc-a4", title: "A4 Blank", templateId: DEFAULT_TEMPLATE_ID, landscape: false, pageCount: 1 },
  {
    id: "doc-mm",
    title: "A4 Millimeter 1 mm",
    templateId: MILLIMETER_TEMPLATE_ID,
    landscape: false,
    pageCount: 1,
  },
];

interface DocState {
  tabs: DocumentTab[];
  activeId: string;
  zoom: number;
  fitMode: "page" | "width" | null;
  page: number;
  setActive: (id: string) => void;
  newTab: (templateId: string, title: string, landscape?: boolean) => void;
  closeTab: (id: string) => void;
  applyTemplate: (templateId: string, title: string, landscape?: boolean) => void;
  setLandscape: (landscape: boolean) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (direction: 1 | -1) => void;
  setFit: (mode: "page" | "width" | null) => void;
  setPage: (page: number) => void;
}

export const useDocStore = create<DocState>((set, get) => ({
  tabs: initialTabs,
  activeId: initialTabs[0].id,
  zoom: 0.8,
  fitMode: "page",
  page: 1,
  setActive: (activeId) => set({ activeId, fitMode: "page", zoom: 0.8, page: 1 }),
  newTab: (templateId, title, landscape = false) => {
    const tab: DocumentTab = {
      id: `doc-${Date.now()}`,
      title,
      templateId,
      landscape,
      pageCount: 1,
    };
    set((state) => ({ tabs: [...state.tabs, tab], activeId: tab.id, fitMode: "page", page: 1 }));
  },
  closeTab: (id) => {
    const { tabs, activeId } = get();
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    const next = tabs.filter((tab) => tab.id !== id);
    set({
      tabs: next,
      activeId: activeId === id ? next[Math.max(0, index - 1)].id : activeId,
    });
  },
  applyTemplate: (templateId, title, landscape = false) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeId ? { ...tab, templateId, title, landscape } : tab,
      ),
      fitMode: "page",
    })),
  setLandscape: (landscape) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === state.activeId ? { ...tab, landscape } : tab)),
      fitMode: "page",
    })),
  setZoom: (zoom) => set({ zoom: clamp(zoom, 0.1, 6), fitMode: null }),
  zoomBy: (direction) => {
    const zoom = get().zoom;
    const next =
      direction === 1
        ? ZOOM_STEPS.find((step) => step > zoom + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
        : [...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001) ?? ZOOM_STEPS[0];
    set({ zoom: next, fitMode: null });
  },
  setFit: (fitMode) => set({ fitMode }),
  setPage: (page) => {
    const tab = get().tabs.find((item) => item.id === get().activeId);
    set({ page: clamp(page, 1, tab?.pageCount ?? 1) });
  },
}));
