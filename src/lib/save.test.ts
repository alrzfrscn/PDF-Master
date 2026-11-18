import { afterEach, describe, expect, it, vi } from "vitest";
import { saveActiveDocument } from "./save";
import { useDocStore } from "../stores/useDocStore";

describe("saveActiveDocument", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
      tabs: [
        {
          id: "doc-save-test",
          title: "Save test",
          templateId: "paper-000",
          landscape: false,
          pageCount: 1,
          pages: [{ id: "page-save-test", templateId: "paper-000", rotation: 0, annotations: [] }],
        },
      ],
      page: 1,
    });

    await saveActiveDocument("flattened");
    await saveActiveDocument("flattened");

    expect(picker).toHaveBeenCalledTimes(1);
    expect(createWritable).toHaveBeenCalledTimes(2);
    expect(writes).toHaveLength(2);
    expect(writes[0].byteLength).toBeGreaterThan(100);
  });
});
