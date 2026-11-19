import type { DocumentTab, ThemeName } from "./types";
import { useCustomStampStore, type CustomStamp } from "./customStamps";
import { useScaleStore, type MeasurementScale } from "./measure";
import { useShortcutStore, type ShortcutAction } from "./shortcuts";
import { usePrefsStore, type Prefs } from "./prefs";
import { useFavoritesStore, type FavoriteTool } from "../stores/useFavoritesStore";
import { useUIStore } from "../stores/useUIStore";

/** Everything a `.pmbackup.json` carries besides tabs, pages and annotations. */
export interface WorkspaceStores {
  customStamps: CustomStamp[];
  customScales: MeasurementScale[];
  activeScaleId: string;
  shortcuts: Record<ShortcutAction, string>;
  prefs: Prefs;
  theme: ThemeName;
  /** Absent in backups written before the favourite tools dock. */
  favorites?: FavoriteTool[];
}

export interface SavedWorkspace {
  version: 1 | 2;
  savedAt: string;
  activeId: string;
  tabs: DocumentTab[];
  stores?: WorkspaceStores;
}

/** Version 1 files (before stores were included) still import. */
const DB_NAME = "pdf-master";
const STORE_NAME = "workspace";
const BLOB_STORE = "pdf-blobs";
const KEY = "current";
const THEMES: ThemeName[] = ["light", "dark", "sepia"];

export interface SavedWorkspaceRecord {
  version: 1 | 2;
  savedAt: string;
  activeId: string;
  tabs: DocumentTab[];
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/**
 * Structural data and PDF bytes live in separate stores: re-saving after an
 * annotation edit no longer rewrites every page of every document.
 */
const savedBlobs = new Map<string, Uint8Array>();

/** PDF bytes cannot survive `JSON.stringify`, so a backup carries base64 text. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Frees a closed tab's blob and any orphan key no open tab owns. */
export async function deleteWorkspaceBlob(tabId: string, keepIds?: string[]): Promise<void> {
  savedBlobs.delete(tabId);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(BLOB_STORE, "readwrite");
    const store = transaction.objectStore(BLOB_STORE);
    store.delete(tabId);
    if (keepIds) {
      const keys = store.getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result) {
          if (typeof key === "string" && !keepIds.includes(key)) {
            store.delete(key);
            savedBlobs.delete(key);
          }
        }
      };
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  db.close();
}

