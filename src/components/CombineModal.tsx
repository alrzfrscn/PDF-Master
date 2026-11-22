import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Combine, FilePlus, Trash2, X } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { combineSummary, combineOrder, moveItem, type CombinePdfFile, type CombineTabItem } from "../lib/combine";
import { combinePdfs, exportInputFromTab, exportPdf } from "../lib/pdfEngine";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

function fileId(): string {
  return `pdf-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)}`;
}

const iconButton = "icon-btn h-5 w-5 shrink-0";

export function CombineModal({ open, onClose }: Props) {
  const tabs = useDocStore((state) => state.tabs);
  const setToast = useUIStore((state) => state.setToast);
  const [orderedTabs, setOrderedTabs] = useState<CombineTabItem[]>([]);
  const [files, setFiles] = useState<CombinePdfFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setOrderedTabs(tabs.map((tab) => ({ id: tab.id, title: tab.title, pageCount: tab.pages.length, checked: true })));
    setFiles([]);
    setError(null);
    setBusy(false);
    setDropActive(false);
    // The opening tab order is the starting order; later tab changes are ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const summary = combineSummary(orderedTabs, files);

  const addFiles = async (incoming: FileList | File[] | null) => {
    const selected = Array.from(incoming ?? []).filter(
      (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name),
    );
    if (selected.length === 0) {
      setError("Choose one or more PDF files.");
      return;
    }
    const failed: string[] = [];
    for (const file of selected) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
        setFiles((list) => [...list, { id: fileId(), name: file.name, bytes, pageCount: document.getPageCount() }]);
      } catch {
        failed.push(file.name);
      }
    }
    setError(failed.length > 0 ? `Could not read ${failed.join(", ")}` : null);
  };

  const toggleTab = (index: number) => {
    setOrderedTabs((list) => list.map((tab, position) => (position === index ? { ...tab, checked: !tab.checked } : tab)));
  };

  const combine = async () => {
    const order = combineOrder(orderedTabs, files);
    if (order.tabIds.length + order.fileIds.length < 2) {
      setError("Choose at least two documents to combine.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const parts: Uint8Array[] = [];
      const liveTabs = useDocStore.getState().tabs;
      // Exported in the exact user-ordered OPEN TABS sequence.
      for (const id of order.tabIds) {
        const tab = liveTabs.find((item) => item.id === id);
        if (tab) parts.push(await exportPdf(exportInputFromTab(tab, "flattened")));
      }
      // Then every file in the exact user-ordered PDF FILES sequence.
      for (const id of order.fileIds) {
        const file = files.find((item) => item.id === id);
        if (file) parts.push(file.bytes);
      }
      if (parts.length < 2) throw new Error("Choose at least two documents to combine.");
      const bytes = await combinePdfs(parts);
      await useDocStore.getState().openPdfBytes(bytes, `Combined ${parts.length} documents`);
      setToast(`Combined ${parts.length} documents`);
      onClose();
    } catch (caught) {
      setError(`Could not combine: ${caught instanceof Error ? caught.message : String(caught)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[3px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="menu-surface anim-in flex w-[92vw] max-w-[780px] flex-col overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Combine documents"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Combine size={16} />
          <span className="flex-1 text-[13px] font-semibold">Combine documents</span>
          <button type="button" className="icon-btn h-7 w-7" aria-label="Close combine dialog" disabled={busy} onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="grid max-h-[62vh] grid-cols-2 gap-4 overflow-y-auto px-4 py-4">
          <section className="flex min-w-0 flex-col gap-2" aria-label="Open tabs">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Open tabs</span>
            {orderedTabs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-[11px] text-muted">
                No tabs are open. Add PDF files on the right.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {orderedTabs.map((tab, index) => (
                  <div
                    key={tab.id}
                    className="flex items-center gap-1 rounded-lg px-1 py-1 text-[11.5px] transition-colors hover:bg-[var(--hover)]"
                  >
                    <button
                      type="button"
                      className={iconButton}
                      aria-label={`Move ${tab.title} up`}
                      title="Move up"
                      disabled={index === 0}
                      onClick={() => setOrderedTabs((list) => moveItem(list, index, index - 1))}
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      aria-label={`Move ${tab.title} down`}
                      title="Move down"
                      disabled={index === orderedTabs.length - 1}
                      onClick={() => setOrderedTabs((list) => moveItem(list, index, index + 1))}
                    >
                      <ArrowDown size={11} />
                    </button>
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                        checked={tab.checked}
                        onChange={() => toggleTab(index)}
                      />
                      <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                    </label>
                    <span className="shrink-0 text-[10px] text-muted">
                      {tab.pageCount} {tab.pageCount === 1 ? "page" : "pages"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            className={`flex min-w-0 flex-col gap-2 rounded-xl transition-colors ${
              dropActive ? "bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]" : ""
            }`}
            aria-label="PDF files"
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropActive(false);
              void addFiles(event.dataTransfer.files);
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">PDF files</span>
              <button
                type="button"
                className="chip h-7"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => inputRef.current?.click()}
              >
                <FilePlus size={12} /> Choose files
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,.pdf"
              className="hidden"
              aria-label="Choose PDF files to combine"
              onChange={(event) => {
                void addFiles(event.target.files);
                // Let the same file be chosen again after a failed read or removal.
                event.target.value = "";
              }}
            />
            {files.length === 0 ? (
              <div
                className={`grid min-h-[120px] place-items-center rounded-xl border border-dashed px-3 py-4 text-center text-[11px] text-muted ${
                  dropActive ? "border-[var(--accent)]" : "border-[var(--border)]"
                }`}
              >
                Drop PDF files here
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {files.map((file, index) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-1 rounded-lg px-1 py-1 text-[11.5px] transition-colors hover:bg-[var(--hover)]"
                  >
                    <button
                      type="button"
                      className={iconButton}
                      aria-label={`Move ${file.name} up`}
                      title="Move up"
                      disabled={index === 0}
                      onClick={() => setFiles((list) => moveItem(list, index, index - 1))}
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      aria-label={`Move ${file.name} down`}
                      title="Move down"
                      disabled={index === files.length - 1}
                      onClick={() => setFiles((list) => moveItem(list, index, index + 1))}
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      type="button"
                      className={`${iconButton} hover:text-[var(--danger)]`}
                      aria-label={`Remove ${file.name}`}
                      title="Remove"
                      onClick={() => setFiles((list) => list.filter((item) => item.id !== file.id))}
                    >
                      <Trash2 size={11} />
                    </button>
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-[10px] text-muted">
                      {file.pageCount} {file.pageCount === 1 ? "page" : "pages"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {error && (
          <div className="px-4 pb-2 text-[11px]" style={{ color: "var(--danger)" }} role="alert">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
          <span className="flex-1 text-[10.5px] text-muted">
            {summary.items} {summary.items === 1 ? "item" : "items"} · {summary.pages} {summary.pages === 1 ? "page" : "pages"}
          </span>
          <button type="button" className="chip h-8" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="chip h-8"
            aria-pressed="true"
            disabled={busy || summary.items < 2}
            onClick={() => void combine()}
          >
            <Combine size={13} /> {busy ? "Combining..." : "Combine"}
          </button>
        </div>
      </div>
    </div>
  );
}
