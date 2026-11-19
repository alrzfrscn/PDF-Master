import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  bindingFromEvent,
  detectConflicts,
  normalizeBinding,
  useShortcutStore,
  type ShortcutAction,
} from "./shortcuts";

describe("shortcuts", () => {
  it("normalises modifier order and key case", () => {
    expect(normalizeBinding("shift+ctrl+s")).toBe("Ctrl+Shift+S");
    expect(normalizeBinding("meta+K")).toBe("Ctrl+K");
    expect(normalizeBinding("ctrl+,")).toBe("Ctrl+,");
    expect(normalizeBinding(" 0 ")).toBe("0");
  });

  it("reads a binding from a keyboard event and ignores bare modifiers", () => {
    expect(bindingFromEvent({ key: "s", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe("Ctrl+Shift+S");
    expect(bindingFromEvent({ key: "t", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe("T");
    expect(bindingFromEvent({ key: "Shift", ctrlKey: false, metaKey: false, altKey: false, shiftKey: true })).toBeNull();
  });

  it("resolves the physical key on a Persian keyboard layout", () => {
    expect(bindingFromEvent({ key: "ر", code: "KeyV", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe("Ctrl+V");
    expect(bindingFromEvent({ key: "ح", code: "KeyP", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe("P");
    expect(bindingFromEvent({ key: "ظ", code: "KeyZ", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe("Ctrl+Z");
    expect(bindingFromEvent({ key: "۱", code: "Digit1", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe("Ctrl+1");
    expect(bindingFromEvent({ key: "،", code: "Comma", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe("Ctrl+,");
  });

  it("defaults are conflict free", () => {
    const { conflicting, byBinding } = detectConflicts(DEFAULT_SHORTCUTS);
    expect(conflicting.size).toBe(0);
    expect(byBinding.size).toBe(SHORTCUT_ACTIONS.length);
  });

  it("flags both actions when a binding is claimed twice", () => {
    const map: Record<ShortcutAction, string> = { ...DEFAULT_SHORTCUTS, pen: "T" };
    const { conflicting } = detectConflicts(map);
    expect(conflicting.has("pen")).toBe(true);
    expect(conflicting.has("text")).toBe(true);
    expect(conflicting.has("select")).toBe(false);
  });

  it("exposes the clipboard and grouping actions", () => {
    expect(DEFAULT_SHORTCUTS.copy).toBe("Ctrl+C");
    expect(DEFAULT_SHORTCUTS["select-all"]).toBe("Ctrl+A");
    expect(DEFAULT_SHORTCUTS.ungroup).toBe("Ctrl+Shift+G");
  });

  it("moves an action when its binding is changed", () => {
    useShortcutStore.getState().bind("copy", "Ctrl+Shift+C");
    const resolved = useShortcutStore.getState().resolve();
    expect(resolved.get("Ctrl+Shift+C")).toBe("copy");
    expect(resolved.get("Ctrl+C")).toBeUndefined();
    useShortcutStore.getState().reset("copy");
    expect(useShortcutStore.getState().resolve().get("Ctrl+C")).toBe("copy");
  });
});
