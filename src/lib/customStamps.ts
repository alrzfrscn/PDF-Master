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
const LIBRARY_ID = "library";
const EPOCH = new Date(0).toISOString();

/** A library plus the write time, so a stale mirror cannot undo a removal. */
export interface StampLibrary {
  updatedAt: string;
  stamps: CustomStamp[];
}

function validStamps(stamps: unknown[]): CustomStamp[] {
  return stamps.filter(
    (stamp): stamp is CustomStamp =>
      typeof stamp === "object" &&
      stamp !== null &&
      typeof (stamp as CustomStamp).id === "string" &&
      typeof (stamp as CustomStamp).imageUrl === "string" &&
      (stamp as CustomStamp).width > 0 &&
      (stamp as CustomStamp).height > 0,
  );
}

function readLibrary(): StampLibrary {
  if (typeof localStorage === "undefined") return { updatedAt: EPOCH, stamps: [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as unknown;
    // Files written before the envelope are a bare array.
    if (Array.isArray(parsed)) return { updatedAt: EPOCH, stamps: validStamps(parsed) };
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as StampLibrary).stamps)) {
      const library = parsed as StampLibrary;
      return {
        updatedAt: typeof library.updatedAt === "string" ? library.updatedAt : EPOCH,
        stamps: validStamps(library.stamps),
      };
    }
  } catch {
    // A corrupt entry is treated as an empty library.
  }
  return { updatedAt: EPOCH, stamps: [] };
}

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
async function mirror(library: StampLibrary): Promise<StampWriteResult> {
  const db = await openDb();
  if (!db) return { ok: false, error: "IndexedDB is unavailable" };
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      store.clear();
      store.put({ id: LIBRARY_ID, ...library });
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
export async function loadMirroredStamps(): Promise<StampLibrary | null> {
  const db = await openDb();
  if (!db) return null;
  const library = await new Promise<StampLibrary | null>((resolve) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).getAll();
    request.onsuccess = () => {
      const records = request.result as unknown[];
      const envelope = records.find(
        (record): record is StampLibrary & { id: string } =>
          typeof record === "object" && record !== null && Array.isArray((record as StampLibrary).stamps),
      );
      if (envelope) {
        resolve({ updatedAt: envelope.updatedAt ?? EPOCH, stamps: validStamps(envelope.stamps) });
        return;
      }
      // Legacy mirror: one record per stamp, no timestamp.
      const stamps = validStamps(records);
      resolve(stamps.length ? { updatedAt: EPOCH, stamps } : null);
    };
    request.onerror = () => resolve(null);
  });
  db.close();
  return library;
}

function persist(library: StampLibrary): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(library));
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
  /** Applies the durable mirror only when it is newer than the local library. */
  restoreIfNewer: (library: StampLibrary) => void;
}

function stampLibrary(stamps: CustomStamp[]): StampLibrary {
  return { updatedAt: new Date().toISOString(), stamps: validStamps(stamps) };
}

export const useCustomStampStore = create<CustomStampState>((set, get) => ({
  stamps: readLibrary().stamps,
  add: async (stamp) => {
    const created: CustomStamp = {
      ...stamp,
      id: `custom-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    const library = stampLibrary([created, ...get().stamps]);
    persist(library);
    set({ stamps: library.stamps });
    return { ...(await mirror(library)), stamp: created };
  },
  remove: (id) => {
    const library = stampLibrary(get().stamps.filter((stamp) => stamp.id !== id));
    persist(library);
    set({ stamps: library.stamps });
    void mirror(library);
  },
  restore: (stamps) => {
    const library = stampLibrary(stamps);
    persist(library);
    set({ stamps: library.stamps });
    void mirror(library);
  },
  restoreIfNewer: (library) => {
    // A removal writes a newer timestamp locally; replaying an older mirror
    // would bring the deleted stamp back.
    if (library.updatedAt <= readLibrary().updatedAt) return;
    const next: StampLibrary = { updatedAt: library.updatedAt, stamps: validStamps(library.stamps) };
    persist(next);
    set({ stamps: next.stamps });
  },
}));
