import type { DocumentTab, ThemeName } from "./types";
import { useCustomStampStore, type CustomStamp } from "./customStamps";
import { useScaleStore, type MeasurementScale } from "./measure";
import { useShortcutStore, type ShortcutAction } from "./shortcuts";
import { usePrefsStore, type Prefs } from "./prefs";
import { useUIStore } from "../stores/useUIStore";

/** Everything a `.pmbackup.json` carries besides tabs, pages and annotations. */
export interface WorkspaceStores {
  customStamps: CustomStamp[];
  customScales: MeasurementScale[];
  activeScaleId: string;
  shortcuts: Record<ShortcutAction, string>;
  prefs: Prefs;
  theme: ThemeName;
}

export interface SavedWorkspace {
  version: 1 | 2;
  savedAt: string;
  activeId: string;
  tabs: DocumentTab[];
  stores?: WorkspaceStores;
}

/** Version 1 files (before stores were included) still import. */
interface LegacyWorkspace {
  version: 1;
  savedAt: string;
  activeId: string;
  tabs: DocumentTab[];
}

const DB_NAME = "pdf-master";
const STORE_NAME = "workspace";
const KEY = "current";
const THEMES: ThemeName[] = ["light", "dark", "sepia"];

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveWorkspace(tabs: DocumentTab[], activeId: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  const ok = await new Promise<boolean>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(
      { version: 1, savedAt: new Date().toISOString(), activeId, tabs } satisfies LegacyWorkspace,
      KEY,
    );
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
  });
  db.close();
  return ok;
}

export async function loadWorkspace(): Promise<LegacyWorkspace | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await new Promise<LegacyWorkspace | null>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(KEY);
    request.onsuccess = () => resolve((request.result as LegacyWorkspace | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
  db.close();
  if (!result || result.version !== 1 || !Array.isArray(result.tabs) || result.tabs.length === 0) return null;
  return result;
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
    prefs: { scratchOut: prefs.scratchOut, measureUnit: prefs.measureUnit, snapshotDpi: prefs.snapshotDpi },
    theme: useUIStore.getState().theme,
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
}

export function workspaceBackup(
  tabs: DocumentTab[],
  activeId: string,
  stores: WorkspaceStores = collectWorkspaceStores(),
): Blob {
  const payload: SavedWorkspace = {
    version: 2,
    savedAt: new Date().toISOString(),
    activeId,
    tabs,
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
    return parsed as SavedWorkspace;
  } catch {
    return null;
  }
}
