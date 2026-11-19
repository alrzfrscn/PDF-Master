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

describe("closing the last tab", () => {
  it("replaces it with a fresh blank tab", () => {
    const blank: DocumentTab = {
      id: "doc-last",
      title: "Last",
      templateId: "paper-000",
      landscape: false,
      pageCount: 1,
      pages: [page("only")],
    };
    useDocStore.setState({ tabs: [blank], activeId: blank.id, page: 1, history: {}, lastClosedTab: null });

    useDocStore.getState().closeTab(blank.id);

    const state = useDocStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).not.toBe(blank.id);
    expect(state.activeId).toBe(state.tabs[0].id);
    expect(state.tabs[0].pages).toHaveLength(1);
    expect(state.tabs[0].pages[0].annotations).toEqual([]);
    expect(state.lastClosedTab).toBeNull();
  });
});
