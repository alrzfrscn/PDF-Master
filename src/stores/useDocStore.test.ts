import { beforeEach, describe, expect, it } from "vitest";
import type { DocumentPage, DocumentTab } from "../lib/types";
import { useDocStore } from "./useDocStore";

function page(id: string, templateId = "paper-000"): DocumentPage {
  return { id, templateId, rotation: 0, annotations: [] };
}

function tabWith(pages: DocumentPage[]): DocumentTab {
  return {
    id: "doc-bookmarks",
    title: "Bookmarks",
    templateId: "paper-000",
    landscape: false,
    pageCount: pages.length,
    pages,
    pdf: { url: "", name: "doc.pdf", pageCount: pages.length, bookmarks: [] },
  };
}

function bookmarks() {
  return useDocStore.getState().tabs[0].pdf?.bookmarks ?? [];
}

describe("document store bookmarks", () => {
  beforeEach(() => {
    useDocStore.setState({
      tabs: [tabWith([page("p1"), page("p2"), page("p3")])],
      activeId: "doc-bookmarks",
      page: 1,
      history: {},
    });
  });

  it("adds a bookmark tied to the current page id", () => {
    useDocStore.getState().addBookmark("Start");
    expect(bookmarks()).toEqual([
      expect.objectContaining({ title: "Start", pageIndex: 0, pageId: "p1", custom: true }),
    ]);
  });

  it("follows a reorder, a duplicate and a delete", () => {
    useDocStore.getState().addBookmark("p1");
    useDocStore.getState().reorderPage(0, 2);
    expect(bookmarks()[0]).toMatchObject({ pageIndex: 2, pageId: "p1" });

    useDocStore.getState().duplicatePage(0);
    expect(bookmarks()[0]).toMatchObject({ pageIndex: 3, pageId: "p1" });

    useDocStore.getState().deletePage(0);
    expect(bookmarks()[0]).toMatchObject({ pageIndex: 2, pageId: "p1" });
  });

  it("shifts a bookmark when a page is inserted above it", () => {
    useDocStore.setState({ page: 2 });
    useDocStore.getState().addBookmark("second");
    useDocStore.setState({ page: 1 });
    useDocStore.getState().addPage();
    expect(bookmarks()[0]).toMatchObject({ pageIndex: 2, pageId: "p2" });
  });
});
