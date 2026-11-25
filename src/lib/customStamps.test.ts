import { afterEach, describe, expect, it, vi } from "vitest";
import { useCustomStampStore, type StampLibrary } from "./customStamps";

function stubStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  });
  return values;
}

describe("custom stamp library", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useCustomStampStore.setState({ stamps: [] });
  });

  it("removes a custom stamp from the store", async () => {
    const result = await useCustomStampStore.getState().add({
      name: "Phase 13 stamp",
      imageUrl: "data:image/png;base64,AAAA",
      width: 12,
      height: 12,
    });
    expect(result.stamp).toBeDefined();
    const id = result.stamp?.id ?? "";

    expect(useCustomStampStore.getState().stamps.some((stamp) => stamp.id === id)).toBe(true);
    useCustomStampStore.getState().remove(id);
    expect(useCustomStampStore.getState().stamps.some((stamp) => stamp.id === id)).toBe(false);
  });

  it("keeps a removed stamp removed when an older mirror is replayed", async () => {
    const values = stubStorage();
    useCustomStampStore.getState().restore([]);
    const result = await useCustomStampStore.getState().add({
      name: "Mirrored",
      imageUrl: "data:image/png;base64,BBBB",
      width: 8,
      height: 8,
    });
    const id = result.stamp?.id ?? "";
    const beforeRemoval = JSON.parse(values.get("pm.customStamps") ?? "{}") as StampLibrary;

    useCustomStampStore.getState().remove(id);
    // The mirror still lists the stamp but carries the older timestamp.
    useCustomStampStore.getState().restoreIfNewer(beforeRemoval);
    expect(useCustomStampStore.getState().stamps.some((stamp) => stamp.id === id)).toBe(false);

    // A genuinely newer mirror (another window) still wins.
    useCustomStampStore.getState().restoreIfNewer({
      updatedAt: new Date(Date.now() + 60_000).toISOString(),
      stamps: result.stamp ? [result.stamp] : [],
    });
    expect(useCustomStampStore.getState().stamps.some((stamp) => stamp.id === id)).toBe(true);
  });
});
