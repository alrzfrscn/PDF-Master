import { create } from "zustand";

/** A snapshot or converted selection saved as a reusable raster stamp. */
export interface CustomStamp {
  id: string;
  name: string;
  imageUrl: string;
  /** Natural raster size in pixels, matching factory stamp metrics. */
  width: number;
  height: number;
  createdAt: string;
}

const KEY = "pm.customStamps";

function readStamps(): CustomStamp[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]") as CustomStamp[];
    return Array.isArray(parsed) ? parsed.filter((stamp) => stamp?.imageUrl) : [];
  } catch {
    return [];
  }
}

function persist(stamps: CustomStamp[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(stamps));
  } catch {
    // Quota exceeded: the stamp stays usable for this session.
  }
}

interface CustomStampState {
  stamps: CustomStamp[];
  add: (stamp: Omit<CustomStamp, "id" | "createdAt">) => CustomStamp;
  remove: (id: string) => void;
}

export const useCustomStampStore = create<CustomStampState>((set, get) => ({
  stamps: readStamps(),
  add: (stamp) => {
    const created: CustomStamp = {
      ...stamp,
      id: `custom-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    const stamps = [created, ...get().stamps];
    persist(stamps);
    set({ stamps });
    return created;
  },
  remove: (id) => {
    const stamps = get().stamps.filter((stamp) => stamp.id !== id);
    persist(stamps);
    set({ stamps });
  },
}));
