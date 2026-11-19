import { create } from "zustand";
import { TOOLS } from "./tools";
import type { ToolId } from "./types";

export type ShortcutAction =
  | ToolId
  | "settings"
  | "palette"
  | "save"
  | "open"
  | "print"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "duplicate"
  | "select-all"
  | "group"
  | "ungroup"
  | "presentation"
  | "fit-page"
  | "search"
  | "view-one-page"
  | "view-one-continuous"
  | "view-two-continuous"
  | "view-two-page"
  | "toggle-cover-page";

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  ...(Object.fromEntries(TOOLS.map((tool) => [tool.id, tool.name])) as Record<ToolId, string>),
  settings: "Open settings",
  palette: "Command palette",
  save: "Save editable PDF",
  open: "Open PDF",
  print: "Print page",
  undo: "Undo",
  redo: "Redo",
  cut: "Cut selection",
  copy: "Copy selection",
  paste: "Paste",
  duplicate: "Duplicate selection",
  "select-all": "Select all annotations",
  group: "Group selection",
  ungroup: "Ungroup selection",
  presentation: "Presentation mode",
  "fit-page": "Fit page",
  search: "Search document",
  "view-one-page": "One page",
  "view-one-continuous": "One page continuous",
  "view-two-continuous": "Two pages continuous",
  "view-two-page": "Two pages",
  "toggle-cover-page": "Separate cover page",
};

/** `⇧S` from the migration table becomes a real binding. */
function fromToolShortcut(shortcut: string): string {
  return shortcut.startsWith("⇧") ? `Shift+${shortcut.slice(1)}` : shortcut;
}

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  ...(Object.fromEntries(TOOLS.map((tool) => [tool.id, fromToolShortcut(tool.shortcut)])) as Record<ToolId, string>),
  settings: "Ctrl+,",
  palette: "Ctrl+K",
  save: "Ctrl+S",
  open: "Ctrl+O",
  print: "Ctrl+P",
  undo: "Ctrl+Z",
  redo: "Ctrl+Y",
  cut: "Ctrl+X",
  copy: "Ctrl+C",
  paste: "Ctrl+V",
  duplicate: "Ctrl+D",
  "select-all": "Ctrl+A",
  group: "Ctrl+G",
  ungroup: "Ctrl+Shift+G",
  presentation: "Ctrl+Shift+P",
  "fit-page": "0",
  search: "Ctrl+F",
  "view-one-page": "Ctrl+1",
  "view-one-continuous": "Ctrl+2",
  "view-two-continuous": "Ctrl+3",
  "view-two-page": "Ctrl+4",
  "toggle-cover-page": "Ctrl+7",
};

export const SHORTCUT_ACTIONS = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];

/** Canonical order and spelling: Ctrl, Alt, Shift, then the key. */
export function normalizeBinding(binding: string): string {
  const parts = binding
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.pop() ?? "";
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  const ordered: string[] = [];
  if (mods.has("ctrl") || mods.has("control") || mods.has("meta") || mods.has("cmd") || mods.has("⌘")) ordered.push("Ctrl");
  if (mods.has("alt") || mods.has("option")) ordered.push("Alt");
  if (mods.has("shift") || mods.has("⇧")) ordered.push("Shift");
  const normalizedKey = key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  ordered.push(normalizedKey);
  return ordered.join("+");
}

/** Physical key from `event.code`, so a Persian or other non-Latin layout still matches. */
function physicalKey(code: string | undefined): string | null {
  if (!code) return null;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  if (code === "Comma") return ",";
  if (code === "Minus" || code === "NumpadSubtract") return "-";
  if (code === "Equal" || code === "NumpadAdd") return "+";
  return null;
}

export function bindingFromEvent(event: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): string | null {
  const key = physicalKey(event.code) ?? event.key;
  if (!key || ["Control", "Meta", "Alt", "Shift", "CapsLock", "Dead"].includes(key)) return null;
  const mods: string[] = [];
  if (event.ctrlKey || event.metaKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  const printable = key.length === 1 ? key.toUpperCase() : key;
  return [...mods, printable].join("+");
}

export interface ConflictMap {
  /** Binding -> every action that claims it, in table order. */
  byBinding: Map<string, ShortcutAction[]>;
  /** Actions whose binding is shared with at least one other action. */
  conflicting: Set<ShortcutAction>;
}

export function detectConflicts(map: Record<ShortcutAction, string>): ConflictMap {
  const byBinding = new Map<string, ShortcutAction[]>();
  for (const action of SHORTCUT_ACTIONS) {
    const raw = map[action]?.trim();
    if (!raw) continue;
    const binding = normalizeBinding(raw);
    byBinding.set(binding, [...(byBinding.get(binding) ?? []), action]);
  }
  const conflicting = new Set<ShortcutAction>();
  for (const actions of byBinding.values()) {
    if (actions.length > 1) actions.forEach((action) => conflicting.add(action));
  }
  return { byBinding, conflicting };
}

const STORE_KEY = "pm.shortcuts";

function readShortcuts(): Record<ShortcutAction, string> {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SHORTCUTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Partial<Record<ShortcutAction, string>>;
    return { ...DEFAULT_SHORTCUTS, ...saved };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

interface ShortcutState {
  map: Record<ShortcutAction, string>;
  bind: (action: ShortcutAction, binding: string) => void;
  reset: (action?: ShortcutAction) => void;
  /** Replaces the whole table from a workspace backup, filling gaps with defaults. */
  replace: (map: Partial<Record<ShortcutAction, string>>) => void;
  conflicts: () => ConflictMap;
  resolve: () => Map<string, ShortcutAction>;
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  map: readShortcuts(),
  bind: (action, binding) => {
    const map = { ...get().map, [action]: normalizeBinding(binding) };
    if (typeof localStorage !== "undefined") localStorage.setItem(STORE_KEY, JSON.stringify(map));
    set({ map });
  },
  reset: (action) => {
    const map = action ? { ...get().map, [action]: DEFAULT_SHORTCUTS[action] } : { ...DEFAULT_SHORTCUTS };
    if (typeof localStorage !== "undefined") localStorage.setItem(STORE_KEY, JSON.stringify(map));
    set({ map });
  },
  replace: (incoming) => {
    const map = { ...DEFAULT_SHORTCUTS };
    for (const action of SHORTCUT_ACTIONS) {
      const binding = incoming[action];
      if (typeof binding === "string" && binding.trim()) map[action] = normalizeBinding(binding);
    }
    if (typeof localStorage !== "undefined") localStorage.setItem(STORE_KEY, JSON.stringify(map));
    set({ map });
  },
  conflicts: () => detectConflicts(get().map),
  resolve: () => {
    const resolved = new Map<string, ShortcutAction>();
    for (const action of SHORTCUT_ACTIONS) {
      const binding = get().map[action]?.trim();
      // A conflict keeps the first action in table order and ignores the later one.
      if (binding && !resolved.has(normalizeBinding(binding))) resolved.set(normalizeBinding(binding), action);
    }
    return resolved;
  },
}));
