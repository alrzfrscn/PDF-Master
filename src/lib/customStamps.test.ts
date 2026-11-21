import { describe, expect, it } from "vitest";
import { useCustomStampStore } from "./customStamps";

describe("custom stamp library", () => {
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
});
