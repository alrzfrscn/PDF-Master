import { create } from "zustand";
import { DEFAULT_TEMPLATE_ID } from "../lib/data";
import { clamp } from "../lib/paper";
import { ZOOM_STEPS } from "../lib/tools";
import type { DocumentPage, DocumentTab } from "../lib/types";
import { inspectPdf, loadSidecar, type InspectedPdf } from "../lib/pdfEngine";

const MILLIMETER_TEMPLATE_ID = "paper-103";

export function makeId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function newPage(templateId: string, annotations: DocumentPage["annotations"] = []): DocumentPage {
  return { id: makeId("page"), templateId, rotation: 0, annotations };
}

const initialTabs: DocumentTab[] = [
  {
    id: "doc-a4",
    title: "A4 Blank",
    templateId: DEFAULT_TEMPLATE_ID,
    landscape: false,
    pageCount: 1,
    pages: [newPage(DEFAULT_TEMPLATE_ID)],
  },
  {
    id: "doc-mm",
    title: "A4 Millimeter 1 mm",
    templateId: MILLIMETER_TEMPLATE_ID,
    landscape: false,
    pageCount: 1,
    pages: [newPage(MILLIMETER_TEMPLATE_ID)],
  },
];

export interface HistoryEntry {
  past: DocumentPage[][];
  future: DocumentPage[][];
}

interface DocState {
  tabs: DocumentTab[];
  activeId: string;
  zoom: number;
  fitMode: "page" | "width" | null;
  page: number;
  history: Record<string, HistoryEntry>;
  lastError: string | null;
  setActive: (id: string) => void;
  newTab: (templateId: string, title: string, landscape?: boolean) => void;
  closeTab: (id: string) => void;
  applyTemplate: (templateId: string, title: string, landscape?: boolean) => void;
  setLandscape: (landscape: boolean) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (direction: 1 | -1) => void;
  setFit: (mode: "page" | "width" | null) => void;
  setPage: (page: number) => void;
  addPage: (templateId?: string) => void;
  duplicatePage: (index?: number) => void;
  rotatePage: (index?: number, delta?: number) => void;
  reorderPage: (from: number, to: number) => void;
  deletePage: (index?: number) => void;
  setPages: (tabId: string, pages: DocumentPage[]) => void;
  updatePage: (tabId: string, index: number, patch: Partial<DocumentPage>) => void;
  openPdfBytes: (bytes: Uint8Array, name: string) => Promise<void>;
  openPdfFile: (file: File) => Promise<void>;
  openPdfUrl: (url: string, name: string) => Promise<void>;
  addBookmark: (title: string) => void;
  restore: (tabs: DocumentTab[], activeId: string) => void;
  pushHistory: (tabId?: string) => void;
  undo: (tabId?: string) => void;
  redo: (tabId?: string) => void;
}

const HISTORY_LIMIT = 60;

function clonePages(pages: DocumentPage[]): DocumentPage[] {
  return structuredClone(pages);
}

function withPageCount(tab: DocumentTab, pages: DocumentPage[]): DocumentTab {
  return { ...tab, pages, pageCount: pages.length };
}

function tabOf(state: DocState, tabId?: string): DocumentTab | undefined {
  return state.tabs.find((tab) => tab.id === (tabId ?? state.activeId));
}

function pdfPages(info: InspectedPdf, url: string): DocumentPage[] {
  return info.pages.map((size, index) => ({
    id: makeId("page"),
    templateId: DEFAULT_TEMPLATE_ID,
    rotation: 0 as const,
    annotations: [],
    pdf: { url, pageNumber: index + 1, widthMm: size.widthMm, heightMm: size.heightMm },
  }));
}

