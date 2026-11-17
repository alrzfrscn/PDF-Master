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

/** Native save dialog where available, otherwise a download. */
async function writeFile(bytes: Uint8Array, name: string): Promise<boolean> {
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description: "PDF document", accept: { "application/pdf": [".pdf"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return true;
    } catch (error) {
      if ((error as DOMException | undefined)?.name === "AbortError") return false;
      // An unavailable picker falls through to the download path.
    }
  }
  downloadPdf(bytes, name);
  return true;
}

/** One place for both Save buttons and Ctrl+S. */
export async function saveActiveDocument(mode: PersistenceMode): Promise<void> {
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
    const saved = await writeFile(bytes, name);
    useUIStore.getState().setToast(saved ? `Saved ${name}` : "Save cancelled");
  } catch (error) {
    useUIStore
      .getState()
      .setToast(`Could not save: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    useUIStore.getState().setSaving(false);
  }
}
