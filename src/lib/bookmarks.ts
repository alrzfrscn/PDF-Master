import type { PdfBookmark } from "./types";

/** A page mutation that shifts later 0-based indices. */
export type PageOp =
  | { kind: "add" | "duplicate"; index: number }
  | { kind: "delete"; index: number }
  /** An inclusive block `from..to` removed in one step. */
  | { kind: "delete-range"; from: number; to: number }
  | { kind: "reorder"; from: number; to: number };

/** Where a 0-based page index lands after the operation. */
export function mapPageIndex(index: number, op: PageOp): number {
  switch (op.kind) {
    case "add":
    case "duplicate":
      return index >= op.index ? index + 1 : index;
    case "delete":
      return index > op.index ? index - 1 : index;
    case "delete-range":
      if (index < op.from) return index;
      if (index <= op.to) return op.from;
      return index - (op.to - op.from + 1);
    case "reorder":
      if (index === op.from) return op.to;
      if (op.from < op.to) return index > op.from && index <= op.to ? index - 1 : index;
      return index >= op.to && index < op.from ? index + 1 : index;
  }
}

/**
 * Keeps bookmarks pointing at their page. `pageId` wins when the page still
 * exists; otherwise the numeric index follows the operation.
 */
export function remapBookmarksOnPageOp(
  bookmarks: PdfBookmark[],
  nextPages: { id: string }[],
  op: PageOp,
): PdfBookmark[] {
  const last = Math.max(0, nextPages.length - 1);
  return bookmarks.map((bookmark) => {
    if (bookmark.pageId) {
      const found = nextPages.findIndex((page) => page.id === bookmark.pageId);
      if (found >= 0) return found === bookmark.pageIndex ? bookmark : { ...bookmark, pageIndex: found };
    }
    const pageIndex = Math.min(mapPageIndex(bookmark.pageIndex, op), last);
    return pageIndex === bookmark.pageIndex ? bookmark : { ...bookmark, pageIndex };
  });
}
