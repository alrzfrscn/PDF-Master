# Phase 8 — Popover Polish, Shapes Studio and Audit Fixes

Date: 2026-11-18
Branch: `main` (all changes uncommitted)

## Summary

Phase 8 does three things. Part A makes the right-hand popovers quieter: viewer-only tools
(`Hand`, `Select`, `Lasso`, `Image`, `Snapshot`, `Crop`, `Formula`) no longer open a
property panel, filler blocks are gone, the shape tools share one Shapes studio, and the
crop and snapshot controls moved onto the canvas where they belong. Part B closes all 15
findings from the Ponytail audit: export, backup, erase/undo, duplication, resize history,
crop state, template conversion, save handles, autosave flushing, closed-tab undo, PDF
outline counts, PDF inspection batching, background re-rendering and dead exports. Part C
is the verification gate below.

All existing behaviour is preserved. `npm test` now reports 14 files / 79 tests passing
(72 at the end of Phase 7), `npx tsc -b` is clean, the production build succeeds, and
`cargo check` finishes with no errors.

## Part A — Popover and Canvas Polish

### Popover policy
- New `NO_POPOVER_TOOLS` in `src/lib/tools.ts`: `hand`, `select`, `lasso`, `image`,
  `snapshot`, `crop`, `formula`. `ToolBar` and `Inspector` both read it, so the rail and
  the panel cannot drift apart.
- `Inspector` returns `null` for those tools when nothing is selected. Selecting an
  annotation still opens the selection inspector; `Esc` and the close button behave as
  before.
- Removed the `PAGE` and `MIGRATION` filler blocks, the `TOOL PROPERTIES` block and the
  `Separate | Synchronous` toggle from the popover. The toggle now lives in
  `SettingsModal` → Preferences.
- Verbose panel subtitles are gone. `Text` is a single compact studio; `Eraser` is a
  2–20 mm size slider with Whole / Split mode and Clear All; `Measure` keeps calibration
  behind a `<details>` fold.
- Snapshot DPI (72 / 150 / 300) moved into `SnapshotBar`. The Measure and Snapshot
  instruction pill is pinned at viewport `top: 16px`; the error strip sits below it at
  `top: 56px` so the two do not overlap.

### Shapes studio
- The Shapes tool opens one studio with a six-shape grid: rectangle, ellipse, line, arrow,
  polygon and dimension. `useToolStore.lastShapeTool` remembers the last choice, so
  reopening Shapes restores it (`rectangle` by default) and the Text tool is never
  highlighted while Shapes is active.
- Live SVG preview shows stroke colour, dash style, fill/transparency, line width,
  opacity and arrowheads/tails for the selected shape.
- Text studio: font family, size, bold / italic / underline / strike-out, alignment,
  colour, plus collapsible box frame and fill sections.
- Dimension tools gained a unit selector; shape creation reads the same `ToolProps`, so
  what the preview shows is what gets drawn.

### Crop bar
- `CropOverlay` now carries the whole flow: live dimensions, `Free` / `A4` / `16:9` / `1:1`
  ratio chips, Reset, Cancel (also `Esc`, captured before the global handler) and Apply.
- Ratio boxes are fitted and centred inside the page; the bar is clamped inside the
  viewport and the page, so it cannot spill off-screen at any zoom.
- `PaperViewport` keys the overlay by tab, page and crop-box values, so switching pages
  or undoing a crop cannot keep the previous page's frame.
- The bar sits above the crop box and is clamped to `min-top: 16px` and to the page width,
  so it stays inside the viewport instead of slipping under the top bar.

### Chrome and layout
- `FavoriteToolsBar` sits at `left: 316px` while the sidebar drawer is open and `56px`
  when it is collapsed.
- `Sidebar` is a compact drawer: `max-height: calc(100vh - 120px)`, `height: auto`.
  Helper paragraphs, paper-style statistics and stamp-count filler are removed.

## Part B — Audit Fixes

