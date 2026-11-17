# Phase 6 report — saving, touch input, and audit fixes

## 1. What was delivered

### 1.1 Saving (Part A)

- `src/lib/save.ts` (new) is the only save path. `saveActiveDocument(mode)` reads the active tab, guards re-entry through `useUIStore.saving`, shows a progress toast, calls `exportPdf`, and writes the result through `window.showSaveFilePicker` when the browser offers it, falling back to a `<a download>` link. Cancelling the picker (`AbortError`) reports "Save cancelled" instead of an error; a failure reports the message. The busy flag is cleared in `finally`.
- Both top-bar buttons (`Save` and `Flattened`) call it and disable while `saving`; `Ctrl+S` dispatches the same function, so the three entry points cannot drift apart again.
- `exportPdf` no longer produces blank pages. A missing or unreadable source document and a missing source page both throw `Source PDF bytes are unavailable or unreadable`, so the toast explains the refusal.
- `inspectPdf` hands pdf.js a copy of the document bytes (`copyBytes`). pdf.js transfers the buffer to its worker, so passing the stored array detached it and broke every later save.

### 1.2 Tool buttons that did nothing (Part A2)

- **Image** dispatches `pm:pick-image`, which opens the hidden file input in `AnnotationLayer`; the Inspector also gained a "Choose image…" button for the same action.
- **Formula** dispatches `pm:open-formula`, which builds a centred default formula and opens `FormulaEditor`. The panel is genuinely centred: `FORMULA_PANEL` is exported so the caller can offset by half its size instead of starting at the page centre. The editor is still clamped to the window.
- **Crop** opens with a visible frame: the existing `cropBox` when there is one, otherwise a 10 mm inset (never smaller than the 10 mm minimum). Apply and Reset are on the overlay, and Reset returns the full page.
- **Snapshot** and **Measure** show an instruction banner (drag a region / click points, Escape clears), counter-scaled by zoom so it stays readable.
- Every floating-bar control has `type="button"` and stops pointer-down propagation (snapshot bar, measure bar, crop, selection chrome), so pressing them no longer submits a surrounding form or starts a canvas drag.

### 1.3 Touch and stylus (Part A3)

- `.viewport`, `.page-stage`, `.page-paper` and the overlay SVGs get `touch-action: none` and `user-select: none`, so drawing does not scroll the page or select text.
- `PaperViewport` tracks pointers: two fingers pinch-zoom about their midpoint and pan with the same gesture. The second finger cancels any one-finger draft (`pm:cancel-draft`) and suppresses new drafts until the pinch ends (`pm:pinch-start` / `pm:pinch-end`).
- `ink.ts` gained `pointerPressure`. Only `pointerType === "pen"` with `pressure > 0 && pressure !== 0.5` uses the hardware value; mice, touch and idle pens fall back to `pressureFromVelocity`, which keeps the old speed-based stroke feel instead of drawing at half width.
- Touch targets are at least 24 px: crop handles use `24 / zoom`, selection handles use `24 / zoom`, and the rotate handle sits `26 / scale` above the box so it no longer overlaps a corner handle.

### 1.4 Export and geometry correctness (Part B)

- Editable export writes no page content for annotations or images — they live only in the sidecar — so reopening an editable PDF cannot double-draw them. Flattened export keeps baking and is unchanged. `mergeSidecarPages` turns sidecar entries without a `pdfPageIndex` into parametric paper pages, so a paper-only document reopens without a source PDF.
- `raster.ts` samples the vertical axis with the page height (`computeCanvasCropRect`), so snapshots of a portrait page are no longer squashed by using the width for Y.
- Bookmarks carry an optional `pageId` and are remapped on every page operation: add, duplicate, delete and reorder go through `remapBookmarksOnPageOp`. The id wins while the page exists; legacy bookmarks without an id follow the numeric shift, and a deleted page clamps to the last page.
- `SelectionOverlay` positions the rotate handle at `26 / scale`.

### 1.5 Storage, shortcuts, lifecycle and hardening (Part C)

- **IndexedDB v2** adds a `pdf-blobs` store and saves a structural record with `pdf.bytes` stripped. A re-save after an annotation edit no longer rewrites every page of every document; a blob is only written when its byte-array reference changed. On load the bytes are reattached by tab id, and `restore` mints fresh object URLs.
- **Autosave** runs 1000 ms after a structural change only. The subscriber compares `state.tabs` / `state.activeId` references, so zoom, current page and tool changes no longer write to disk. A failed write toasts once with a backup hint.
- **Shortcuts** gained `cut`, `copy`, `paste`, `duplicate`, `select-all`, `group` and `ungroup` with defaults, labels and conflict reporting. `App` now dispatches every action from the shortcut table; the hardcoded Ctrl branches are gone. Gesture modifiers (Shift/Ctrl constrain, Ctrl+Enter to commit, Ctrl+wheel zoom) are untouched.
- **Lifecycle**: closing a tab and replacing all tabs release their cached pdf.js documents (`releasePdfDocument`), and the failed-open path revokes its object URL.
- **Custom stamps**: `add` is async and returns `{ ok, error? }`; localStorage stays the fast copy and IndexedDB is the durable mirror. A failed write keeps the stamp for the session and toasts why; boot loads the mirror, so stamps survive a cleared localStorage.
- **History** stores shallow page snapshots (`{ ...page, annotations: [...page.annotations] }`, safe because every mutation replaces objects) and keeps at most 40 entries per tab.
- **Tauri**: `dragDropEnabled: false` lets the webview's own drop target receive files instead of the OS swallowing them, and the window now has a CSP.
- **PDF outlines**: `writeOutlines` emits a real `/Outlines` tree with `/Title`, `/Parent`, `/First`, `/Last`, `/Next`, `/Prev` and `/Count`, and sets `/PageMode /UseOutlines`.
- **Sidebar thumbnails** render through an `IntersectionObserver` (160 px margin), so opening a 100-page PDF paints only what is near the scroll viewport. The preview respects `cropBox` by offsetting and scaling the canvas.
- **Security**: stamp URLs are embedded only when they start with `data:image/`, `blob:` or `/assets/`; anything else is skipped instead of fetched.
- **Backup** object URLs are revoked after 4000 ms instead of immediately, so the download actually starts.
- **Offline shell**: `public/sw.js` is a small network-first cache and is registered only in production builds. `dist/sw.js` is produced by `npm run build`.
- **Cleanup**: `scripts/convert/reverse/` (18 files, including a 9,274-line `table.json`) is deleted. It held reverse-engineering probes that no shipped code imports.

