import { create } from "zustand";
import { DEFAULT_TEMPLATE_ID, paperById } from "../lib/data";
import { scaleAnnotation } from "../lib/annotationGeometry";
import { clamp } from "../lib/paper";
import { deleteWorkspaceBlob } from "../lib/storage";
import { ZOOM_STEPS } from "../lib/tools";
import { isMarkdownTab, type DocumentPage, type DocumentTab, type MarkdownMode, type PdfBookmark } from "../lib/types";
import { inspectPdf, loadSidecar, mergeSidecarPages, releasePdfDocument, type InspectedPdf } from "../lib/pdfEngine";
import { remapBookmarksOnPageOp, type PageOp } from "../lib/bookmarks";
import { clearSaveHandle } from "../lib/save";

/**
 * useAnnotationStore registers this at import time. A direct import here would
 * close a module cycle: that store subscribes to this one while loading.
 */
let resetSelection: (() => void) | null = null;

export function setSelectionResetHook(fn: () => void): void {
  resetSelection = fn;
}

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
  /** Markdown tabs undo by content snapshot; a tab uses one pair or the other. */
  mdPast?: string[];
  mdFuture?: string[];
}

/** Typing coalesces into one undo step; a pause longer than this starts a new one. */
const MARKDOWN_HISTORY_GAP_MS = 700;
const markdownHistoryAt = new Map<string, number>();

interface DocState {
  tabs: DocumentTab[];
  activeId: string;
  zoom: number;
  fitMode: "page" | "width" | null;
  /** Bumped by an explicit fit request so the same fit mode re-applies. */
  fitEpoch: number;
  page: number;
  history: Record<string, HistoryEntry>;
  lastError: string | null;
  /** The tab closed most recently; kept for 15 s so Undo can put it back. */
  lastClosedTab: { tab: DocumentTab; index: number } | null;
  setActive: (id: string) => void;
  newTab: (templateId: string, title: string, landscape?: boolean) => void;
  duplicateTab: (id?: string) => void;
  renameTab: (id: string, title: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id?: string) => void;
  undoCloseTab: () => void;
  applyTemplate: (templateId: string, title: string, landscape?: boolean) => void;
  setLandscape: (landscape: boolean) => void;
  setZoom: (zoom: number) => void;
  zoomBy: (direction: 1 | -1) => void;
  setFit: (mode: "page" | "width" | null) => void;
  setPage: (page: number) => void;
  /** Without an index, inserts after the current page; `index` inserts before that page. */
  addPage: (templateId?: string, index?: number) => void;
  duplicatePage: (index?: number) => void;
  rotatePage: (index?: number, delta?: number) => void;
  reorderPage: (from: number, to: number) => void;
  /** Smooth drag-and-drop reordering; same single undo step as `reorderPage`. */
  movePage: (from: number, to: number) => void;
  deletePage: (index?: number) => void;
  deletePagesAfter: (index?: number) => void;
  deletePagesBefore: (index?: number) => void;
  setPages: (tabId: string, pages: DocumentPage[]) => void;
  updatePage: (tabId: string, index: number, patch: Partial<DocumentPage>) => void;
  openPdfBytes: (bytes: Uint8Array, name: string) => Promise<void>;
  openPdfFile: (file: File) => Promise<void>;
  openPdfUrl: (url: string, name: string) => Promise<void>;
  openMarkdownFile: (file: File) => Promise<void>;
  openMarkdownText: (content: string, title: string) => void;
  newMarkdownTab: (title?: string) => void;
  updateMarkdownContent: (tabId: string, content: string, recordHistory?: boolean) => void;
  setMarkdownMode: (tabId: string, mode: MarkdownMode) => void;
  addBookmark: (title: string) => void;
  restore: (tabs: DocumentTab[], activeId: string) => void;
  pushHistory: (tabId?: string) => void;
  undo: (tabId?: string) => void;
  redo: (tabId?: string) => void;
}

const HISTORY_LIMIT = 40;

/** Structural history stores page snapshots; every mutation replaces objects, so a shallow copy is enough. */
function clonePages(pages: DocumentPage[]): DocumentPage[] {
  return pages.map((page) => ({ ...page, annotations: page.annotations.slice() }));
}

