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
  it("leaves an empty workspace instead of creating a blank tab", () => {
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
    expect(state.tabs).toHaveLength(0);
    expect(state.activeId).toBe("");
    expect(state.lastClosedTab).toBeNull();
  });

  it("keeps an annotated last tab recoverable for 15 s", () => {
    const annotated: DocumentPage = { ...page("inked"), annotations: [{ id: "a1", type: "pen" } as never] };
    const tab: DocumentTab = {
      id: "doc-inked",
      title: "Inked",
      templateId: "paper-000",
      landscape: false,
      pageCount: 1,
      pages: [annotated],
    };
    useDocStore.setState({ tabs: [tab], activeId: tab.id, page: 1, history: {}, lastClosedTab: null });

    useDocStore.getState().closeTab(tab.id);

    const state = useDocStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.lastClosedTab?.tab.id).toBe(tab.id);
    useDocStore.getState().undoCloseTab();
    expect(useDocStore.getState().tabs[0].id).toBe(tab.id);
  });
});

describe("page range deletion", () => {
  beforeEach(() => {
    useDocStore.setState({
      tabs: [tabWith([page("p1"), page("p2"), page("p3"), page("p4")])],
      activeId: "doc-bookmarks",
      page: 2,
      history: {},
      lastClosedTab: null,
    });
  });

  it("deletes pages after the current one in one undo step", () => {
    useDocStore.getState().addBookmark("two");
    useDocStore.getState().deletePagesAfter(1);

    const state = useDocStore.getState();
    expect(state.tabs[0].pages.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(bookmarks()[0]).toMatchObject({ pageIndex: 1, pageId: "p2" });
    expect(state.history["doc-bookmarks"].past).toHaveLength(1);
    expect(state.page).toBe(2);
  });

  it("clamps a bookmark whose trailing page was deleted", () => {
    useDocStore.setState({ page: 4 });
    useDocStore.getState().addBookmark("four");
    useDocStore.getState().deletePagesAfter(1);
    expect(bookmarks()[0]).toMatchObject({ pageIndex: 1 });
  });

  it("deletes pages before the current one in one undo step", () => {
    useDocStore.setState({ page: 3 });
    useDocStore.getState().addBookmark("three");
    useDocStore.getState().deletePagesBefore(2);

    const state = useDocStore.getState();
    expect(state.tabs[0].pages.map((item) => item.id)).toEqual(["p3", "p4"]);
    expect(bookmarks()[0]).toMatchObject({ pageIndex: 0, pageId: "p3" });
    expect(state.history["doc-bookmarks"].past).toHaveLength(1);
    expect(state.page).toBe(1);
  });

  it("does nothing on the last page or the first page", () => {
    useDocStore.setState({ page: 4 });
    useDocStore.getState().deletePagesAfter(3);
    expect(useDocStore.getState().tabs[0].pages).toHaveLength(4);

    useDocStore.setState({ page: 1 });
    useDocStore.getState().deletePagesBefore(0);
    expect(useDocStore.getState().tabs[0].pages).toHaveLength(4);
    expect(useDocStore.getState().history["doc-bookmarks"]).toBeUndefined();
  });
});

describe("page reordering", () => {
  beforeEach(() => {
    useDocStore.setState({
      tabs: [tabWith([page("p1"), page("p2"), page("p3")])],
      activeId: "doc-bookmarks",
      page: 1,
      history: {},
      lastClosedTab: null,
    });
  });

  it("moves a page with its bookmark in a single undo step", () => {
    useDocStore.getState().addBookmark("one");
    useDocStore.getState().movePage(0, 2);

    const state = useDocStore.getState();
    expect(state.tabs[0].pages.map((item) => item.id)).toEqual(["p2", "p3", "p1"]);
    expect(bookmarks()[0]).toMatchObject({ pageIndex: 2, pageId: "p1" });
    expect(state.history["doc-bookmarks"].past).toHaveLength(1);
    expect(state.page).toBe(3);

    useDocStore.getState().undo();
    expect(useDocStore.getState().tabs[0].pages.map((item) => item.id)).toEqual(["p1", "p2", "p3"]);
  });
});

describe("workspace restore", () => {
  it("starts a clean history instead of keeping undo entries for dead pages", () => {
    const previous: DocumentTab = {
      id: "doc-previous",
      title: "Previous",
      templateId: "paper-000",
      landscape: false,
      pageCount: 1,
      pages: [page("old")],
    };
    const restored: DocumentTab = {
      id: "doc-restored",
      title: "Restored",
      templateId: "paper-000",
      landscape: false,
      pageCount: 1,
      pages: [page("fresh")],
    };
    useDocStore.setState({
      tabs: [previous],
      activeId: previous.id,
      page: 1,
      history: { [previous.id]: { past: [[page("old")]], future: [] } },
      lastClosedTab: { tab: previous, index: 0 },
    });

    useDocStore.getState().restore([restored], restored.id);

    const state = useDocStore.getState();
    expect(state.history).toEqual({});
    expect(state.lastClosedTab).toBeNull();
    expect(state.activeId).toBe(restored.id);
    expect(state.page).toBe(1);
  });
});
