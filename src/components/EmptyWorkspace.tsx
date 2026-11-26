import { useState, type ReactNode } from "react";
import { Combine, FilePlus, FileText, FolderOpen, PenLine } from "lucide-react";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";
import { CombineModal } from "./CombineModal";

const PDF_INPUT_ID = "pm-pdf-input";

function ActionCard({
  icon,
  title,
  body,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="glass group flex w-full flex-col items-start gap-3 rounded-2xl p-4 text-left transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)]"
      onClick={onClick}
    >
      <span
        className="grid h-10 w-10 place-items-center rounded-xl transition-colors duration-200"
        style={{ background: "var(--track)", color: "var(--accent)" }}
      >
        {icon}
      </span>
      <span className="flex w-full items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold tracking-[-0.01em]">{title}</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{body}</span>
        </span>
        <span className="shrink-0 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[9.5px] font-medium text-muted">
          {hint}
        </span>
      </span>
    </button>
  );
}

/**
 * The calm landing surface shown when every tab is closed. It carries the same
 * three entry points as the Files menu, plus a drop target for a PDF.
 */
export function EmptyWorkspace() {
  const setNewDocOpen = useUIStore((state) => state.setNewDocOpen);
  const [combineOpen, setCombineOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const openFiles = () => document.getElementById(PDF_INPUT_ID)?.click();

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-y-auto p-6"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const files = [...event.dataTransfer.files];
        void (async () => {
          for (const file of files) {
            if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
              await useDocStore.getState().openPdfFile(file);
            } else if (file.type === "text/markdown" || /\.(md|markdown)$/i.test(file.name)) {
              await useDocStore.getState().openMarkdownFile(file);
            }
          }
        })();
      }}
    >
      <div className="anim-in flex w-full max-w-[680px] flex-col items-center pb-8">
        <div
          className="relative grid h-16 w-16 place-items-center rounded-[20px]"
          style={{
            background: "linear-gradient(160deg, color-mix(in srgb, var(--accent) 88%, white), var(--accent))",
            color: "var(--accent-ink)",
            boxShadow: "var(--shadow)",
          }}
        >
          <FileText size={28} strokeWidth={1.6} />
          <span
            className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-xl"
            style={{ background: "var(--paper)", color: "var(--accent)", boxShadow: "var(--shadow-soft)" }}
          >
            <PenLine size={14} strokeWidth={1.9} />
          </span>
        </div>

        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">PDF Master</h1>
        <p className="mt-1.5 max-w-[380px] text-center text-[12px] leading-relaxed text-muted">
          Annotate, measure and present PDF and paper documents. Open a file, start a fresh sheet, or bring several
          documents together.
        </p>

        <div className="mt-7 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-3">
          <ActionCard
            icon={<FolderOpen size={18} strokeWidth={1.75} />}
            title="Open Document..."
            body="Open one or more PDF or Markdown files from your computer."
            hint="Ctrl+O"
            onClick={openFiles}
          />
          <ActionCard
            icon={<FilePlus size={18} strokeWidth={1.75} />}
            title="Create Document..."
            body="Blank, squared, ruled or millimeter paper."
            hint="Paper"
            onClick={() => setNewDocOpen(true)}
          />
          <ActionCard
            icon={<Combine size={18} strokeWidth={1.75} />}
            title="Combine Documents..."
            body="Merge PDFs and paper pages into one file."
            hint="Merge"
            onClick={() => setCombineOpen(true)}
          />
        </div>

        <p className="mt-5 text-[10.5px] text-muted">Drop a PDF or Markdown file anywhere here to open it.</p>
      </div>

      {dropActive && (
        <div className="pointer-events-none absolute inset-4 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]">
          <div className="glass-strong flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-medium">
            <FileText size={16} /> Drop a PDF or Markdown file to open it
          </div>
        </div>
      )}

      <CombineModal open={combineOpen} onClose={() => setCombineOpen(false)} />
    </div>
  );
}
