import { downloadPdf, exportInputFromTab, exportPdf, type PersistenceMode } from "./pdfEngine";
import { exportMarkdownToPdf, renderMarkdown } from "./markdown";
import { isMarkdownTab } from "./types";
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

type SaveKind = "pdf" | "markdown";

const FILE_TYPES: Record<SaveKind, { description: string; accept: Record<string, string[]>; extension: string }> = {
  pdf: { description: "PDF document", accept: { "application/pdf": [".pdf"] }, extension: ".pdf" },
  markdown: {
    description: "Markdown document",
    accept: { "text/markdown": [".md", ".markdown"] },
    extension: ".md",
  },
};

function cleanTitle(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document";
}

function fileName(title: string, mode: PersistenceMode): string {
  return `${cleanTitle(title)}${mode === "flattened" ? "-flattened" : ""}.pdf`;
}

/**
 * Reused by Save and Ctrl+S so a saved tab writes in place instead of reopening
 * the picker. Keyed per tab and mode: an editable save and a flattened export
 * are different files.
 */
const saveHandles = new Map<string, SaveFileHandle>();

function handleKey(tabId: string, mode: string): string {
  return `${tabId}:${mode}`;
}

/** Forgets a tab's saved targets (close, restore, permanent dispose). */
export function clearSaveHandle(tabId: string): void {
  for (const key of [...saveHandles.keys()]) {
    if (key.startsWith(`${tabId}:`)) saveHandles.delete(key);
  }
}

async function writeHandle(handle: SaveFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

/** Native save dialog where available, otherwise a download. */
async function writeFile(
  bytes: Uint8Array,
  name: string,
  key: string | undefined,
  alwaysAsk = false,
  kind: SaveKind = "pdf",
): Promise<boolean> {
  const type = FILE_TYPES[kind];
  const cached = key && !alwaysAsk ? saveHandles.get(key) : undefined;
  if (cached) {
    try {
      await writeHandle(cached, bytes);
      return true;
    } catch {
      if (key) saveHandles.delete(key);
    }
  }
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({ suggestedName: name, types: [type] });
      await writeHandle(handle, bytes);
      if (key) saveHandles.set(key, handle);
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
    if (!target.toLowerCase().endsWith(type.extension)) target += type.extension;
  }
  downloadPdf(bytes, target, kind === "markdown" ? "text/markdown" : "application/pdf");
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
    const saved = await writeFile(bytes, name, handleKey(tab.id, mode), alwaysAsk, "pdf");
    useUIStore.getState().setToast(saved ? `Saved ${name}` : "Save cancelled");
  } catch (error) {
    useUIStore
      .getState()
      .setToast(`Could not save: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    useUIStore.getState().setSaving(false);
  }
}

/** Writes the active Markdown tab as a `.md` file; Ctrl+S reuses its handle. */
export async function saveMarkdownDocument(alwaysAsk = false): Promise<void> {
  const ui = useUIStore.getState();
  if (ui.saving) return;
  const state = useDocStore.getState();
  const tab = state.tabs.find((item) => item.id === state.activeId);
  if (!isMarkdownTab(tab)) return;
  const name =
    tab.markdown.fileName && /\.(md|markdown)$/i.test(tab.markdown.fileName)
      ? tab.markdown.fileName
      : `${cleanTitle(tab.title)}.md`;
  ui.setSaving(true);
  try {
    const bytes = new TextEncoder().encode(tab.markdown.content);
    const saved = await writeFile(bytes, name, handleKey(tab.id, "markdown"), alwaysAsk, "markdown");
    useUIStore.getState().setToast(saved ? `Saved ${name}` : "Save cancelled");
  } catch (error) {
    useUIStore.getState().setToast(`Could not save: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    useUIStore.getState().setSaving(false);
  }
}

/**
 * Converts the active Markdown tab to A4 PDF. `annotate` opens the result as a
 * new PDF tab (pen/highlighter ready) instead of asking for a file name.
 */
export async function exportMarkdownAsPdf(annotate = false): Promise<void> {
  const ui = useUIStore.getState();
  if (ui.saving) return;
  const state = useDocStore.getState();
  const tab = state.tabs.find((item) => item.id === state.activeId);
  if (!isMarkdownTab(tab)) return;
  ui.setSaving(true);
  ui.setToast(annotate ? "Preparing annotatable PDF…" : "Exporting PDF…");
  try {
    const bytes = await exportMarkdownToPdf(tab.title, renderMarkdown(tab.markdown.content), ui.theme);
    const name = `${cleanTitle(tab.title)}.pdf`;
    if (annotate) {
      await useDocStore.getState().openPdfBytes(bytes, `${cleanTitle(tab.title)} (PDF).pdf`);
      useUIStore.getState().setToast("Markdown opened as an annotatable PDF");
    } else {
      const saved = await writeFile(bytes, name, handleKey(tab.id, "markdown-pdf"), true, "pdf");
      useUIStore.getState().setToast(saved ? `Exported ${name}` : "Export cancelled");
    }
  } catch (error) {
    useUIStore.getState().setToast(`Could not export: ${error instanceof Error ? error.message : String(error)}`);
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
  // Markdown prints its reader column through the `@media print` sheet.
  if (isMarkdownTab(tab)) {
    window.print();
    return;
  }
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
