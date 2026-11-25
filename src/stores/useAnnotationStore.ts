import { create } from "zustand";
import type {
  Annotation,
  AnnotationPatch,
  AlignMode,
  BBox,
  MarkerAnnotation,
  PenAnnotation,
  Pt,
} from "../lib/annotationTypes";
import {
  annotationBounds,
  boundsIntersect,
  flipAnnotation,
  hitTest,
  rotateAnnotation,
  scaleAnnotation,
  selectionBounds,
  subtractEraser,
  translateAnnotation,
} from "../lib/annotationGeometry";
import type { DocumentPage } from "../lib/types";
import { makeId, setSelectionResetHook, useDocStore } from "./useDocStore";

export function cloneAnnotations(annotations: Annotation[]): Annotation[] {
  return structuredClone(annotations);
}

/**
 * Ids a click should select. Only a real group id expands to its siblings;
 * ungrouped annotations share `undefined`, which must never mean "all".
 */
export function selectionForAnnotation(annotations: Annotation[], hit: Annotation): string[] {
  const groupId = typeof hit.groupId === "string" && hit.groupId.length > 0 ? hit.groupId : null;
  if (!groupId) return [hit.id];
  return annotations.filter((annotation) => annotation.groupId === groupId).map((annotation) => annotation.id);
}

interface ActiveContext {
  tabId: string;
  pageIndex: number;
  page: DocumentPage;
  pages: DocumentPage[];
}

function activeContext(): ActiveContext | null {
  const state = useDocStore.getState();
  const tab = state.tabs.find((item) => item.id === state.activeId);
  const pageIndex = state.page - 1;
  const page = tab?.pages[pageIndex];
  if (!tab || !page) return null;
  return { tabId: tab.id, pageIndex, page, pages: tab.pages };
}

function replacePage(ctx: ActiveContext, page: DocumentPage): DocumentPage[] {
  return ctx.pages.map((item, index) => (index === ctx.pageIndex ? page : item));
}

interface AnnotationState {
  selection: string[];
  clipboard: Annotation[];
  select: (ids: string[]) => void;
  toggle: (id: string) => void;
  clearSelection: () => void;
  add: (annotation: Annotation) => void;
  addMany: (annotations: Annotation[]) => void;
  update: (ids: string[], patch: AnnotationPatch, recordHistory?: boolean) => void;
  transform: (fn: (annotation: Annotation) => Annotation) => void;
  mutate: (fn: (annotations: Annotation[]) => Annotation[], history?: boolean) => void;
  remove: (ids: string[]) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  /** Copies the selection onto every other page of the active tab, in one undo step. */
  duplicateSelectionToAllPages: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  paste: (at?: Pt) => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  setLocked: (locked: boolean) => void;
  bringToFront: () => void;
  sendToBack: () => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: "x" | "y") => void;
  nudge: (dxMm: number, dyMm: number) => void;
  eraseAt: (point: Pt, split: boolean, radiusMm?: number, recordHistory?: boolean) => boolean;
  scratchOut: (box: BBox) => void;
}

function selectedAnnotations(state: AnnotationState, ctx: ActiveContext): Annotation[] {
  const wanted = new Set(state.selection);
  return ctx.page.annotations.filter((annotation) => wanted.has(annotation.id));
}