export async function saveWorkspace(tabs: DocumentTab[], activeId: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  const blobs = new Map<string, Uint8Array>();
  const stripped = tabs.map((tab) => {
    if (!tab.pdf?.bytes) return tab;
    blobs.set(tab.id, tab.pdf.bytes);
    return { ...tab, pdf: { ...tab.pdf, bytes: undefined } };
  });
  const ok = await new Promise<boolean>((resolve) => {
    const transaction = db.transaction([STORE_NAME, BLOB_STORE], "readwrite");
    transaction.objectStore(STORE_NAME).put(
      { version: 2, savedAt: new Date().toISOString(), activeId, tabs: stripped } satisfies SavedWorkspaceRecord,
      KEY,
    );
    const blobStore = transaction.objectStore(BLOB_STORE);
    for (const [id, bytes] of blobs) {
      if (savedBlobs.get(id) === bytes) continue;
      blobStore.put(bytes, id);
    }
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
  db.close();
  if (ok) for (const [id, bytes] of blobs) savedBlobs.set(id, bytes);
  return ok;
}

export async function loadWorkspace(): Promise<SavedWorkspaceRecord | null> {
  const db = await openDb();
  if (!db) return null;
  const blobs = new Map<string, Uint8Array>();
  const saved = await new Promise<SavedWorkspaceRecord | null>((resolve) => {
    const transaction = db.transaction([STORE_NAME, BLOB_STORE], "readonly");
    const blobStore = transaction.objectStore(BLOB_STORE);
    let record: SavedWorkspaceRecord | null = null;
    transaction.oncomplete = () => resolve(record);
    transaction.onabort = () => resolve(null);
    const request = transaction.objectStore(STORE_NAME).get(KEY);
    request.onsuccess = () => {
      record = (request.result as SavedWorkspaceRecord | undefined) ?? null;
      if (!record) return;
      for (const tab of record.tabs) {
        if (!tab.pdf || tab.pdf.bytes) continue;
        const blobRequest = blobStore.get(tab.id);
        blobRequest.onsuccess = () => {
          if (blobRequest.result instanceof Uint8Array) blobs.set(tab.id, blobRequest.result);
        };
      }
    };
  });
  db.close();
  if (!saved || !Array.isArray(saved.tabs) || saved.tabs.length === 0) return null;
  saved.tabs = saved.tabs.map((tab) => {
    const bytes = blobs.get(tab.id) ?? tab.pdf?.bytes;
    if (!bytes) return tab;
    return {
      ...tab,
      pdf: {
        url: tab.pdf?.url ?? "",
        name: tab.pdf?.name ?? tab.title,
        pageCount: tab.pdf?.pageCount ?? tab.pages.length,
        bookmarks: tab.pdf?.bookmarks ?? [],
        bytes,
      },
    };
  });
  return saved;
}

/** Browser-quota figures for the autosave store; null where the API is missing. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

/** Reads the localStorage-backed stores a backup must keep alongside the document. */
export function collectWorkspaceStores(): WorkspaceStores {
  const prefs = usePrefsStore.getState();
  return {
    customStamps: useCustomStampStore.getState().stamps,
    customScales: useScaleStore.getState().custom,
    activeScaleId: useScaleStore.getState().activeId,
    shortcuts: useShortcutStore.getState().map,
    prefs: {
      scratchOut: prefs.scratchOut,
      measureUnit: prefs.measureUnit,
      snapshotDpi: prefs.snapshotDpi,
      touchDrawEnabled: prefs.touchDrawEnabled,
    },
    theme: useUIStore.getState().theme,
    favorites: useFavoritesStore.getState().favorites,
  };
}

/** Restores the stores from a backup file, leaving absent sections untouched. */
export function applyWorkspaceStores(stores: WorkspaceStores | undefined): void {
  if (!stores) return;
  if (Array.isArray(stores.customStamps)) useCustomStampStore.getState().restore(stores.customStamps);
  if (Array.isArray(stores.customScales)) {
    useScaleStore.getState().restore(stores.customScales, stores.activeScaleId);
  }
  if (stores.shortcuts) useShortcutStore.getState().replace(stores.shortcuts);
  if (stores.prefs) usePrefsStore.getState().replace(stores.prefs);
  if (stores.theme && THEMES.includes(stores.theme)) useUIStore.getState().setTheme(stores.theme);
  if (Array.isArray(stores.favorites)) useFavoritesStore.getState().restore(stores.favorites);
}

export function workspaceBackup(
  tabs: DocumentTab[],
  activeId: string,
  stores: WorkspaceStores = collectWorkspaceStores(),
): Blob {
  const serialized = tabs.map((tab) => {
    if (!tab.pdf?.bytes) return tab;
    const { bytes, ...pdf } = tab.pdf;
    return { ...tab, pdf: { ...pdf, bytesBase64: bytesToBase64(bytes) } };
  });
  const payload: SavedWorkspace = {
    version: 2,
    savedAt: new Date().toISOString(),
    activeId,
    tabs: serialized as DocumentTab[],
    stores,
  };
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
}

/** A `.pmbackup` JSON file, checked before it is handed to the store. */
export function parseWorkspaceBackup(text: string): SavedWorkspace | null {
  try {
    const parsed = JSON.parse(text) as Partial<SavedWorkspace> & { version?: number };
    if ((parsed?.version !== 1 && parsed?.version !== 2) || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) {
      return null;
    }
    const tabs = parsed.tabs.map((tab) => {
      const pdf = tab.pdf as
        | (NonNullable<DocumentTab["pdf"]> & { bytesBase64?: string; bytes?: unknown })
        | undefined;
      if (!pdf) return tab;
      const { bytesBase64, bytes, ...rest } = pdf;
      let decoded: Uint8Array | undefined;
      if (typeof bytesBase64 === "string" && bytesBase64) {
        try {
          decoded = base64ToBytes(bytesBase64);
        } catch {
          decoded = undefined;
        }
      } else if (bytes instanceof Uint8Array) {
        decoded = bytes;
      } else if (bytes && typeof bytes === "object") {
        // Legacy backups stringified the typed array into {"0":37,"1":80,...}.
        const values = Object.values(bytes as Record<string, number>);
        if (values.every((value) => typeof value === "number")) decoded = new Uint8Array(values);
      }
      return { ...tab, pdf: { ...rest, ...(decoded ? { bytes: decoded } : {}) } } as DocumentTab;
    });
    return { ...parsed, tabs } as SavedWorkspace;
  } catch {
    return null;
  }
}
