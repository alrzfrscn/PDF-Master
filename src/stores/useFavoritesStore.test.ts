import { beforeEach, describe, expect, it } from "vitest";
import { applyWorkspaceStores, collectWorkspaceStores, parseWorkspaceBackup, workspaceBackup } from "../lib/storage";
import type { DocumentTab } from "../lib/types";
import { DEFAULT_FAVORITES, useFavoritesStore } from "./useFavoritesStore";

const tabs: DocumentTab[] = [
  {
    id: "doc-a",
    title: "A4 Blank",
    templateId: "paper-000",
    landscape: false,
    pageCount: 1,
    pages: [{ id: "page-a", templateId: "paper-000", rotation: 0, annotations: [] }],
  },
];

beforeEach(() => {
  useFavoritesStore.getState().restore(DEFAULT_FAVORITES);
});

describe("favourite tools", () => {
  it("starts with the ten wireframe shortcuts", () => {
    expect(DEFAULT_FAVORITES).toHaveLength(10);
    expect(useFavoritesStore.getState().favorites.map((item) => item.tool)).toEqual([
      "pen", "pen", "pen", "marker", "marker", "marker", "text", "line", "arrow", "arrow",
    ]);
  });

  it("adds and removes a favourite", () => {
    useFavoritesStore.getState().add({
      label: "Signature pen",
      tool: "pen",
      penStyle: "calligraphy",
      props: { color: "#123456", thicknessMm: 2.4, pressureLevel: 85 },
    });
    const added = useFavoritesStore.getState().favorites.find((item) => item.label === "Signature pen");
    expect(added).toMatchObject({ tool: "pen", penStyle: "calligraphy", props: { color: "#123456", thicknessMm: 2.4 } });
    expect(useFavoritesStore.getState().favorites).toHaveLength(11);

    useFavoritesStore.getState().remove(added?.id ?? "");
    expect(useFavoritesStore.getState().favorites).toHaveLength(10);
  });

  it("travels inside the workspace backup", async () => {
    const favorites = [
      ...DEFAULT_FAVORITES,
      { id: "fav-signature", label: "Signature pen", tool: "pen" as const, penStyle: "calligraphy" as const, props: { color: "#123456", thicknessMm: 2.4 } },
    ];
    const parsed = parseWorkspaceBackup(await workspaceBackup(tabs, "doc-a", { ...collectWorkspaceStores(), favorites }).text());
    expect(parsed?.stores?.favorites).toHaveLength(11);

    useFavoritesStore.getState().restore([]);
    applyWorkspaceStores(parsed?.stores);
    const restored = useFavoritesStore.getState().favorites;
    expect(restored).toHaveLength(11);
    expect(restored.find((item) => item.id === "fav-signature")?.props.color).toBe("#123456");
    expect(restored.find((item) => item.id === "fav-signature")?.penStyle).toBe("calligraphy");
  });
});
