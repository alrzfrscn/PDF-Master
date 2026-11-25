import type { DocumentPage, DocumentTab, ThemeName } from "./types";
import type { Annotation } from "./annotationTypes";
import { useCustomStampStore, type CustomStamp } from "./customStamps";
import { useScaleStore, type MeasurementScale } from "./measure";
import { useShortcutStore, type ShortcutAction } from "./shortcuts";
import { usePrefsStore, type Prefs } from "./prefs";
import { useFavoritesStore, type FavoriteTool } from "../stores/useFavoritesStore";
import { useUIStore } from "../stores/useUIStore";
import { base64ToBytes, bytesToBase64 } from "./base64";

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

/** Legacy single-record shape; current saves write one record per tab. */
export interface SavedWorkspaceRecord {
  version: 1 | 2;
  savedAt: string;
  activeId: string;
  tabs: DocumentTab[];
}

interface WorkspaceMeta {
  version: 2;
  savedAt: string;
  activeId: string;
  tabIds: string[];
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
/** Last saved object per tab, so an unchanged tab is not serialised again. */
const savedTabRefs = new Map<string, DocumentTab>();

function requestValue<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => resolve(undefined);
  });
}

/** Frees a closed tab's blob and any orphan key no open tab owns. */
export async function deleteWorkspaceBlob(tabId: string, keepIds?: string[]): Promise<void> {
  savedBlobs.delete(tabId);
  savedTabRefs.delete(tabId);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction([STORE_NAME, BLOB_STORE], "readwrite");
    const tabStore = transaction.objectStore(STORE_NAME);
    const blobStore = transaction.objectStore(BLOB_STORE);
    tabStore.delete(tabId);
    blobStore.delete(tabId);
    if (keepIds) {
      const keys = blobStore.getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result) {
          if (typeof key === "string" && !keepIds.includes(key)) {
            blobStore.delete(key);
            savedBlobs.delete(key);
          }
        }
      };
      const tabKeys = tabStore.getAllKeys();
      tabKeys.onsuccess = () => {
        for (const key of tabKeys.result) {
          if (typeof key === "string" && key !== KEY && !keepIds.includes(key)) {
            tabStore.delete(key);
            savedTabRefs.delete(key);
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
  const changed: DocumentTab[] = [];
  const tabIds = tabs.map((tab) => tab.id);
  for (const tab of tabs) {
    if (savedTabRefs.get(tab.id) === tab) continue;
    if (tab.pdf?.bytes) {
      blobs.set(tab.id, tab.pdf.bytes);
      changed.push({ ...tab, pdf: { ...tab.pdf, bytes: undefined } });
    } else {
      changed.push(tab);
    }
  }
  const meta: WorkspaceMeta = { version: 2, savedAt: new Date().toISOString(), activeId, tabIds };
  const ok = await new Promise<boolean>((resolve) => {
    const transaction = db.transaction([STORE_NAME, BLOB_STORE], "readwrite");
    const tabStore = transaction.objectStore(STORE_NAME);
    tabStore.put(meta, KEY);
    for (const tab of changed) tabStore.put(tab, tab.id);
    // Prune records for tabs that are no longer open.
    const tabKeys = tabStore.getAllKeys();
    tabKeys.onsuccess = () => {
      for (const key of tabKeys.result) {
        if (typeof key === "string" && key !== KEY && !tabIds.includes(key)) {
          tabStore.delete(key);
          savedTabRefs.delete(key);
        }
      }
    };
    const blobStore = transaction.objectStore(BLOB_STORE);
    for (const [id, bytes] of blobs) {
      if (savedBlobs.get(id) === bytes) continue;
      blobStore.put(bytes, id);
    }
    const blobKeys = blobStore.getAllKeys();
    blobKeys.onsuccess = () => {
      for (const key of blobKeys.result) {
        if (typeof key === "string" && !tabIds.includes(key)) {
          blobStore.delete(key);
          savedBlobs.delete(key);
        }
      }
    };
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
  db.close();
  if (ok) {
    for (const tab of tabs) savedTabRefs.set(tab.id, tab);
    for (const [id, bytes] of blobs) savedBlobs.set(id, bytes);
  }
  return ok;
}

async function attachPdfBytes(db: IDBDatabase, tabs: DocumentTab[]): Promise<DocumentTab[]> {
  const transaction = db.transaction(BLOB_STORE, "readonly");
  const blobStore = transaction.objectStore(BLOB_STORE);
  const blobs = new Map<string, Uint8Array>();
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.pdf || tab.pdf.bytes) return;
      const value = await requestValue<Uint8Array>(blobStore, tab.id);
      if (value instanceof Uint8Array) blobs.set(tab.id, value);
    }),
  );
  return tabs.map((tab) => {
    const bytes = blobs.get(tab.id) ?? tab.pdf?.bytes;
    if (!bytes) return tab;
    savedBlobs.set(tab.id, bytes);
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
}

export async function loadWorkspace(): Promise<SavedWorkspaceRecord | null> {
  const db = await openDb();
  if (!db) return null;
  const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
  const meta = await requestValue<WorkspaceMeta | SavedWorkspaceRecord>(store, KEY);
  if (!meta) {
    db.close();
    return null;
  }
  let tabs: DocumentTab[];
  if ("tabs" in meta && Array.isArray(meta.tabs)) {
    // A workspace written before per-tab records.
    tabs = meta.tabs;
  } else {
    tabs = [];
    for (const id of (meta as WorkspaceMeta).tabIds) {
      const tab = await requestValue<DocumentTab>(store, id);
      if (tab) tabs.push(tab);
    }
  }
  const withBytes = await attachPdfBytes(db, tabs);
  db.close();
  if (withBytes.length === 0) return null;
  for (const tab of withBytes) savedTabRefs.set(tab.id, tab);
  return {
    version: meta.version,
    savedAt: meta.savedAt,
    activeId: meta.activeId,
    tabs: withBytes,
  };
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

/** Downloads the current workspace; shared by Settings and the autosave banner. */
export function downloadWorkspaceBackup(tabs: DocumentTab[], activeId: string): void {
  if (typeof document === "undefined") return;
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(workspaceBackup(tabs, activeId));
  anchor.href = url;
  anchor.download = `pdf-master-${new Date().toISOString().slice(0, 10)}.pmbackup.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const ALLOWED_IMAGE_PREFIXES = ["data:image/", "blob:", "/assets/"];
const ANNOTATION_TYPES = new Set(["pen", "marker", "shape", "stamp", "text", "formula"]);
const ROTATIONS = new Set([0, 90, 180, 270]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A backup may only point images at data, blob or bundled assets. */
function safeImageUrl(value: unknown): string | undefined {
  return typeof value === "string" && ALLOWED_IMAGE_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? value
    : undefined;
}

function sanitizeAnnotation(value: unknown): Annotation | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") return null;
  if (!ANNOTATION_TYPES.has(value.type)) return null;
  const annotation = { ...value };
  if (value.type === "stamp") {
    const imageUrl = safeImageUrl(value.imageUrl);
    if (imageUrl) annotation.imageUrl = imageUrl;
    else delete annotation.imageUrl;
  }
  return annotation as unknown as Annotation;
}

function sanitizePage(value: unknown): DocumentPage | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.templateId !== "string") return null;
  if (!Array.isArray(value.annotations)) return null;
  const rotation = typeof value.rotation === "number" && ROTATIONS.has(value.rotation) ? value.rotation : 0;
  const annotations = value.annotations.map(sanitizeAnnotation).filter((item): item is Annotation => item !== null);
  return { ...(value as unknown as DocumentPage), rotation: rotation as DocumentPage["rotation"], annotations };
}

function sanitizeTab(value: unknown): DocumentTab | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return null;
  if (!Array.isArray(value.pages) || value.pages.length === 0) return null;
  const pages = value.pages.map(sanitizePage);
  if (pages.some((page) => page === null)) return null;
  const valid = pages as DocumentPage[];
  return { ...(value as unknown as DocumentTab), pages: valid, pageCount: valid.length };
}

function sanitizeStores(value: unknown): WorkspaceStores | undefined {
  if (!isRecord(value)) return undefined;
  const stores = { ...value } as unknown as WorkspaceStores;
  if (Array.isArray(stores.customStamps)) {
    stores.customStamps = stores.customStamps.filter(
      (stamp) => isRecord(stamp) && safeImageUrl(stamp.imageUrl) !== undefined,
    );
  }
  return stores;
}

/** A `.pmbackup` JSON file, checked before it is handed to the store. */
export function parseWorkspaceBackup(text: string): SavedWorkspace | null {
  try {
    const parsed = JSON.parse(text) as Partial<SavedWorkspace> & { version?: number };
    if ((parsed?.version !== 1 && parsed?.version !== 2) || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) {
      return null;
    }
    const tabs: DocumentTab[] = [];
    for (const value of parsed.tabs) {
      const tab = sanitizeTab(value);
      if (!tab) return null;
      const pdf = (tab as { pdf?: Record<string, unknown> }).pdf;
      if (pdf) {
        const { bytesBase64, bytes, ...rest } = pdf;
        let decoded: Uint8Array | undefined;
        if (bytesBase64 !== undefined) {
          if (typeof bytesBase64 !== "string" || !bytesBase64) return null;
          try {
            decoded = base64ToBytes(bytesBase64);
          } catch {
            return null;
          }
          if (decoded.length === 0) return null;
        } else if (bytes instanceof Uint8Array) {
          decoded = bytes;
        } else if (isRecord(bytes)) {
          // Legacy backups stringified the typed array into {"0":37,"1":80,...}.
          const values = Object.values(bytes);
          if (!values.every((item) => typeof item === "number")) return null;
          decoded = new Uint8Array(values as number[]);
        }
        // A PDF tab is useless without its bytes.
        if (!decoded || decoded.length === 0) return null;
        tab.pdf = { ...rest, bytes: decoded } as DocumentTab["pdf"];
      }
      tabs.push(tab);
    }
    const activeId = typeof parsed.activeId === "string" ? parsed.activeId : tabs[0].id;
    return {
      version: parsed.version,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      activeId,
      tabs,
      stores: sanitizeStores(parsed.stores),
    };
  } catch {
    return null;
  }
}
