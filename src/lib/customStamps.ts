import { create } from "zustand";
import { stampById, userStamps } from "./data";

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
const DB_NAME = "pdf-master-stamps";
const STORE = "stamps";

export interface StampWriteResult {
  ok: boolean;
  /** The created stamp, present as soon as the store accepts it. */
  stamp?: CustomStamp;
  error?: string;
}

export interface ResolvedStamp {
  id: string;
  name: string;
  imageUrl: string;
  /** Natural raster width in pixels. */
  width: number;
  /** Natural raster height in pixels. */
  height: number;
  source: "custom" | "factory" | "user";
}

/** One lookup for every stamp source; saved stamps win over factory ids. */
export function resolveStamp(id: string | null | undefined): ResolvedStamp | null {
  if (!id) return null;
  const custom = useCustomStampStore.getState().stamps.find((stamp) => stamp.id === id);
  if (custom) {
    return { id: custom.id, name: custom.name, imageUrl: custom.imageUrl, width: custom.width, height: custom.height, source: "custom" };
  }
  const factory = stampById.get(id);
  if (factory?.imageUrl) {
    return { id: factory.id, name: factory.title.en, imageUrl: factory.imageUrl, width: factory.width, height: factory.height, source: "factory" };
  }
  const user = userStamps.find((stamp) => stamp.id === id);
  if (user) return { id: user.id, name: user.name, imageUrl: user.imageUrl, width: user.inkWidth, height: user.inkHeight, source: "user" };
  return null;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/** localStorage holds the fast copy; IndexedDB keeps the durable one. */
async function mirror(stamps: CustomStamp[]): Promise<StampWriteResult> {
  const db = await openDb();
  if (!db) return { ok: false, error: "IndexedDB is unavailable" };
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      store.clear();
      for (const stamp of stamps) store.put(stamp);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("stamp store write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("stamp store write aborted"));
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    db.close();
  }
}

/** Durable copy, read once at startup. */
export async function loadMirroredStamps(): Promise<CustomStamp[] | null> {
  const db = await openDb();
  if (!db) return null;
  const stamps = await new Promise<CustomStamp[] | null>((resolve) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as CustomStamp[]).filter((stamp) => stamp?.imageUrl));
    request.onerror = () => resolve(null);
  });
  db.close();
  return stamps?.length ? stamps : null;
}

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
  add: (stamp: Omit<CustomStamp, "id" | "createdAt">) => Promise<StampWriteResult>;
  remove: (id: string) => void;
  /** Replaces the library from a workspace backup. */
  restore: (stamps: CustomStamp[]) => void;
}

export const useCustomStampStore = create<CustomStampState>((set, get) => ({
  stamps: readStamps(),
  add: async (stamp) => {
    const created: CustomStamp = {
      ...stamp,
      id: `custom-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    const stamps = [created, ...get().stamps];
    persist(stamps);
    set({ stamps });
    return { ...(await mirror(stamps)), stamp: created };
  },
  remove: (id) => {
    const stamps = get().stamps.filter((stamp) => stamp.id !== id);
    persist(stamps);
    set({ stamps });
    void mirror(stamps);
  },
  restore: (stamps) => {
    const valid = stamps.filter((stamp) => stamp?.id && stamp.imageUrl && stamp.width > 0 && stamp.height > 0);
    persist(valid);
    set({ stamps: valid });
    void mirror(valid);
  },
}));