export const useDocStore = create<DocState>((set, get) => ({
  tabs: initialTabs,
  activeId: initialTabs[0].id,
  zoom: 0.8,
  fitMode: "page",
  page: 1,
  history: {},
  lastError: null,

  setActive: (activeId) => set({ activeId, fitMode: "page", zoom: 0.8, page: 1 }),
  newTab: (templateId, title, landscape = false) => {
    const tab: DocumentTab = {
      id: makeId("doc"),
      title,
      templateId,
      landscape,
      pageCount: 1,
      pages: [newPage(templateId)],
    };
    set((state) => ({ tabs: [...state.tabs, tab], activeId: tab.id, fitMode: "page", page: 1 }));
  },
  closeTab: (id) => {
    const { tabs, activeId, history } = get();
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    const next = tabs.filter((tab) => tab.id !== id);
    const nextHistory = { ...history };
    delete nextHistory[id];
    set({
      tabs: next,
      history: nextHistory,
      activeId: activeId === id ? next[Math.max(0, index - 1)].id : activeId,
      page: 1,
    });
  },
  applyTemplate: (templateId, title, landscape = false) => {
    const state = get();
    const tab = tabOf(state);
    if (!tab) return;
    state.pushHistory(tab.id);
    const pages = tab.pages.map((page) => (page.pdf ? page : { ...page, templateId }));
    set((current) => ({
      tabs: current.tabs.map((item) =>
        item.id === tab.id ? withPageCount({ ...item, templateId, title, landscape }, pages) : item,
      ),
      fitMode: "page",
    }));
  },
  setLandscape: (landscape) => {
    const tab = tabOf(get());
    if (!tab) return;
    get().pushHistory(tab.id);
    set((state) => ({
      tabs: state.tabs.map((item) => (item.id === tab.id ? { ...item, landscape } : item)),
      fitMode: "page",
    }));
  },
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
    const tab = tabOf(get());
    set({ page: clamp(page, 1, tab?.pages.length ?? 1) });
  },

  addPage: (templateId) => {
    const tab = tabOf(get());
    if (!tab) return;
    get().pushHistory(tab.id);
    const source = tab.pages[get().page - 1];
    const page = newPage(templateId ?? source?.templateId ?? tab.templateId);
    const pages = [...tab.pages];
    const index = get().page;
    pages.splice(index, 0, page);
    set((state) => ({
      tabs: state.tabs.map((item) => (item.id === tab.id ? withPageCount(item, pages) : item)),
      page: index + 1,
    }));
  },
  duplicatePage: (index) => {
    const tab = tabOf(get());
    if (!tab) return;
    const sourceIndex = index ?? get().page - 1;
    const source = tab.pages[sourceIndex];
    if (!source) return;
    get().pushHistory(tab.id);
    const copy = structuredClone(source);
    copy.id = makeId("page");
    copy.annotations = copy.annotations.map((annotation) => ({ ...annotation, id: makeId("a") }));
    const pages = [...tab.pages];
    pages.splice(sourceIndex + 1, 0, copy);
    set((state) => ({
      tabs: state.tabs.map((item) => (item.id === tab.id ? withPageCount(item, pages) : item)),
      page: sourceIndex + 2,
    }));
  },
  rotatePage: (index, delta = 90) => {
    const tab = tabOf(get());
    if (!tab) return;
    const target = index ?? get().page - 1;
    if (!tab.pages[target]) return;
    get().pushHistory(tab.id);
    const pages = tab.pages.map((page, pageIndex) =>
      pageIndex === target
        ? { ...page, rotation: (((page.rotation + delta) % 360 + 360) % 360) as DocumentPage["rotation"] }
        : page,
    );
    set((state) => ({ tabs: state.tabs.map((item) => (item.id === tab.id ? withPageCount(item, pages) : item)) }));
  },
  reorderPage: (from, to) => {
    const tab = tabOf(get());
    if (!tab || from === to || !tab.pages[from] || to < 0 || to >= tab.pages.length) return;
    get().pushHistory(tab.id);
    const pages = [...tab.pages];
    const [moved] = pages.splice(from, 1);
    pages.splice(to, 0, moved);
    set((state) => ({
      tabs: state.tabs.map((item) => (item.id === tab.id ? withPageCount(item, pages) : item)),
      page: to + 1,
    }));
  },
  deletePage: (index) => {
    const tab = tabOf(get());
    if (!tab || tab.pages.length <= 1) return;
    const target = index ?? get().page - 1;
    if (!tab.pages[target]) return;
    get().pushHistory(tab.id);
    const pages = tab.pages.filter((_, pageIndex) => pageIndex !== target);
    set((state) => ({
      tabs: state.tabs.map((item) => (item.id === tab.id ? withPageCount(item, pages) : item)),
      page: clamp(get().page, 1, pages.length),
    }));
  },

  setPages: (tabId, pages) => {
    set((state) => ({
      tabs: state.tabs.map((item) => (item.id === tabId ? withPageCount(item, pages) : item)),
      page: clamp(get().page, 1, pages.length),
    }));
  },
  updatePage: (tabId, index, patch) => {
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.id === tabId
          ? withPageCount(item, item.pages.map((page, pageIndex) => (pageIndex === index ? { ...page, ...patch } : page)))
          : item,
      ),
    }));
  },

  openPdfBytes: async (bytes, name) => {
    const stored = bytes.slice();
    set({ lastError: null });
    try {
      const url = URL.createObjectURL(new Blob([new Uint8Array(stored)], { type: "application/pdf" }));
      const [info, sidecar] = await Promise.all([inspectPdf(stored), loadSidecar(stored).catch(() => null)]);
      const pages = pdfPages(info, url);
      if (sidecar && sidecar.pages.length === pages.length) {
        sidecar.pages.forEach((saved, index) => {
          const page = pages[index];
          if (!page) return;
          page.annotations = saved.annotations ?? [];
          page.rotation = (((saved.rotation ?? 0) % 360 + 360) % 360) as DocumentPage["rotation"];
          if (saved.cropBox) page.cropBox = saved.cropBox;
        });
      }
      const title = name.replace(/\.pdf$/i, "");
      // The sidecar carries outline entries across an export round-trip, including custom ones.
      const bookmarks =
        sidecar?.bookmarks && sidecar.bookmarks.length > 0
          ? sidecar.bookmarks.map((entry) => ({ ...entry, id: entry.id || makeId("bm") }))
          : info.bookmarks.map((entry) => ({
              id: makeId("bm"),
              title: entry.title,
              pageIndex: entry.pageIndex,
              depth: entry.depth,
            }));
      const tab: DocumentTab = {
        id: makeId("doc"),
        title,
        templateId: DEFAULT_TEMPLATE_ID,
        landscape: (pages[0]?.pdf?.widthMm ?? 210) > (pages[0]?.pdf?.heightMm ?? 297),
        pageCount: pages.length,
        pages,
        pdf: {
          url,
          name,
          pageCount: pages.length,
          bytes: stored,
          bookmarks,
        },
      };
      set((state) => ({ tabs: [...state.tabs, tab], activeId: tab.id, page: 1, fitMode: "page", zoom: 0.8 }));
    } catch (error) {
      set({ lastError: `Could not open ${name}: ${error instanceof Error ? error.message : String(error)}` });
    }
  },
  openPdfFile: async (file) => {
    await get().openPdfBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  },
  openPdfUrl: async (url, name) => {
    set({ lastError: null });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await get().openPdfBytes(new Uint8Array(await response.arrayBuffer()), name);
    } catch (error) {
      set({ lastError: `Could not open ${name}: ${error instanceof Error ? error.message : String(error)}` });
    }
  },

  addBookmark: (title) => {
    const state = get();
    const tab = tabOf(state);
    if (!tab?.pdf) return;
    const bookmark = { id: makeId("bm"), title, pageIndex: state.page - 1, depth: 0, custom: true };
    set({
      tabs: state.tabs.map((item) =>
        item.id === tab.id && item.pdf ? { ...item, pdf: { ...item.pdf, bookmarks: [...item.pdf.bookmarks, bookmark] } } : item,
      ),
    });
  },

  restore: (tabs, activeId) => {    const restored = tabs.map((tab) => {
      const pages = tab.pages?.length ? tab.pages : [newPage(tab.templateId)];
      if (!tab.pdf?.bytes) return { ...tab, pages, pageCount: pages.length };
      const url = URL.createObjectURL(new Blob([new Uint8Array(tab.pdf.bytes)], { type: "application/pdf" }));
      return {
        ...tab,
        pageCount: pages.length,
        pages: pages.map((page) => (page.pdf ? { ...page, pdf: { ...page.pdf, url } } : page)),
        pdf: { ...tab.pdf, url },
      };
    });
    set({
      tabs: restored,
      activeId: restored.some((tab) => tab.id === activeId) ? activeId : restored[0].id,
      page: 1,
      fitMode: "page",
      zoom: 0.8,
    });
  },

  pushHistory: (tabId) => {
    const state = get();
    const tab = tabOf(state, tabId);
    if (!tab) return;
    const entry = state.history[tab.id] ?? { past: [], future: [] };
    const past = [...entry.past, clonePages(tab.pages)].slice(-HISTORY_LIMIT);
    set({ history: { ...state.history, [tab.id]: { past, future: [] } } });
  },
  undo: (tabId) => {
    const state = get();
    const tab = tabOf(state, tabId);
    if (!tab) return;
    const entry = state.history[tab.id];
    const previous = entry?.past[entry.past.length - 1];
    if (!entry || !previous) return;
    set({
      tabs: state.tabs.map((item) => (item.id === tab.id ? withPageCount(item, previous) : item)),
      history: {
        ...state.history,
        [tab.id]: { past: entry.past.slice(0, -1), future: [clonePages(tab.pages), ...entry.future] },
      },
      page: clamp(state.page, 1, previous.length),
    });
  },
  redo: (tabId) => {
    const state = get();
    const tab = tabOf(state, tabId);
    if (!tab) return;
    const entry = state.history[tab.id];
    const next = entry?.future[0];
    if (!entry || !next) return;
    set({
      tabs: state.tabs.map((item) => (item.id === tab.id ? withPageCount(item, next) : item)),
      history: {
        ...state.history,
        [tab.id]: { past: [...entry.past, clonePages(tab.pages)], future: entry.future.slice(1) },
      },
      page: clamp(state.page, 1, next.length),
    });
  },
}));