| # | Fix | Where |
|---|---|---|
| 1 | Combine exports every checked open tab through `exportPdf(exportInputFromTab(tab, "flattened"))` instead of only the first | `TopBar.tsx` |
| 2 | Backup writes PDF bytes as `bytesBase64`; the parser also accepts legacy numeric-key objects | `storage.ts` |
| 3 | Closing a tab deletes its IndexedDB blob but keeps blobs of tabs that are still open | `storage.ts`, `useDocStore.ts` |
| 4 | An eraser gesture pushes one history entry, only when something was actually erased | `useAnnotationStore.ts`, `AnnotationLayer.tsx` |
| 5 | Duplicating a page remaps annotation `groupId`s so copies are not grouped with the original | `useDocStore.ts` |
| 6 | Resize and rotate push history on the first real movement, not on pointer-down | `AnnotationLayer.tsx` |
| 7 | Crop overlay state is keyed by tab, page and crop box, so page switches and undo cannot reuse a stale box | `PaperViewport.tsx` |
| 8 | `applyTemplate` keeps the document title and scales annotations to the new paper size | `useDocStore.ts` |
| 9 | Save reuses the File System Access handle per tab; Save As still forces the picker | `save.ts` |
| 10 | Autosave flushes pending state on `visibilitychange` (hidden) and `pagehide` | `App.tsx` |
| 11 | Closing a tab offers Undo in the toast for 15 s; the blob is disposed after that window | `useDocStore.ts`, `TopBar.tsx`, `useUIStore.ts` |
| 12 | Outline `/Count` is written per parent from the descendant map instead of a global total | `pdfEngine.ts` |
| 13 | `inspectPdf` reads pages in batches of 16 instead of one worker round-trip per page | `pdfEngine.ts` |
| 14 | `PdfBackground` depends on a quantised render quality, so small zoom changes stop re-rendering the canvas | `PdfBackground.tsx` |
| 15 | Dead exports removed (`manifest`, `presetById`, `presetCounts`, `userStampsOfGroup`, `userStampGroups`, `SIDEBAR_TABS`, `formatMm`, `MigrationManifest`) and README counts refreshed | `data.ts`, `tools.ts`, `types.ts`, `README.md` |

Supporting changes: `ToolProps` gained `strikeOut`, `textAlign` and `dimensionUnit` with
matching `BASE_PROPS` defaults; text frames use `toolProps.thicknessMm`; `useUIStore`
gained `eraserSizeMm` (default 5.2 mm) and `toastAction`, and `setToast` accepts an
optional action.

## Files Changed

```
 M README.md
 M src/App.tsx
 M src/components/FavoriteToolsBar.tsx
 M src/components/Inspector.tsx
 M src/components/PropertyControls.tsx
 M src/components/SettingsModal.tsx
 M src/components/Sidebar.tsx
 M src/components/ToolBar.tsx
 M src/components/TopBar.tsx
 M src/components/canvas/AnnotationLayer.tsx
 M src/components/canvas/CropOverlay.tsx
 M src/components/canvas/PaperViewport.tsx
 M src/components/canvas/PdfBackground.tsx
 M src/components/canvas/SnapshotBar.tsx
 M src/lib/data.ts
 M src/lib/pdfEngine.test.ts
 M src/lib/pdfEngine.ts
 M src/lib/presets.ts
 M src/lib/save.ts
 M src/lib/storage.test.ts
 M src/lib/storage.ts
 M src/lib/sync.test.ts
 M src/lib/tools.ts
 M src/lib/types.ts
 M src/stores/annotationStore.test.ts
 M src/stores/useAnnotationStore.ts
 M src/stores/useDocStore.ts
 M src/stores/useToolStore.ts
 M src/stores/useUIStore.ts
?? src/lib/save.test.ts
```

Diff: 31 files changed, +1164 / −639 — 29 modified sources, the new
`src/lib/save.test.ts`, and this report.

## Tests Added

- `src/lib/save.test.ts` — stubs `window.showSaveFilePicker`, saves twice through
  `saveActiveDocument`, expects one picker call, two writes.
- `src/lib/pdfEngine.test.ts` — `exportInputFromTab` keeps annotations, crop box, landscape
  flag and PDF page index; `combinePdfs` merges annotated flattened exports and drops the
  sidecar.
- `src/lib/storage.test.ts` — PDF bytes round-trip as base64; legacy numeric-key bytes still
  parse.
- `src/stores/annotationStore.test.ts` — one undo step for an eraser gesture; duplicated
  pages get fresh annotation group IDs.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc -b` | 0 errors |
| Tests | `npm test` | 14 files, 79 tests passed (baseline 72) |
| Build | `npm run build` | success, 878 ms |
| Rust | `cargo check --manifest-path src-tauri\Cargo.toml` | `Finished dev profile`, 0 errors |

## Risks / Known Limits

- All changes are uncommitted; nothing has been pushed.
- UI work is verified by type-check and build only; the popover and crop-bar layout has not
  been re-checked in a real browser at narrow window sizes.
- `saveHandles` is an in-memory map: after a reload the first Save reopens the picker.
  That is deliberate, since File System Access handles cannot be serialised here.
- Closed-tab Undo lasts 15 s; after that the blob and rendered document are released.
- The favorites offset (`316px`) and rail (`56px`) are fixed widths that must change with
  the rail geometry.
- Crop handles remain approximate on rotated (90°/270°) views, as noted in the README.