function withHistory(ctx: ActiveContext): void {
  useDocStore.getState().pushHistory(ctx.tabId);
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  selection: [],
  clipboard: [],

  select: (selection) => set({ selection }),
  toggle: (id) =>
    set((state) => ({
      selection: state.selection.includes(id) ? state.selection.filter((item) => item !== id) : [...state.selection, id],
    })),
  clearSelection: () => set({ selection: [] }),

  add: (annotation) => {
    const ctx = activeContext();
    if (!ctx) return;
    withHistory(ctx);
    const pages = replacePage(ctx, { ...ctx.page, annotations: [...ctx.page.annotations, annotation] });
    useDocStore.getState().setPages(ctx.tabId, pages);
    set({ selection: [annotation.id] });
  },
  addMany: (annotations) => {
    if (annotations.length === 0) return;
    const ctx = activeContext();
    if (!ctx) return;
    withHistory(ctx);
    useDocStore
      .getState()
      .setPages(ctx.tabId, replacePage(ctx, { ...ctx.page, annotations: [...ctx.page.annotations, ...annotations] }));
    set({ selection: annotations.map((annotation) => annotation.id) });
  },

  update: (ids, patch, recordHistory = true) => {
    const ctx = activeContext();
    if (!ctx) return;
    const wanted = new Set(ids);
    if (!ctx.page.annotations.some((annotation) => wanted.has(annotation.id))) return;
    if (recordHistory) withHistory(ctx);
    const annotations = ctx.page.annotations.map((annotation) =>
      wanted.has(annotation.id) ? ({ ...annotation, ...patch } as Annotation) : annotation,
    );
    useDocStore.getState().setPages(ctx.tabId, replacePage(ctx, { ...ctx.page, annotations }));
  },

  transform: (fn) => get().mutate((annotations) => annotations.map(fn), false),

  mutate: (fn, history = true) => {
    const ctx = activeContext();
    if (!ctx) return;
    const annotations = fn(ctx.page.annotations);
    if (annotations === ctx.page.annotations) return;
    if (history) withHistory(ctx);
    useDocStore.getState().setPages(ctx.tabId, replacePage(ctx, { ...ctx.page, annotations }));
    const alive = new Set(annotations.map((annotation) => annotation.id));
    const selection = get().selection.filter((id) => alive.has(id));
    if (selection.length !== get().selection.length) set({ selection });
  },

  remove: (ids) => {
    const wanted = new Set(ids);
    get().mutate((annotations) => annotations.filter((annotation) => !wanted.has(annotation.id)));
    set((state) => ({ selection: state.selection.filter((id) => !wanted.has(id)) }));
  },

  deleteSelection: () => {
    const ctx = activeContext();
    if (!ctx || get().selection.length === 0) return;
    const wanted = new Set(get().selection);
    get().mutate((annotations) => annotations.filter((annotation) => !wanted.has(annotation.id)));
    set({ selection: [] });
  },

  duplicateSelection: () => {
    const ctx = activeContext();
    const state = get();
    if (!ctx) return;
    const chosen = selectedAnnotations(state, ctx);
    if (chosen.length === 0) return;
    const groups = new Map<string, string>();
    const copies = chosen.map((annotation) => {
      const copy = structuredClone(annotation);
      copy.id = makeId("a");
      copy.locked = false;
      if (annotation.groupId) {
        const groupId = groups.get(annotation.groupId) ?? makeId("g");
        groups.set(annotation.groupId, groupId);
        copy.groupId = groupId;
      }
      return translateAnnotation(copy, 5, 5);
    });
    get().addMany(copies);
  },

  duplicateSelectionToAllPages: () => {
    const ctx = activeContext();
    if (!ctx) return;
    const chosen = selectedAnnotations(get(), ctx);
    if (chosen.length === 0 || ctx.pages.length < 2) return;
    withHistory(ctx);
    const pages = ctx.pages.map((page, index) => {
      if (index === ctx.pageIndex) return page;
      // Each page gets its own ids, and its own group ids, so pages stay independent.
      const groups = new Map<string, string>();
      const copies = chosen.map((annotation) => {
        const copy = structuredClone(annotation);
        copy.id = makeId("a");
        copy.locked = false;
        if (annotation.groupId) {
          const groupId = groups.get(annotation.groupId) ?? makeId("g");
          groups.set(annotation.groupId, groupId);
          copy.groupId = groupId;
        }
        return copy;
      });
      return { ...page, annotations: [...page.annotations, ...copies] };
    });
    useDocStore.getState().setPages(ctx.tabId, pages);
  },

  copySelection: () => {
    const ctx = activeContext();
    if (!ctx) return;
    const chosen = selectedAnnotations(get(), ctx);
    if (chosen.length > 0) set({ clipboard: cloneAnnotations(chosen) });
  },
  cutSelection: () => {
    get().copySelection();
    get().deleteSelection();
  },
  paste: (at) => {
    const source = get().clipboard;
    if (source.length === 0) return;
    const groups = new Map<string, string>();
    let dx = 5;
    let dy = 5;
    // A click-to-paste drops the copied block's top-left corner on the cursor.
    const sourceBounds = at ? selectionBounds(source) : null;
    if (at && sourceBounds) {
      dx = at[0] - sourceBounds.x;
      dy = at[1] - sourceBounds.y;
    }
    const copies = source.map((annotation) => {
      const copy = structuredClone(annotation);
      copy.id = makeId("a");
      if (annotation.groupId) {
        const groupId = groups.get(annotation.groupId) ?? makeId("g");
        groups.set(annotation.groupId, groupId);
        copy.groupId = groupId;
      }
      return translateAnnotation(copy, dx, dy);
    });
    get().addMany(copies);
  },

  groupSelection: () => {
    const ids = new Set(get().selection);
    if (ids.size < 2) return;
    const groupId = makeId("g");
    get().mutate((annotations) =>
      annotations.map((annotation) => (ids.has(annotation.id) ? { ...annotation, groupId } : annotation)),
    );
  },
  ungroupSelection: () => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    get().mutate((annotations) =>
      annotations.map((annotation) => (ids.has(annotation.id) ? { ...annotation, groupId: null } : annotation)),
    );
  },
  setLocked: (locked) => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    get().mutate((annotations) =>
      annotations.map((annotation) => (ids.has(annotation.id) ? { ...annotation, locked } : annotation)),
    );
  },

  bringToFront: () => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    get().mutate((annotations) => [
      ...annotations.filter((annotation) => !ids.has(annotation.id)),
      ...annotations.filter((annotation) => ids.has(annotation.id)),
    ]);
  },
  sendToBack: () => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    get().mutate((annotations) => [
      ...annotations.filter((annotation) => ids.has(annotation.id)),
      ...annotations.filter((annotation) => !ids.has(annotation.id)),
    ]);
  },

  align: (mode) => {
    const ctx = activeContext();
    if (!ctx) return;
    const chosen = selectedAnnotations(get(), ctx);
    if (chosen.length < 2) return;
    const outer = selectionBounds(chosen);
    if (!outer) return;
    const moves = new Map<string, Pt>();
    for (const annotation of chosen) {
      const box = annotationBounds(annotation);
      let dx = 0;
      let dy = 0;
      if (mode === "left") dx = outer.x - box.x;
      if (mode === "center") dx = outer.x + outer.width / 2 - (box.x + box.width / 2);
      if (mode === "right") dx = outer.x + outer.width - (box.x + box.width);
      if (mode === "top") dy = outer.y - box.y;
      if (mode === "middle") dy = outer.y + outer.height / 2 - (box.y + box.height / 2);
      if (mode === "bottom") dy = outer.y + outer.height - (box.y + box.height);
      moves.set(annotation.id, [dx, dy]);
    }
    get().mutate((annotations) =>
      annotations.map((annotation) => {
        const move = moves.get(annotation.id);
        return move ? translateAnnotation(annotation, move[0], move[1]) : annotation;
      }),
    );
  },

  distribute: (axis) => {
    const ctx = activeContext();
    if (!ctx) return;
    const chosen = selectedAnnotations(get(), ctx);
    if (chosen.length < 3) return;
    const boxes = chosen.map((annotation) => ({ annotation, box: annotationBounds(annotation) }));
    const position = (box: BBox) => (axis === "x" ? box.x : box.y);
    const size = (box: BBox) => (axis === "x" ? box.width : box.height);
    boxes.sort((a, b) => position(a.box) - position(b.box));
    const first = boxes[0].box;
    const last = boxes[boxes.length - 1].box;
    const total = position(last) + size(last) - position(first);
    const used = boxes.reduce((sum, item) => sum + size(item.box), 0);
    const gap = (total - used) / (boxes.length - 1);
    let cursor = position(first);
    const moves = new Map<string, Pt>();
    for (const item of boxes) {
      const delta = cursor - position(item.box);
      moves.set(item.annotation.id, axis === "x" ? [delta, 0] : [0, delta]);
      cursor += size(item.box) + gap;
    }
    get().mutate((annotations) =>
      annotations.map((annotation) => {
        const move = moves.get(annotation.id);
        return move ? translateAnnotation(annotation, move[0], move[1]) : annotation;
      }),
    );
  },

  nudge: (dxMm, dyMm) => {
    const ids = new Set(get().selection);
    if (ids.size === 0) return;
    get().mutate((annotations) =>
      annotations.map((annotation) => (ids.has(annotation.id) ? translateAnnotation(annotation, dxMm, dyMm) : annotation)),
    );
  },

  eraseAt: (point, split, radiusMm = 2.5, recordHistory = true) => {
    const ctx = activeContext();
    if (!ctx) return false;
    let changed = false;
    const next: Annotation[] = [];
    for (const annotation of ctx.page.annotations) {
      const locked = annotation.locked || annotation.hidden;
      if (locked || !hitTest(annotation, point, radiusMm)) {
        next.push(annotation);
        continue;
      }
      changed = true;
      if (!split || (annotation.type !== "pen" && annotation.type !== "marker")) continue;
      const runs = subtractEraser(annotation.points, point, radiusMm);
      if (runs.length === 0) continue;
      for (const run of runs) {
        const copy = structuredClone(annotation) as PenAnnotation | MarkerAnnotation;
        copy.id = makeId("a");
        copy.points = run;
        next.push(copy);
      }
    }
    if (changed) get().mutate(() => next, recordHistory);
    return changed;
  },

  scratchOut: (box) => {
    const ctx = activeContext();
    if (!ctx) return;
    const remaining = ctx.page.annotations.filter(
      (annotation) => annotation.locked || annotation.hidden || !boundsIntersect(annotationBounds(annotation), box),
    );
    if (remaining.length !== ctx.page.annotations.length) get().mutate(() => remaining);
  },
}));

export function applySelectionTransform(
  kind: "translate" | "scale" | "rotate" | "flip",
  payload: { dx?: number; dy?: number; origin?: Pt; sx?: number; sy?: number; degrees?: number; axis?: "h" | "v" },
): void {
  const transform = useAnnotationStore.getState().transform;
  transform((annotation) => {
    if (kind === "translate") return translateAnnotation(annotation, payload.dx ?? 0, payload.dy ?? 0);
    if (kind === "scale") return scaleAnnotation(annotation, payload.origin ?? [0, 0], payload.sx ?? 1, payload.sy ?? 1);
    if (kind === "rotate") return rotateAnnotation(annotation, payload.origin ?? [0, 0], payload.degrees ?? 0);
    return flipAnnotation(annotation, payload.axis ?? "h", payload.origin ?? [0, 0]);
  });
}

let lastKey = "";
useDocStore.subscribe((state) => {
  const key = `${state.activeId}:${state.page}`;
  if (key !== lastKey) {
    lastKey = key;
    if (useAnnotationStore.getState().selection.length > 0) useAnnotationStore.setState({ selection: [] });
  }
});

setSelectionResetHook(() => {
  if (useAnnotationStore.getState().selection.length > 0) useAnnotationStore.setState({ selection: [] });
});
