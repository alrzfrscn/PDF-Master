import { downloadPdf, exportInputFromTab, exportPdf, type PersistenceMode } from "./pdfEngine";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";

interface SaveFileHandle {
  createWritable: () => Promise<{ write: (data: Uint8Array) => Promise<void>; close: () => Promise<void> }>;
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveFileHandle>;
}

function fileName(title: string, mode: PersistenceMode): string {
  const clean = title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document";
  return `${clean}${mode === "flattened" ? "-flattened" : ""}.pdf`;
}

/** Reused by Save and Ctrl+S so a saved tab writes in place instead of reopening the picker. */
const saveHandles = new Map<string, SaveFileHandle>();

async function writeHandle(handle: SaveFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

/** Native save dialog where available, otherwise a download. */
async function writeFile(bytes: Uint8Array, name: string, alwaysAsk = false, tabId?: string): Promise<boolean> {
  const cached = tabId && !alwaysAsk ? saveHandles.get(tabId) : undefined;
  if (cached) {
    try {
      await writeHandle(cached, bytes);
      return true;
    } catch {
      if (tabId) saveHandles.delete(tabId);
    }
  }
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
      });
      await writeHandle(handle, bytes);
      if (tabId) saveHandles.set(tabId, handle);
      return true;
    } catch (error) {
      if ((error as DOMException | undefined)?.name === "AbortError") return false;
      // An unavailable picker falls through to the download path.
    }
  }
  let target = name;
  if (alwaysAsk) {
    const answer = window.prompt("Save as", name);
    if (answer === null) return false;
    target = answer.trim() || name;
    if (!/\.pdf$/i.test(target)) target += ".pdf";
  }
  downloadPdf(bytes, target);
  return true;
}

/** One place for both Save buttons and Ctrl+S. */
export async function saveActiveDocument(mode: PersistenceMode, alwaysAsk = false): Promise<void> {
  const ui = useUIStore.getState();
  if (ui.saving) return;
  const state = useDocStore.getState();
  const tab = state.tabs.find((item) => item.id === state.activeId);
  if (!tab) return;
  ui.setSaving(true);
  ui.setToast(mode === "flattened" ? "Flattening PDF…" : "Preparing editable PDF…");
  try {
    const bytes = await exportPdf(exportInputFromTab(tab, mode));
    const name = fileName(tab.title, mode);
    const saved = await writeFile(bytes, name, alwaysAsk, tab.id);
    useUIStore.getState().setToast(saved ? `Saved ${name}` : "Save cancelled");
  } catch (error) {
    useUIStore
      .getState()
      .setToast(`Could not save: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    useUIStore.getState().setSaving(false);
  }
}

/** Prints every page by handing the flattened export to the browser. */
export async function printActiveDocument(): Promise<void> {
  const ui = useUIStore.getState();
  const state = useDocStore.getState();
  const tab = state.tabs.find((item) => item.id === state.activeId);
  if (!tab || ui.saving) return;
  ui.setSaving(true);
  try {
    const bytes = await exportPdf(exportInputFromTab(tab, "flattened"));
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    frame.src = url;
    frame.onload = () => {
      frame.contentWindow?.print();
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60000);
    };
    document.body.appendChild(frame);
  } catch (error) {
    ui.setToast(`Could not print: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    ui.setSaving(false);
  }
}
