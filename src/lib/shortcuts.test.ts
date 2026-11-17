import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  bindingFromEvent,
  detectConflicts,
  normalizeBinding,
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
});
