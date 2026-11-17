import type { DocumentTab } from "./types";

export interface SavedWorkspace {
  version: 1;
  savedAt: string;
  activeId: string;
  tabs: DocumentTab[];
}

const DB_NAME = "pdf-master";
const STORE_NAME = "workspace";
const KEY = "current";

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

export async function saveWorkspace(tabs: DocumentTab[], activeId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(
      { version: 1, savedAt: new Date().toISOString(), activeId, tabs } satisfies SavedWorkspace,
      KEY,
    );
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  db.close();
}

export async function loadWorkspace(): Promise<SavedWorkspace | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await new Promise<SavedWorkspace | null>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(KEY);
    request.onsuccess = () => resolve((request.result as SavedWorkspace | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
  db.close();
  if (!result || result.version !== 1 || !Array.isArray(result.tabs) || result.tabs.length === 0) return null;
  return result;
}
