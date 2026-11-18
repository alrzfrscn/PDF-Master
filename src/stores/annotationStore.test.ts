import { beforeEach, describe, expect, it } from "vitest";
import type { PenAnnotation, ShapeAnnotation, ShapeType } from "../lib/annotationTypes";
import { annotationBounds } from "../lib/annotationGeometry";
import { useAnnotationStore } from "./useAnnotationStore";
import { newPage, useDocStore } from "./useDocStore";
import type { DocumentTab } from "../lib/types";

function shape(id: string, x = 10, y = 10, shapeType: ShapeType = "rectangle"): ShapeAnnotation {
  return {
    id,
    type: "shape",
    shapeType,
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

function pen(id: string, y: number): PenAnnotation {
  return {
    id,
    type: "pen",
    points: [[10, y, 0.5], [30, y, 0.5]],
    color: "#101114",
    thicknessMm: 1,
    opacity: 1,
    sensitivity: true,
    smoothed: false,
  };
}

function setup(): DocumentTab {
  const tab: DocumentTab = {
    id: "doc-test",
    title: "Test",
    templateId: "paper-000",
    landscape: false,
    pageCount: 1,
    pages: [newPage("paper-000")],
  };
  useDocStore.setState({ tabs: [tab], activeId: tab.id, page: 1, history: {}, lastError: null });
  useAnnotationStore.setState({ selection: [], clipboard: [] });
  return tab;
}

function annotations() {
  const state = useDocStore.getState();
  const tab = state.tabs.find((item) => item.id === state.activeId);
  return tab?.pages[state.page - 1].annotations ?? [];
}

describe("annotation store", () => {
  beforeEach(() => setup());

  it("adds annotations and selects the new one", () => {
    useAnnotationStore.getState().add(shape("a1"));
    expect(annotations()).toHaveLength(1);
    expect(useAnnotationStore.getState().selection).toEqual(["a1"]);
  });

  it("translates every selected annotation", () => {
    useAnnotationStore.getState().add(shape("a1", 10, 10));
    useAnnotationStore.getState().add(shape("a2", 40, 40));
    useAnnotationStore.getState().select(["a1", "a2"]);
    useAnnotationStore.getState().nudge(2, -3);
    const [first, second] = annotations();
    expect(first.type === "shape" && first.start).toEqual([12, 7]);
    expect(second.type === "shape" && second.start).toEqual([42, 37]);
  });

  it("aligns and distributes a mixed selection", () => {
    useAnnotationStore.getState().addMany([shape("a1", 10, 10), shape("a2", 40, 30), shape("a3", 90, 60)]);
    useAnnotationStore.getState().select(["a1", "a2", "a3"]);
    useAnnotationStore.getState().align("left");
    const boxes = annotations().map((annotation) => annotationBounds(annotation));
    expect(new Set(boxes.map((box) => Number(box.x.toFixed(2)))).size).toBe(1);

    useAnnotationStore.getState().align("top");
    const tops = annotations().map((annotation) => annotationBounds(annotation).y);
    expect(new Set(tops.map((top) => Number(top.toFixed(2)))).size).toBe(1);

    useAnnotationStore.getState().select(["a1", "a2", "a3"]);
    useAnnotationStore.getState().distribute("x");
    const ordered = annotations()
      .map((annotation) => annotationBounds(annotation))
      .sort((a, b) => a.x - b.x);
    const gap1 = ordered[1].x - (ordered[0].x + ordered[0].width);
    const gap2 = ordered[2].x - (ordered[1].x + ordered[1].width);
    expect(gap1).toBeCloseTo(gap2, 1);
  });

  it("groups, moves as a group, and ungroups", () => {
    useAnnotationStore.getState().addMany([shape("a1", 10, 10), shape("a2", 40, 40)]);
    useAnnotationStore.getState().select(["a1", "a2"]);
    useAnnotationStore.getState().groupSelection();
    const groupId = annotations()[0].groupId;
    expect(groupId).toBeTruthy();
    expect(annotations()[1].groupId).toBe(groupId);

    useAnnotationStore.getState().ungroupSelection();
    expect(annotations().every((annotation) => !annotation.groupId)).toBe(true);
  });

  it("undoes and redoes annotation changes per tab", () => {
    const store = useAnnotationStore.getState();
    store.add(shape("a1"));
    expect(annotations()).toHaveLength(1);
    useDocStore.getState().undo();
    expect(annotations()).toHaveLength(0);
    useDocStore.getState().redo();
    expect(annotations()).toHaveLength(1);
  });

  it("scratch-out removes only annotations under the gesture box", () => {
    useAnnotationStore.getState().addMany([shape("near", 10, 10), shape("far", 120, 180)]);
    useAnnotationStore.getState().scratchOut({ x: 8, y: 8, width: 8, height: 8 });
    expect(annotations().map((annotation) => annotation.id)).toEqual(["far"]);
  });

  it("split-erases ink and keeps the untouched runs", () => {
    const points = Array.from({ length: 17 }, (_, index) => [10 + index * 2.5, 10, 0.5] as [number, number, number]);
    useAnnotationStore.getState().add({
      id: "ink",
      type: "pen",
      points,
      color: "#101114",
      thicknessMm: 1,
      opacity: 1,
      sensitivity: true,
      smoothed: false,
    });
    useAnnotationStore.getState().eraseAt([30, 10], true, 3);
    const runs = annotations();
    expect(runs.length).toBe(2);
    expect(runs.every((annotation) => annotation.type === "pen")).toBe(true);
  });

  it("records one history entry for a whole erase gesture", () => {
    useAnnotationStore.getState().addMany([pen("ink-1", 10), pen("ink-2", 20)]);
    useAnnotationStore.getState().eraseAt([20, 10], false, 3, true);
    useAnnotationStore.getState().eraseAt([20, 20], false, 3, false);
    expect(annotations()).toHaveLength(0);

    useDocStore.getState().undo();
    expect(annotations().map((annotation) => annotation.id)).toEqual(["ink-1", "ink-2"]);
  });

  it("gives duplicated groups a fresh group id", () => {
    useAnnotationStore.getState().addMany([shape("a1"), shape("a2")]);
    useAnnotationStore.getState().select(["a1", "a2"]);
    useAnnotationStore.getState().groupSelection();
    useAnnotationStore.getState().duplicateSelection();

    const all = annotations();
    expect(all).toHaveLength(4);
    const original = all[0].groupId;
    const copies = all.slice(2);
    expect(original).toBeTruthy();
    expect(copies[0].groupId).toBeTruthy();
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe(original);
  });
});