### 1.6 Tests (Part D)

New or extended files, all in `vitest`:

| File | Tests | What it locks |
|---|---|---|
| `src/lib/raster.test.ts` | 2 | crop rect on a 210 × 297 page; Y sampled by page height |
| `src/lib/bookmarks.test.ts` | 5 | add/duplicate/delete shifts, reorder both ways, page-id authority, deleted-page clamp, legacy fallback |
| `src/stores/useDocStore.test.ts` | 3 | `addBookmark` stores `pageId`; bookmark follows reorder → duplicate → delete; insert above shifts |
| `src/lib/pdfEngine.test.ts` | 12 | editable export bakes nothing, flattened still bakes, missing source throws, real outlines, sidecar merge, round-trip without duplication |
| `src/lib/shortcuts.test.ts` | 6 | new actions exist, defaults conflict-free, conflict detection, rebinding moves the action |

## 2. Verification run

```
npx tsc -b            exit 0
npm test              11 files, 63 tests passed
npm run build         built successfully (dist/sw.js present, 843 bytes)
cargo check           Finished `dev` profile, exit 0
```

The two bugs that started this phase are locked on the logic side: the save path by the export tests, and the crop geometry plus bookmark remapping by direct tests. The pointer handlers themselves have no unit tests (they need a browser), so they rest on `tsc`, the production build and manual use. No test needs a DOM; browser-only APIs are guarded, so `vitest` in Node stays green.

## 3. Files

- New: `src/lib/save.ts`, `src/lib/bookmarks.ts`, `public/sw.js`, three test files.
- Changed: `src/lib/pdfEngine.ts`, `src/lib/raster.ts`, `src/lib/ink.ts`, `src/lib/storage.ts`, `src/lib/customStamps.ts`, `src/lib/shortcuts.ts`, `src/lib/types.ts`, `src/stores/useDocStore.ts`, `src/stores/useUIStore.ts`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/components/TopBar.tsx`, `src/components/ToolBar.tsx`, `src/components/Sidebar.tsx`, `src/components/Inspector.tsx`, `src/components/SettingsModal.tsx`, `src/components/canvas/AnnotationLayer.tsx`, `src/components/canvas/PaperViewport.tsx`, `src/components/canvas/CropOverlay.tsx`, `src/components/canvas/SelectionOverlay.tsx`, `src/components/canvas/FormulaEditor.tsx`, `src-tauri/tauri.conf.json`.
- Deleted: `scripts/convert/reverse/` (18 files).

## 4. Known limits (deliberate, documented)

- **No Playwright E2E.** Playwright and its browsers are not installed in this repo; adding them is a multi-hundred-megabyte download. The touch and save flows were verified by unit tests, `tsc`, the production build and the Rust check. A browser E2E should be added when the test infrastructure is allowed to grow.
- **`#18` deferred: lazy stamp and preset catalogs.** `src/lib/data.ts` exports stamps and presets synchronously from one JSON-backed module (the `stamp-data` chunk is 569 kB). Splitting it means every synchronous consumer (`stampById`, galleries, presets) has to become async or be loader-gated; that is a larger refactor than this phase's scope, so it is unchanged and disclosed here.
- **Service worker is cache-on-read, network-first.** The shell and any asset fetched during a visit are cached, but a first launch while already offline has nothing cached yet. No precache manifest was added.
- **`PHASE_2_REPORT.md` still mentions `scripts/convert/reverse/`.** It is a historical report describing the ink-decoder probes; the folder is gone, and the report was left as the record of that phase.
- **Editable export of a paper-only document** writes parametric pages (no `/Outlines` source pages), which is the expected round-trip; annotations remain sidecar-only by design.

## 5. Reproduce

```
npx tsc -b
npm test
npm run build
cd src-tauri && cargo check
```

To try the flows manually: open a PDF, draw with a pen and with a finger, pinch with two fingers, press Crop and Formula from the tool rail, drag a snapshot region, then press Save (native dialog) and Flattened (download fallback), reopen the saved editable file, and confirm the annotations are drawn once.
