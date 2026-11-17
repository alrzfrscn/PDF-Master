import { Check, Copy, Download, Stamp, X } from "lucide-react";
import type { BBox } from "../../lib/annotationTypes";
import { PX_PER_MM } from "../../lib/paper";

interface Props {
  region: BBox;
  imageUrl: string | null;
  zoom: number;
  status: string | null;
  onCopy: () => void;
  onDownload: () => void;
  onSaveStamp: () => void;
  onClose: () => void;
}

/** Floating action bar for a snapshot region, in page millimetres. */
export function SnapshotBar({ region, imageUrl, zoom, status, onCopy, onDownload, onSaveStamp, onClose }: Props) {
  const left = (region.x + region.width) * PX_PER_MM;
  const top = (region.y + region.height) * PX_PER_MM + 6;
  return (
    <div
      className="absolute z-40"
      style={{ left, top, transform: `scale(${1 / zoom})`, transformOrigin: "top left" }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="glass-strong flex items-center gap-1.5 rounded-xl p-1.5 shadow-xl">
        {imageUrl && (
          <img src={imageUrl} alt="Snapshot preview" className="checker h-8 w-8 rounded-md object-contain" />
        )}
        <button type="button" className="chip h-7 px-2" onClick={onCopy} aria-label="Copy snapshot PNG">
          <Copy size={12} /> Copy
        </button>
        <button type="button" className="chip h-7 px-2" onClick={onDownload} aria-label="Download snapshot PNG">
          <Download size={12} /> PNG
        </button>
        <button type="button" className="chip h-7 px-2" onClick={onSaveStamp} aria-label="Save snapshot as stamp">
          <Stamp size={12} /> Save stamp
        </button>
        {status && (
          <span className="flex items-center gap-1 px-1 text-[10px] text-muted">
            <Check size={10} /> {status}
          </span>
        )}
        <button type="button" className="icon-btn h-7 w-7" aria-label="Close snapshot bar" onClick={onClose}>
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
