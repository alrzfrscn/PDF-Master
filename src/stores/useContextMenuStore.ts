import { create } from "zustand";
import type { ComponentType } from "react";
import type { ToolId } from "../lib/types";

type MenuIcon = ComponentType<{ size?: number | string; strokeWidth?: number; className?: string }>;

export interface MenuItem {
  label: string;
  icon?: MenuIcon;
  /** Shown muted on the right, e.g. `Ctrl+C`. */
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export type MenuEntry = MenuItem | "divider";

interface MenuPayload {
  x: number;
  y: number;
  label: string;
  entries: MenuEntry[];
  /** Tools offered as an icon strip above the entries. */
  quickTools?: ToolId[];
}

interface ContextMenuState {
  menu: MenuPayload | null;
  openAt: (x: number, y: number, label: string, entries: MenuEntry[], quickTools?: ToolId[]) => void;
  close: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  menu: null,
  openAt: (x, y, label, entries, quickTools) => set({ menu: { x, y, label, entries, quickTools } }),
  close: () => set({ menu: null }),
}));

export const MENU_MARGIN = 8;

/** Text fields keep the browser's own Cut/Copy/Paste menu. */
export function keepsNativeMenu(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  );
}

/**
 * Measured width and height decide whether the menu would leave the window:
 * it then flips to the other side of the cursor, and finally clamps inside.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const left = x + width + MENU_MARGIN > viewportWidth ? Math.max(MENU_MARGIN, x - width) : x;
  const top = y + height + MENU_MARGIN > viewportHeight ? Math.max(MENU_MARGIN, y - height) : y;
  return {
    x: Math.min(left, Math.max(MENU_MARGIN, viewportWidth - width - MENU_MARGIN)),
    y: Math.min(top, Math.max(MENU_MARGIN, viewportHeight - height - MENU_MARGIN)),
  };
}
