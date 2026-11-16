import { X } from "lucide-react";
import { stamps, userStamps } from "../lib/data";
import { useUIStore } from "../stores/useUIStore";
import { StampGallery } from "./StampGallery";

export function StampLibrary() {
  const open = useUIStore((state) => state.libraryOpen);
  const setLibraryOpen = useUIStore((state) => state.setLibraryOpen);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[3px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setLibraryOpen(false);
      }}
    >
      <div
        className="glass-strong anim-in flex max-h-[88vh] w-full max-w-[980px] flex-col overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Stamp library"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Stamp library</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {stamps.length} factory stamps · {userStamps.length} stamps from your PDF Annotator Tools folder
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close stamp library" onClick={() => setLibraryOpen(false)}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
          <StampGallery variant="library" />
        </div>
      </div>
    </div>
  );
}
