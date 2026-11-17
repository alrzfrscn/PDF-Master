import { describe, expect, it } from "vitest";
import { mapPageIndex, remapBookmarksOnPageOp } from "./bookmarks";
import type { PdfBookmark } from "./types";

const bookmark = (pageIndex: number, pageId?: string): PdfBookmark => ({
  id: `bm-${pageIndex}`,
  title: `Page ${pageIndex + 1}`,
  pageIndex,
  depth: 0,
  pageId,
});

describe("bookmark remapping", () => {
  it("shifts indices for add, duplicate and delete", () => {
    expect(mapPageIndex(0, { kind: "add", index: 0 })).toBe(1);
    expect(mapPageIndex(2, { kind: "duplicate", index: 1 })).toBe(3);
    expect(mapPageIndex(3, { kind: "delete", index: 1 })).toBe(2);
    expect(mapPageIndex(1, { kind: "delete", index: 1 })).toBe(1);
  });

  it("follows reorder in both directions", () => {
    expect(mapPageIndex(0, { kind: "reorder", from: 0, to: 2 })).toBe(2);
    expect(mapPageIndex(2, { kind: "reorder", from: 0, to: 2 })).toBe(1);
    expect(mapPageIndex(2, { kind: "reorder", from: 2, to: 0 })).toBe(0);
    expect(mapPageIndex(1, { kind: "reorder", from: 2, to: 0 })).toBe(2);
  });

  it("keeps a bookmark on its page id when pages move", () => {
    const pages = [{ id: "p2" }, { id: "p1" }, { id: "p3" }];
    const [moved] = remapBookmarksOnPageOp([bookmark(0, "p1")], pages, { kind: "reorder", from: 0, to: 1 });
    expect(moved).toMatchObject({ pageId: "p1", pageIndex: 1 });
  });

  it("clamps a bookmark whose page was deleted", () => {
    const pages = [{ id: "p1" }, { id: "p2" }];
    const [kept] = remapBookmarksOnPageOp([bookmark(2, "p3")], pages, { kind: "delete", index: 2 });
    expect(kept.pageIndex).toBe(1);
  });

  it("falls back to the numeric shift for legacy bookmarks without an id", () => {
    const pages = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
    const [shifted] = remapBookmarksOnPageOp([bookmark(1)], pages, { kind: "add", index: 0 });
    expect(shifted.pageIndex).toBe(2);
  });
});
