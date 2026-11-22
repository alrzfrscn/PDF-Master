import { beforeEach, describe, expect, it } from "vitest";
import type { ShapeAnnotation } from "../lib/annotationTypes";
import type { DocumentTab } from "../lib/types";
import { newPage, useDocStore } from "./useDocStore";
import { useAnnotationStore } from "./useAnnotationStore";
import { clampMenuPosition } from "./useContextMenuStore";

function shape(id: string, x = 10, y = 10): ShapeAnnotation {
  return {
    id,
    type: "shape",
    shapeType: "rectangle",
    start: [x, y],
    end: [x + 20, y + 10],
    points: [],
    strokeColor: "#101114",
    fillColor: null,
    fillTransparent: true,
    lineWidthMm: 0.5,
    lineStyle: "solid",
    opacity: 1,
    arrowHead: 0,
    arrowTail: 0,
    dimensionUnit: "mm",
    dimensionScale: 1,
  };
}

function tabWithPages(count: number): DocumentTab {
  const tab: DocumentTab = {
    id: "doc-menu",
    title: "Menu",
    templateId: "paper-000",
    landscape: false,
    pageCount: count,
    pages: Array.from({ length: count }, () => newPage("paper-000")),
  };
  useDocStore.setState({ tabs: [tab], activeId: tab.id, page: 1, history: {}, lastClosedTab: null });
  useAnnotationStore.setState({ selection: [], clipboard: [] });
  return tab;
}

describe("duplicateSelectionToAllPages", () => {
  beforeEach(() => tabWithPages(3));

  it("puts fresh ids on every other page in one undo step", () => {
    useAnnotationStore.getState().add({
      id: "a1",
      type: "shape",
      shapeType: "rectangle",
      start: [10, 10],
      end: [30, 20],
      points: [],
      strokeColor: "#101114",
      fillColor: null,
      fillTransparent: true,
      lineWidthMm: 0.5,
      lineStyle: "solid",
      opacity: 1,
      arrowHead: 0,
      arrowTail: 0,
      dimensionUnit: "mm",
      dimensionScale: 1,
      groupId: "g1",
    });
    useAnnotationStore.getState().add({
      id: "a2",
      type: "shape",
      shapeType: "ellipse",
      start: [40, 40],
      end: [60, 50],
      points: [],
      strokeColor: "#101114",
      fillColor: null,
      fillTransparent: true,
      lineWidthMm: 0.5,
      lineStyle: "solid",
      opacity: 1,
      arrowHead: 0,
      arrowTail: 0,
      dimensionUnit: "mm",
      dimensionScale: 1,
      groupId: "g1",
    });
    useAnnotationStore.getState().select(["a1", "a2"]);

    useAnnotationStore.getState().duplicateSelectionToAllPages();

    const pages = useDocStore.getState().tabs[0].pages;
    expect(pages[0].annotations.map((annotation) => annotation.id)).toEqual(["a1", "a2"]);
    const ids = pages.flatMap((page) => page.annotations.map((annotation) => annotation.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const page of pages.slice(1)) {
      expect(page.annotations).toHaveLength(2);
      expect(page.annotations[0].groupId).toBe(page.annotations[1].groupId);
      expect(page.annotations[0].groupId).not.toBe("g1");
    }

    useDocStore.getState().undo();
    const afterUndo = useDocStore.getState().tabs[0].pages;
    expect(afterUndo[0].annotations).toHaveLength(2);
    expect(afterUndo[1].annotations).toHaveLength(0);
    expect(afterUndo[2].annotations).toHaveLength(0);
  });
});

describe("tab context actions", () => {
  beforeEach(() => {
    useDocStore.setState({
      tabs: [
        { id: "a", title: "A", templateId: "paper-000", landscape: false, pageCount: 1, pages: [newPage("paper-000")] },
        { id: "b", title: "B", templateId: "paper-000", landscape: false, pageCount: 1, pages: [newPage("paper-000")] },
        { id: "c", title: "C", templateId: "paper-000", landscape: false, pageCount: 1, pages: [newPage("paper-000")] },
      ],
      activeId: "a",
      page: 1,
      history: {},
      lastClosedTab: null,
    });
  });

  it("inserts a blank page before the given index", () => {
    const firstId = useDocStore.getState().tabs[0].pages[0].id;
    useDocStore.getState().addPage(undefined, 0);
    const state = useDocStore.getState();
    expect(state.tabs[0].pages).toHaveLength(2);
    expect(state.tabs[0].pages[1].id).toBe(firstId);
    expect(state.page).toBe(1);
  });

  it("duplicates a tab with fresh page and annotation ids", () => {
    const pages = useDocStore.getState().tabs[0].pages;
    useDocStore.setState({
      tabs: [
        {
          ...useDocStore.getState().tabs[0],
          pages: [{ ...pages[0], annotations: [{ ...shape("shape-1"), groupId: "g-1" }, shape("shape-2", 20, 20)] }],
        },
      ],
      activeId: "a",
    });
    useDocStore.getState().duplicateTab("a");
    const state = useDocStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1].title).toBe("A copy");
    const ids = state.tabs[1].pages[0].annotations.map((annotation) => annotation.id);
    expect(ids).not.toContain("shape-1");
    expect(ids).not.toContain("shape-2");
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.activeId).toBe(state.tabs[1].id);
  });

  it("renames a tab and ignores an empty title", () => {
    useDocStore.getState().renameTab("a", "  Invoice  ");
    expect(useDocStore.getState().tabs[0].title).toBe("Invoice");
    useDocStore.getState().renameTab("a", "   ");
    expect(useDocStore.getState().tabs[0].title).toBe("Invoice");
  });

  it("keeps one tab and closes the rest", () => {
    useDocStore.getState().closeOtherTabs("b");
    const state = useDocStore.getState();
    expect(state.tabs.map((tab) => tab.id)).toEqual(["b"]);
    expect(state.activeId).toBe("b");
  });
});

describe("clampMenuPosition", () => {
  it("flips a menu near the right and bottom edges back inside", () => {
    expect(clampMenuPosition(1420, 880, 236, 320, 1440, 900)).toEqual({ x: 1184, y: 560 });
  });

  it("leaves a menu that fits exactly where it was opened", () => {
    expect(clampMenuPosition(100, 120, 236, 320, 1440, 900)).toEqual({ x: 100, y: 120 });
  });
});
