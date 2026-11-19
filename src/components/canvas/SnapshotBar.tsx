import { useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, Download, Stamp, X } from "lucide-react";
import type { BBox } from "../../lib/annotationTypes";
import { clamp, PX_PER_MM } from "../../lib/paper";
import { usePrefsStore, type SnapshotDpi } from "../../lib/prefs";
import { Segmented } from "../ui/controls";

const DPI: { value: string; label: string }[] = [
  { value: "72", label: "72" },
  { value: "150", label: "150" },
  { value: "300", label: "300" },
];

const EDGE = 12;

interface Props {
  region: BBox;
  imageUrl: string | null;
  zoom: number;
  /** Page size in millimetres; keeps the bar inside the sheet at any edge. */
  widthMm: number;
  heightMm: number;
  status: string | null;
  onCopy: () => void;
  onDownload: () => void;
  onSaveStamp: () => void;
  onClose: () => void;
}

/** Floating action bar for a snapshot region, in page millimetres. */
export function SnapshotBar({ region, imageUrl, zoom, widthMm, heightMm, status, onCopy, onDownload, onSaveStamp, onClose }: Props) {
  const snapshotDpi = usePrefsStore((state) => state.snapshotDpi);
  const setPrefs = usePrefsStore((state) => state.set);
  const barRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState({ width: 280, height: 36 });

  useLayoutEffect(() => {
    const element = barRef.current;
    if (!element) return;
    const measure = () => setBar({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [imageUrl, status]);

  const pageWidth = widthMm * PX_PER_MM;
  const pageHeight = heightMm * PX_PER_MM;
  // The bar is scaled by 1/zoom, so its page-local footprint grows when zoomed out.
  const barWidth = bar.width / Math.max(0.1, zoom);
  const barHeight = bar.height / Math.max(0.1, zoom);
  const preferredLeft = (region.x + region.width) * PX_PER_MM;
  const preferredTop = (region.y + region.height) * PX_PER_MM + 6;
  const left = clamp(preferredLeft, EDGE, Math.max(EDGE, pageWidth - barWidth - EDGE));
  const top = clamp(preferredTop, EDGE, Math.max(EDGE, pageHeight - barHeight - EDGE));

  return (
    <div
      ref={barRef}
      className="snapshot-bar absolute z-[95] inline-flex w-max"
      style={{ left, top, transform: `scale(${1 / zoom})`, transformOrigin: "top left" }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="glass-strong flex items-center gap-1.5 rounded-xl p-1.5 shadow-xl">
        {imageUrl && <img src={imageUrl} alt="Snapshot preview" className="checker h-8 w-8 shrink-0 rounded-md object-contain" />}
        <span title="Snapshot resolution">
          <Segmented
            value={String(snapshotDpi)}
            options={DPI}
            onChange={(value) => setPrefs({ snapshotDpi: Number(value) as SnapshotDpi })}
          />
        </span>
        <button type="button" className="chip h-7 shrink-0 px-2" onClick={onCopy} aria-label="Copy snapshot PNG">
          <Copy size={12} /> Copy
        </button>
        <button type="button" className="chip h-7 shrink-0 px-2" onClick={onDownload} aria-label="Download snapshot PNG">
          <Download size={12} /> PNG
        </button>
        <button type="button" className="chip h-7 shrink-0 px-2" onClick={onSaveStamp} aria-label="Save snapshot as stamp">
          <Stamp size={12} /> Save stamp
        </button>
        {status && (
          <span className="flex shrink-0 items-center gap-1 px-1 text-[10px] text-muted">
            <Check size={10} /> {status}
          </span>
        )}
        <button type="button" className="icon-btn h-7 w-7 shrink-0" aria-label="Close snapshot bar" onClick={onClose}>
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
