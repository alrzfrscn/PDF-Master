import { create } from "zustand";
import type { MeasureUnit } from "./measure";

export type SnapshotDpi = 72 | 150 | 300;

export interface Prefs {
  /** A rapid scribble erases what is underneath instead of drawing ink. */
  scratchOut: boolean;
  measureUnit: MeasureUnit;
  snapshotDpi: SnapshotDpi;
}

const PREFS_KEY = "pm.prefs";

const DEFAULTS: Prefs = { scratchOut: true, measureUnit: "mm", snapshotDpi: 150 };

function readPrefs(): Prefs {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

interface PrefState extends Prefs {
  set: (patch: Partial<Prefs>) => void;
  /** Replaces preferences from a workspace backup. */
  replace: (prefs: Partial<Prefs>) => void;
}

export const usePrefsStore = create<PrefState>((set, get) => ({
  ...readPrefs(),
  set: (patch) => {
    const next = { ...get(), ...patch };
    const value: Prefs = { scratchOut: next.scratchOut, measureUnit: next.measureUnit, snapshotDpi: next.snapshotDpi };
    if (typeof localStorage !== "undefined") localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    set(patch);
  },
  replace: (prefs) => {
    const value: Prefs = { ...DEFAULTS, ...prefs };
    if (typeof localStorage !== "undefined") localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    set(value);
  },
}));
