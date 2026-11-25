import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSaveHandle, saveActiveDocument } from "./save";
import { useDocStore } from "../stores/useDocStore";

function tabFor(id: string, title: string) {
  return {
    id,
    title,
    templateId: "paper-000",
    landscape: false,
    pageCount: 1,
    pages: [{ id: `page-${id}`, templateId: "paper-000", rotation: 0 as const, annotations: [] }],
  };
}

describe("saveActiveDocument", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSaveHandle("doc-save-test");
    clearSaveHandle("doc-save-mode");
  });

  it("writes in place through the remembered file handle", async () => {
    const writes: Uint8Array[] = [];
    const createWritable = vi.fn(async () => ({
      write: async (data: Uint8Array) => {
        writes.push(data);
      },
      close: async () => {},
    }));
    const picker = vi.fn(async () => ({ createWritable }));
    vi.stubGlobal("window", { showSaveFilePicker: picker });

    useDocStore.setState({
      activeId: "doc-save-test",
      tabs: [tabFor("doc-save-test", "Save test")],
      page: 1,
    });

    await saveActiveDocument("flattened");
    await saveActiveDocument("flattened");

    expect(picker).toHaveBeenCalledTimes(1);
    expect(createWritable).toHaveBeenCalledTimes(2);
    expect(writes).toHaveLength(2);
    expect(writes[0].byteLength).toBeGreaterThan(100);
  });

  it("keeps a separate target file for each save mode", async () => {
    const createWritable = vi.fn(async () => ({ write: async () => {}, close: async () => {} }));
    const picker = vi.fn(async () => ({ createWritable }));
    vi.stubGlobal("window", { showSaveFilePicker: picker });

    useDocStore.setState({
      activeId: "doc-save-mode",
      tabs: [tabFor("doc-save-mode", "Modes")],
      page: 1,
    });

    await saveActiveDocument("editable");
    await saveActiveDocument("flattened");
    expect(picker).toHaveBeenCalledTimes(2);

    // Each mode writes in place to its own remembered handle.
    await saveActiveDocument("editable");
    await saveActiveDocument("flattened");
    expect(picker).toHaveBeenCalledTimes(2);
    expect(createWritable).toHaveBeenCalledTimes(4);
  });
});