function releaseTab(tab: DocumentTab): void {
  const urls = new Set<string>();
  if (tab.pdf?.url) urls.add(tab.pdf.url);
  for (const page of tab.pages) if (page.pdf?.url) urls.add(page.pdf.url);
  for (const url of urls) {
    releasePdfDocument(url);
    if (url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
  }
}

/** Permanent close: free the rendered document and its autosaved blob. */
function disposeTab(tab: DocumentTab, keepIds: string[]): void {
  releaseTab(tab);
  clearSaveHandle(tab.id);
  void deleteWorkspaceBlob(tab.id, keepIds);
}

let closeTimer = 0;

/** Applies a page op to the tab's bookmarks, keeping `pageId` authoritative. */
function withRemappedBookmarks(tab: DocumentTab, pages: DocumentPage[], op: PageOp): DocumentTab {
  if (!tab.pdf?.bookmarks.length) return tab;
  return { ...tab, pdf: { ...tab.pdf, bookmarks: remapBookmarksOnPageOp(tab.pdf.bookmarks, pages, op) } };
}

function withPageCount(tab: DocumentTab, pages: DocumentPage[]): DocumentTab {
  return { ...tab, pages, pageCount: pages.length };
}

function tabOf(state: DocState, tabId?: string): DocumentTab | undefined {
  return state.tabs.find((tab) => tab.id === (tabId ?? state.activeId));
}

/** A Markdown tab carries its own text and no pages; PDF/paper fields stay inert. */
function markdownTab(content: string, title: string, fileName?: string, mode: MarkdownMode = "reader"): DocumentTab {
  return {
    id: makeId("doc"),
    title,
    templateId: DEFAULT_TEMPLATE_ID,
    landscape: false,
    pageCount: 0,
    pages: [],
    markdown: { content, mode, ...(fileName ? { fileName } : {}) },
  };
}

function markdownTitle(title: string): string {
  const clean = title.replace(/\.(md|markdown)$/i, "").trim();
  return clean || "Untitled";
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
  fitEpoch: 0,
  page: 1,
  history: {},
  lastError: null,
  lastClosedTab: null,

  setActive: (activeId) => {
    const target = get().tabs.find((tab) => tab.id === activeId);
    set({ activeId, fitMode: isMarkdownTab(target) ? null : "page", zoom: isMarkdownTab(target) ? 1 : 0.8, page: 1 });
  },
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
  duplicateTab: (id) => {
    const source = tabOf(get(), id);
    if (!source) return;
    const pageIds = new Map<string, string>();
    const groups = new Map<string, string>();
    const pages = source.pages.map((page) => {
      const copy = structuredClone(page);
      copy.id = makeId("page");
      pageIds.set(page.id, copy.id);
      copy.annotations = copy.annotations.map((annotation) => {
        const next = { ...annotation, id: makeId("a") };
        if (annotation.groupId) {
          const groupId = groups.get(annotation.groupId) ?? makeId("g");
          groups.set(annotation.groupId, groupId);
          next.groupId = groupId;
        }
        return next;
      });
      return copy;
    });
    // A shared object URL would be revoked while the other tab still shows it.
    const pdf = source.pdf
      ? {
          ...source.pdf,
          url:
            source.pdf.bytes && typeof URL.createObjectURL === "function"
              ? URL.createObjectURL(new Blob([new Uint8Array(source.pdf.bytes)], { type: "application/pdf" }))
              : source.pdf.url,
          bookmarks: source.pdf.bookmarks.map((bookmark) => ({
            ...bookmark,
            id: makeId("bm"),
            pageId: bookmark.pageId ? pageIds.get(bookmark.pageId) ?? bookmark.pageId : undefined,
          })),
        }
      : null;
    const tab: DocumentTab = {
      ...source,
      id: makeId("doc"),
      title: `${source.title} copy`,
      pages: pdf ? pages.map((page) => (page.pdf ? { ...page, pdf: { ...page.pdf, url: pdf.url } } : page)) : pages,
      pageCount: pages.length,
      ...(pdf ? { pdf } : {}),
    };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeId: tab.id,
      fitMode: isMarkdownTab(tab) ? null : "page",
      page: 1,
      ...(isMarkdownTab(tab) ? { zoom: 1 } : {}),
    }));
  },
  renameTab: (id, title) => {
    const next = title.trim();
    if (!next) return;
    set((state) => ({ tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, title: next } : tab)) }));
  },
  closeTab: (id) => {
    const { tabs, activeId, history, lastClosedTab } = get();
    const index = tabs.findIndex((tab) => tab.id === id);
    const closing = tabs[index];
    if (!closing) return;
    // A closed tab forgets its target file; undo-close starts from a fresh picker.
    clearSaveHandle(id);
    // The previous closed tab is now beyond undo: free its document and blob.
    if (lastClosedTab) disposeTab(lastClosedTab.tab, tabs.filter((tab) => tab.id !== lastClosedTab.tab.id).map((tab) => tab.id));
    const nextHistory = { ...history };
    delete nextHistory[id];

    // Closing the last tab leaves a calm empty workspace; it is recoverable for 15 s.
    if (tabs.length === 1) {
      const annotated =
        closing.pages.some((page) => page.annotations.length > 0) || Boolean(closing.markdown?.content.trim());
      set({
        tabs: [],
        history: nextHistory,
        activeId: "",
        page: 1,
        lastClosedTab: annotated ? { tab: closing, index: 0 } : null,
      });
      if (!annotated) {
        disposeTab(closing, []);
        return;
      }
      if (closeTimer) globalThis.clearTimeout(closeTimer);
      closeTimer = globalThis.setTimeout(() => {
        closeTimer = 0;
        const state = get();
        if (state.lastClosedTab?.tab.id !== id) return;
        disposeTab(state.lastClosedTab.tab, state.tabs.map((tab) => tab.id));
        set({ lastClosedTab: null });
      }, 15000);
      return;
    }

    const next = tabs.filter((tab) => tab.id !== id);
    set({
      tabs: next,
      history: nextHistory,
      activeId: activeId === id ? next[Math.max(0, index - 1)].id : activeId,
      page: 1,
      lastClosedTab: { tab: closing, index },
    });
    if (closeTimer) globalThis.clearTimeout(closeTimer);
    closeTimer = globalThis.setTimeout(() => {
      closeTimer = 0;
      const state = get();
      if (state.lastClosedTab?.tab.id !== id) return;
      disposeTab(state.lastClosedTab.tab, state.tabs.map((tab) => tab.id));
      set({ lastClosedTab: null });
    }, 15000);
  },
  closeOtherTabs: (id) => {
    const state = get();
    const keep = id ?? state.activeId;
    if (!state.tabs.some((tab) => tab.id === keep)) return;
    for (const tab of state.tabs) if (tab.id !== keep) get().closeTab(tab.id);
    set({ activeId: keep, page: 1 });
  },
  undoCloseTab: () => {
    const closed = get().lastClosedTab;
    if (!closed) return;
    if (closeTimer) {
      globalThis.clearTimeout(closeTimer);
      closeTimer = 0;
    }
    const tabs = [...get().tabs];
    tabs.splice(Math.min(closed.index, tabs.length), 0, closed.tab);
    set({ tabs, activeId: closed.tab.id, page: 1, lastClosedTab: null });
  },
  applyTemplate: (templateId, title, landscape = false) => {
    const state = get();
    const tab = tabOf(state);
    // A PDF page's size comes from the source document, not from a paper recipe.
    if (!tab || tab.pdf || isMarkdownTab(tab)) return;
    state.pushHistory(tab.id);
    const nextTemplate = paperById.get(templateId);
    const pages = tab.pages.map((page) => {
      if (page.pdf) return page;
      const previous = paperById.get(page.templateId);
      if (!nextTemplate || !previous) return { ...page, templateId };
      const scale = Math.min(
        1,
        nextTemplate.page.widthMm / previous.page.widthMm,
        nextTemplate.page.heightMm / previous.page.heightMm,
      );
      const annotations =
        scale < 1 ? page.annotations.map((annotation) => scaleAnnotation(annotation, [0, 0], scale, scale)) : page.annotations;
      return { ...page, templateId, annotations };
    });
    set((current) => ({
      tabs: current.tabs.map((item) =>
        item.id === tab.id
          ? withPageCount({ ...item, templateId, title: item.pdf ? item.title : title, landscape }, pages)
          : item,
      ),
      fitMode: "page",
    }));
  },
  setLandscape: (landscape) => {
    const tab = tabOf(get());
    // PDF pages keep the source orientation; flipping them would be a no-op undo entry.
    if (!tab || tab.pdf || isMarkdownTab(tab)) return;
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
  setFit: (fitMode) => set((state) => ({ fitMode, fitEpoch: state.fitEpoch + 1 })),
  setPage: (page) => {
    const tab = tabOf(get());
    const next = clamp(page, 1, tab?.pages.length ?? 1);
    set({ page: next });
    // The continuous viewport listens for explicit navigation and scrolls there.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pm:goto-page", { detail: { page: next } }));
    }
  },

  addPage: (templateId, index) => {
    const tab = tabOf(get());
    if (!tab) return;
    const at = index === undefined ? get().page : Math.max(0, Math.min(index, tab.pages.length));
    get().pushHistory(tab.id);
    const source = tab.pages[at - 1] ?? tab.pages[0];
    const page = newPage(templateId ?? source?.templateId ?? tab.templateId);
    const pages = [...tab.pages];
    pages.splice(at, 0, page);
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.id === tab.id
          ? withPageCount(withRemappedBookmarks(item, pages, { kind: "add", index: at }), pages)
          : item,
      ),
      page: at + 1,
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
    const groups = new Map<string, string>();
    copy.annotations = copy.annotations.map((annotation) => {
      const next = { ...annotation, id: makeId("a") };
      if (annotation.groupId) {
        const groupId = groups.get(annotation.groupId) ?? makeId("g");
        groups.set(annotation.groupId, groupId);
        next.groupId = groupId;
      }
      return next;
    });
    const pages = [...tab.pages];
    pages.splice(sourceIndex + 1, 0, copy);
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.id === tab.id
          ? withPageCount(withRemappedBookmarks(item, pages, { kind: "duplicate", index: sourceIndex }), pages)
          : item,
      ),
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
      tabs: state.tabs.map((item) =>
        item.id === tab.id
          ? withPageCount(withRemappedBookmarks(item, pages, { kind: "reorder", from, to }), pages)
          : item,
      ),
      page: to + 1,
    }));
  },
  movePage: (from, to) => get().reorderPage(from, to),
  deletePage: (index) => {
    const tab = tabOf(get());
    if (!tab || tab.pages.length <= 1) return;
    const target = index ?? get().page - 1;
    if (!tab.pages[target]) return;
    get().pushHistory(tab.id);
    const pages = tab.pages.filter((_, pageIndex) => pageIndex !== target);
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.id === tab.id
          ? withPageCount(withRemappedBookmarks(item, pages, { kind: "delete", index: target }), pages)
          : item,
      ),
      page: clamp(get().page, 1, pages.length),
    }));
  },
  deletePagesAfter: (index) => {
    const tab = tabOf(get());
    if (!tab) return;
    const from = (index ?? get().page - 1) + 1;
    if (from <= 0 || from >= tab.pages.length) return;
    get().pushHistory(tab.id);
    const pages = tab.pages.slice(0, from);
    const to = tab.pages.length - 1;
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.id === tab.id
          ? withPageCount(withRemappedBookmarks(item, pages, { kind: "delete-range", from, to }), pages)
          : item,
      ),
      page: clamp(get().page, 1, pages.length),
    }));
  },
  deletePagesBefore: (index) => {
    const tab = tabOf(get());
    if (!tab) return;
    const to = index ?? get().page - 1;
    if (to <= 0 || to >= tab.pages.length) return;
    get().pushHistory(tab.id);
    const pages = tab.pages.slice(to);
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.id === tab.id
          ? withPageCount(withRemappedBookmarks(item, pages, { kind: "delete-range", from: 0, to: to - 1 }), pages)
          : item,
      ),
      page: 1,
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
    let url = "";
    try {
      url = URL.createObjectURL(new Blob([new Uint8Array(stored)], { type: "application/pdf" }));
      const [info, sidecar] = await Promise.all([inspectPdf(stored), loadSidecar(stored).catch(() => null)]);
      const pages = mergeSidecarPages(pdfPages(info, url), sidecar);
      const title = name.replace(/\.pdf$/i, "");
      // The sidecar carries outline entries across an export round-trip, including custom ones.
      const bookmarks: PdfBookmark[] = (
        sidecar?.bookmarks?.length
          ? sidecar.bookmarks
          : info.bookmarks.map((entry) => ({
              id: makeId("bm"),
              title: entry.title,
              pageIndex: entry.pageIndex,
              depth: entry.depth,
            }))
      ).map((entry) => ({ ...entry, id: entry.id || makeId("bm"), pageId: pages[entry.pageIndex]?.id }));
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
      if (url) URL.revokeObjectURL(url);
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

  openMarkdownFile: async (file) => {
    get().openMarkdownText(await file.text(), file.name);
  },
  openMarkdownText: (content, title) => {
    const fileName = /\.(md|markdown)$/i.test(title) ? title : undefined;
    const tab = markdownTab(content, markdownTitle(title), fileName);
    set((state) => ({ tabs: [...state.tabs, tab], activeId: tab.id, page: 1, fitMode: null, zoom: 1 }));
  },
  newMarkdownTab: (title = "Untitled") => {
    const tab = markdownTab(`# ${title}\n\n`, title, undefined, "split");
    set((state) => ({ tabs: [...state.tabs, tab], activeId: tab.id, page: 1, fitMode: null, zoom: 1 }));
  },
  updateMarkdownContent: (tabId, content, recordHistory = true) => {
    const tab = tabOf(get(), tabId);
    if (!isMarkdownTab(tab) || tab.markdown.content === content) return;
    if (recordHistory) {
      const now = Date.now();
      if (now - (markdownHistoryAt.get(tab.id) ?? 0) > MARKDOWN_HISTORY_GAP_MS) {
        get().pushHistory(tab.id);
        markdownHistoryAt.set(tab.id, now);
      }
    }
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.id === tab.id && item.markdown ? { ...item, markdown: { ...item.markdown, content } } : item,
      ),
    }));
  },
  setMarkdownMode: (tabId, mode) => {
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.id === tabId && item.markdown ? { ...item, markdown: { ...item.markdown, mode } } : item,
      ),
    }));
  },

  addBookmark: (title) => {
    const state = get();
    const tab = tabOf(state);
    if (!tab?.pdf) return;
    const bookmark = {
      id: makeId("bm"),
      title,
      pageIndex: state.page - 1,
      depth: 0,
      pageId: tab.pages[state.page - 1]?.id,
      custom: true,
    };
    set({
      tabs: state.tabs.map((item) =>
        item.id === tab.id && item.pdf ? { ...item, pdf: { ...item.pdf, bookmarks: [...item.pdf.bookmarks, bookmark] } } : item,
      ),
    });
  },

  restore: (tabs, activeId) => {
    const previousTabs = get().tabs;
    const restored = tabs.map((tab) => {
      if (isMarkdownTab(tab)) return { ...tab, pages: tab.pages ?? [], pageCount: 0 };
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
    for (const tab of previousTabs) {
      releaseTab(tab);
      clearSaveHandle(tab.id);
    }
    // Restored pages are a new starting point: old undo entries point at dead URLs.
    resetSelection?.();
    const activeTab = restored.find((tab) => tab.id === activeId) ?? restored[0];
    set({
      tabs: restored,
      activeId: activeTab.id,
      page: 1,
      fitMode: isMarkdownTab(activeTab) ? null : "page",
      zoom: isMarkdownTab(activeTab) ? 1 : 0.8,
      history: {},
      lastClosedTab: null,
      lastError: null,
    });
  },

  pushHistory: (tabId) => {
    const state = get();
    const tab = tabOf(state, tabId);
    if (!tab) return;
    if (isMarkdownTab(tab)) {
      const entry = state.history[tab.id] ?? { past: [], future: [] };
      const mdPast = [...(entry.mdPast ?? []), tab.markdown.content].slice(-HISTORY_LIMIT);
      set({ history: { ...state.history, [tab.id]: { past: entry.past, future: entry.future, mdPast, mdFuture: [] } } });
      return;
    }
    const entry = state.history[tab.id] ?? { past: [], future: [] };
    const past = [...entry.past, clonePages(tab.pages)].slice(-HISTORY_LIMIT);
    set({ history: { ...state.history, [tab.id]: { past, future: [] } } });
  },
  undo: (tabId) => {
    const state = get();
    const tab = tabOf(state, tabId);
    if (!tab) return;
    if (isMarkdownTab(tab)) {
      const entry = state.history[tab.id];
      const previous = entry?.mdPast?.[entry.mdPast.length - 1];
      if (!entry || previous === undefined) return;
      set({
        tabs: state.tabs.map((item) =>
          item.id === tab.id && item.markdown ? { ...item, markdown: { ...item.markdown, content: previous } } : item,
        ),
        history: {
          ...state.history,
          [tab.id]: {
            past: entry.past,
            future: entry.future,
            mdPast: entry.mdPast?.slice(0, -1) ?? [],
            mdFuture: [tab.markdown.content, ...(entry.mdFuture ?? [])],
          },
        },
      });
      return;
    }
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
    if (isMarkdownTab(tab)) {
      const entry = state.history[tab.id];
      const next = entry?.mdFuture?.[0];
      if (!entry || next === undefined) return;
      set({
        tabs: state.tabs.map((item) =>
          item.id === tab.id && item.markdown ? { ...item, markdown: { ...item.markdown, content: next } } : item,
        ),
        history: {
          ...state.history,
          [tab.id]: {
            past: entry.past,
            future: entry.future,
            mdPast: [...(entry.mdPast ?? []), tab.markdown.content],
            mdFuture: entry.mdFuture?.slice(1) ?? [],
          },
        },
      });
      return;
    }
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
