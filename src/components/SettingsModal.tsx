import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, RotateCcw, Upload, X } from "lucide-react";
import { MEASURE_UNITS, type MeasureUnit } from "../lib/measure";
import { usePrefsStore, type SnapshotDpi } from "../lib/prefs";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  bindingFromEvent,
  detectConflicts,
  type ShortcutAction,
  useShortcutStore,
} from "../lib/shortcuts";
import { applyWorkspaceStores, parseWorkspaceBackup, storageEstimate, workspaceBackup } from "../lib/storage";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";
import { SectionTitle, Segmented, ToggleRow } from "./ui/controls";

const UNITS = MEASURE_UNITS.map((unit) => ({ value: unit.value as MeasureUnit, label: unit.label }));
const DPI: { value: string; label: string }[] = [
  { value: "72", label: "72 DPI" },
  { value: "150", label: "150 DPI" },
  { value: "300", label: "300 DPI" },
];

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SettingsModal() {
  const open = useUIStore((state) => state.settingsOpen);
  const setOpen = useUIStore((state) => state.setSettingsOpen);
  const setToast = useUIStore((state) => state.setToast);
  const map = useShortcutStore((state) => state.map);
  const bind = useShortcutStore((state) => state.bind);
  const reset = useShortcutStore((state) => state.reset);
  const scratchOut = usePrefsStore((state) => state.scratchOut);
  const measureUnit = usePrefsStore((state) => state.measureUnit);
  const snapshotDpi = usePrefsStore((state) => state.snapshotDpi);
  const setPrefs = usePrefsStore((state) => state.set);
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const conflicts = useMemo(() => detectConflicts(map), [map]);

  useEffect(() => {
    if (!open) {
      setRecording(null);
      return;
    }
    let alive = true;
    void storageEstimate().then((value) => {
      if (alive) setEstimate(value);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const exportBackup = () => {
    const state = useDocStore.getState();
    const blob = workspaceBackup(state.tabs, state.activeId);
    const anchor = document.createElement("a");
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = `pdf-master-${new Date().toISOString().slice(0, 10)}.pmbackup.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoking immediately can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    setToast("Workspace backup downloaded");
  };

  const importBackup = async (file: File) => {
    const parsed = parseWorkspaceBackup(await file.text());
    if (!parsed) {
      setToast("That file is not a PDF Master workspace backup");
      return;
    }
    useDocStore.getState().restore(parsed.tabs, parsed.activeId);
    applyWorkspaceStores(parsed.stores);
    const extras = parsed.stores ? " with stamps, scales, shortcuts and preferences" : "";
    setToast(`Restored ${parsed.tabs.length} tab${parsed.tabs.length === 1 ? "" : "s"}${extras}`);
  };

  const quota = estimate && estimate.quota > 0 ? Math.min(100, (estimate.usage / estimate.quota) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[8vh] backdrop-blur-[3px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="glass-strong anim-in flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <span className="text-[13.5px] font-semibold">Settings</span>
          <span className="text-[10.5px] text-muted">Shortcuts, preferences and storage</span>
          <button type="button" className="icon-btn ml-auto h-7 w-7" aria-label="Close settings" onClick={() => setOpen(false)}>
            <X size={14} />
          </button>
        </div>

        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
          <section className="flex flex-col gap-2">
            <SectionTitle
              aside={
                <button type="button" className="chip h-6 px-2" onClick={() => reset()}>
                  <RotateCcw size={11} /> Reset all
                </button>
              }
            >
              Keyboard shortcuts
            </SectionTitle>
            {conflicts.conflicting.size > 0 && (
              <p className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[10.5px]" style={{ background: "var(--track)", color: "var(--warning, #b26a00)" }}>
                <AlertTriangle size={13} className="mt-px shrink-0" /> A binding is claimed twice; the earlier action wins and the other is ignored.
              </p>
            )}
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {SHORTCUT_ACTIONS.map((action) => {
                const conflicting = conflicts.conflicting.has(action);
                return (
                  <div
                    key={action}
                    className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5"
                    style={{ borderColor: conflicting ? "var(--warning, #b26a00)" : "var(--border)" }}
                  >
                    <span className="min-w-0 truncate text-[11.5px]">{SHORTCUT_LABELS[action]}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <input
                        readOnly
                        value={recording === action ? "Press keys…" : map[action]}
                        aria-label={`${SHORTCUT_LABELS[action]} shortcut`}
                        onFocus={() => setRecording(action)}
                        onBlur={() => setRecording((current) => (current === action ? null : current))}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Escape") {
                            setRecording(null);
                            event.currentTarget.blur();
                            return;
                          }
                          event.preventDefault();
                          const binding = bindingFromEvent(event);
                          if (!binding) return;
                          bind(action, binding);
                          setRecording(null);
                          event.currentTarget.blur();
                        }}
                        className="w-[92px] cursor-pointer rounded-md border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-center text-[10.5px] tabular-nums outline-none"
                      />
                      <button
                        type="button"
                        className="icon-btn h-5 w-5"
                        aria-label={`Reset ${SHORTCUT_LABELS[action]}`}
                        title={`Reset to ${DEFAULT_SHORTCUTS[action]}`}
                        onClick={() => reset(action)}
                      >
                        <RotateCcw size={10} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10.5px] text-muted">
              Click a binding and press the new keys. Clicking away keeps the current binding.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <SectionTitle>Preferences</SectionTitle>
            <ToggleRow
              label="Scratch out to erase"
              hint="A rapid scribble erases the annotations under it."
              checked={scratchOut}
              onChange={(checked) => setPrefs({ scratchOut: checked })}
            />
            <div className="field">
              <span className="field-label">Default measure unit</span>
              <Segmented value={measureUnit} options={UNITS} onChange={(value) => setPrefs({ measureUnit: value })} />
            </div>
            <div className="field">
              <span className="field-label">Snapshot resolution</span>
              <Segmented
                value={String(snapshotDpi)}
                options={DPI}
                onChange={(value) => setPrefs({ snapshotDpi: Number(value) as SnapshotDpi })}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionTitle
              aside={
                <span className="flex items-center gap-1">
                  <button type="button" className="chip h-6 px-2" onClick={exportBackup}>
                    <Download size={11} /> Export
                  </button>
                  <button type="button" className="chip h-6 px-2" onClick={() => importRef.current?.click()}>
                    <Upload size={11} /> Import
                  </button>
                </span>
              }
            >
              Workspace storage
            </SectionTitle>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import workspace backup"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importBackup(file);
              }}
            />
            {estimate ? (
              <>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, quota)}%`, background: "var(--accent)" }} />
                </div>
                <p className="text-[10.5px] text-muted">
                  Autosave uses {megabytes(estimate.usage)} of {megabytes(estimate.quota)} ({quota.toFixed(1)} %). Backups carry every
                  tab, its pages and annotations, plus custom stamps, calibrated scales, shortcuts, preferences and theme.
                </p>
              </>
            ) : (
              <p className="text-[10.5px] text-muted">Storage quota is not reported by this browser.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
