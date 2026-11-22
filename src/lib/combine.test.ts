import { describe, expect, it } from "vitest";
import { combineOrder, combineSummary, moveItem, type CombinePdfFile, type CombineTabItem } from "./combine";

const tabs: CombineTabItem[] = [
  { id: "tab-a", title: "A", pageCount: 2, checked: true },
  { id: "tab-b", title: "B", pageCount: 3, checked: false },
  { id: "tab-c", title: "C", pageCount: 1, checked: true },
];

const files: CombinePdfFile[] = [
  { id: "pdf-a", name: "a.pdf", bytes: new Uint8Array(), pageCount: 4 },
  { id: "pdf-b", name: "b.pdf", bytes: new Uint8Array(), pageCount: 5 },
];

describe("combine ordering", () => {
  it("moves a row and ignores invalid indexes", () => {
    expect(moveItem(tabs, 0, 2).map((item) => item.id)).toEqual(["tab-b", "tab-c", "tab-a"]);
    expect(moveItem(tabs, 0, 0)).toBe(tabs);
    expect(moveItem(tabs, -1, 1)).toBe(tabs);
    expect(moveItem(tabs, 0, 9)).toBe(tabs);
  });

  it("keeps checked tabs and files in their displayed order", () => {
    expect(combineOrder(tabs, files)).toEqual({
      tabIds: ["tab-a", "tab-c"],
      fileIds: ["pdf-a", "pdf-b"],
    });
  });

  it("counts only the items that will be combined", () => {
    expect(combineSummary(tabs, files)).toEqual({ items: 4, pages: 12 });
  });
});
