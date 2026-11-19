import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "./shortcuts";
import {
  applyWorkspaceStores,
  collectWorkspaceStores,
  parseWorkspaceBackup,
  workspaceBackup,
  type WorkspaceStores,
} from "./storage";
import type { DocumentTab } from "./types";

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

const stores: WorkspaceStores = {
  customStamps: [
    {
      id: "custom-1",
      name: "Selection 10:00",
      imageUrl: "data:image/png;base64,iVBORw0KGgo=",
      width: 240,
      height: 120,
      createdAt: "2026-01-01T10:00:00.000Z",
    },
  ],
  customScales: [{ id: "scale-2.5", label: "1:2.5", denominator: 2.5 }],
  activeScaleId: "scale-2.5",
  shortcuts: { ...DEFAULT_SHORTCUTS, pen: "Ctrl+Shift+9" },
  prefs: { scratchOut: false, measureUnit: "in", snapshotDpi: 300, touchDrawEnabled: false },
  theme: "sepia",
};

describe("workspace backup", () => {
  it("round-trips tabs and every preference store", async () => {
    const text = await workspaceBackup(tabs, "doc-a", stores).text();
    const parsed = parseWorkspaceBackup(text);

    expect(parsed?.version).toBe(2);
    expect(parsed?.activeId).toBe("doc-a");
    expect(parsed?.tabs).toEqual(tabs);
    expect(parsed?.stores).toEqual(stores);
  });

  it("restores the stores from a backup and reads them back", () => {
    applyWorkspaceStores(stores);
    const restored = collectWorkspaceStores();

    expect(restored.customStamps).toEqual(stores.customStamps);
    expect(restored.customScales).toEqual(stores.customScales);
    expect(restored.activeScaleId).toBe("scale-2.5");
    expect(restored.shortcuts.pen).toBe("Ctrl+Shift+9");
    expect(restored.prefs).toEqual(stores.prefs);
    expect(restored.theme).toBe("sepia");
  });

  it("still accepts a version 1 file without stores", () => {
    const legacy = JSON.stringify({ version: 1, savedAt: "2025-01-01", activeId: "doc-a", tabs });
    const parsed = parseWorkspaceBackup(legacy);
    expect(parsed?.tabs).toHaveLength(1);
    expect(parsed?.stores).toBeUndefined();
  });

  it("rejects malformed or empty backups", () => {
    expect(parseWorkspaceBackup("not json")).toBeNull();
    expect(parseWorkspaceBackup(JSON.stringify({ version: 2, tabs: [] }))).toBeNull();
    expect(parseWorkspaceBackup(JSON.stringify({ version: 3, tabs }))).toBeNull();
  });

  it("ignores absent stores on import", () => {
    expect(() => applyWorkspaceStores(undefined)).not.toThrow();
  });

  it("round-trips PDF bytes as base64", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
    const withPdf: DocumentTab[] = [
      { ...tabs[0], id: "doc-pdf", pdf: { url: "", name: "source.pdf", pageCount: 1, bookmarks: [], bytes } },
    ];
    const text = await workspaceBackup(withPdf, "doc-pdf", stores).text();

    expect(text).toContain("bytesBase64");
    const parsed = parseWorkspaceBackup(text);
    expect(parsed?.tabs[0].pdf?.bytes).toEqual(bytes);
  });

  it("reads bytes from a legacy numeric-key object", () => {
    const legacy = JSON.stringify({
      version: 2,
      savedAt: "2025-01-01",
      activeId: "doc-pdf",
      tabs: [
        {
          ...tabs[0],
          id: "doc-pdf",
          pdf: { url: "", name: "source.pdf", pageCount: 1, bookmarks: [], bytes: { 0: 37, 1: 80, 2: 68 } },
        },
      ],
    });

    expect(parseWorkspaceBackup(legacy)?.tabs[0].pdf?.bytes).toEqual(new Uint8Array([37, 80, 68]));
  });
});
