# Phase 18 Report

Date: 2026-11-25
Branch: `main`
Working tree: uncommitted changes for Phase 18

## Summary

All 20 audit findings are fixed: 6 must-fix, 10 should-fix and 4 nice-to-have. TypeScript, the full vitest suite, the production build and the Tauri Rust check pass with zero errors and zero build warnings.

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc -b` | 0 errors |
| Tests | `npm test` | 21 files, 143 tests passed |
| Production build | `npm run build` | 2339 modules, built in 1.58 s, no warnings |
| Rust | `cargo check --manifest-path src-tauri/Cargo.toml` | finished, exit 0 |

## Must-fix

### 1. Save handles were shared across save modes

Files: `src/lib/save.ts`, `src/lib/save.test.ts`, `src/stores/useDocStore.ts`

- File handles are keyed by `${tab.id}:${mode}`, so an editable save and a flattened save remember separate target files instead of overwriting one another.
- Added `clearSaveHandle(tabId)`, called from `closeTab`, `restore` and `disposeTab`, so a closed tab can never write into the old document.
- Test: `keeps a separate target file for each save mode` saves each mode twice and asserts the picker opens exactly twice.

### 2. Landscape pages exported portrait

Files: `src/lib/pdfEngine.ts`, `src/lib/pdfEngine.test.ts`

- `pageSizeMm` now returns 297×210 mm for landscape pages (841.89×595.28 pt) instead of always using the portrait height.
- Test: `exports a landscape page with a landscape MediaBox` reads the exported page's real MediaBox and asserts width > height.

### 3. Offscreen PDF pages kept canvases and re-rendered constantly

Files: `src/components/canvas/PaperViewport.tsx`, `src/components/canvas/PdfBackground.tsx`, `src/components/canvas/AnnotationLayer.tsx`

- `PageView` is memoised and receives primitive props (`tabId`, `pageIndex`, `pageCount`, `hasPdf`) instead of the whole tab object.
- `PdfBackground` is memoised, gated by `visible`, and releases its canvas backing buffer when unmounted or hidden.
- The IntersectionObserver uses `rootMargin: "1200px 0px"` and toggles visibility in both directions, so pages far offscreen stop painting and resume on return.

### 4. Non-WinAnsi text aborted the whole export

Files: `src/lib/pdfEngine.ts`, `src/lib/raster.ts`, `src/lib/pdfEngine.test.ts`

- `isWinAnsiText` detects Persian/Arabic, CJK, Cyrillic and emoji; those annotations render through the canvas raster fallback instead of throwing in `drawText`.
- Each annotation is wrapped in its own try/catch, so one bad annotation can no longer abort save or print.
- Test: `exports non-WinAnsi text without aborting the save` round-trips `"بیوشیمی کلیه"`, `"中文"` and `"Привет"` through the editable sidecar and completes a flattened export in the canvas-less test runtime.

### 5. Custom stamps could resurrect or lose updates

Files: `src/lib/customStamps.ts`, `src/lib/customStamps.test.ts`, `src/App.tsx`

- `localStorage` and the IndexedDB mirror now store `{ updatedAt, stamps }` instead of a bare array.
- `restoreIfNewer` only accepts a mirror with a newer timestamp, so a deletion cannot be undone by an older mirror and two windows converge on the latest library.
- Test: `keeps a removed stamp removed when an older mirror is replayed` also checks that a genuinely newer mirror still wins.

### 6. Autosave failures were silent

Files: `src/stores/useUIStore.ts`, `src/App.tsx`

- `autosaveError` lives in `useUIStore` and is cleared only after a successful save.
- A sticky banner offers **Export Backup** and **Retry**, so the user can rescue work instead of losing it quietly.

## Should-fix

### 7. Boot `--print` raced the workspace load

File: `src/App.tsx`

- The boot flow now awaits `loadWorkspace()` and `openStartupPdf()` before calling `printActiveDocument()`, so the print dialog sees the real document rather than the empty initial tab.

### 8. `restore()` left stale history, selection and save target

Files: `src/stores/useDocStore.ts`, `src/stores/useAnnotationStore.ts`, `src/stores/useDocStore.test.ts`

- `restore()` clears per-tab history, `lastClosedTab`, `lastError`, the selection (through a hook registered by the annotation store to avoid a module cycle) and all save handles.
- Test: `starts a clean history instead of keeping undo entries for dead pages` asserts history and `lastClosedTab` are empty after restore.

### 9. Stamp data URLs were duplicated into every annotation

Files: `src/lib/pdfEngine.ts`, `src/components/canvas/AnnotationLayer.tsx`, `src/lib/annotationTypes.ts`

- Stamp annotations may omit `imageUrl` when they carry a resolvable `stampId`.
- `resolveStamp` fills the image at render/export time, and `commitStamp` no longer copies the base64 payload. Exports deduplicate the same stamp through `stampImageUrl`.

### 10. Autosave rewrote every page of every tab

Files: `src/lib/storage.ts`, `src/lib/storage.test.ts`

- Workspace metadata (version, saved time, active id, tab order) is one record; each tab is its own record.
- `savedBlobs` and `savedTabRefs` are seeded on load and updated on save, so unchanged tabs and unchanged PDF bytes are skipped.
- Deleted tabs and orphaned blobs are pruned from both IndexedDB stores.

### 11. Closing a tab leaked its blob URL

File: `src/stores/useDocStore.ts`

- `releaseTab` calls `releasePdfDocument` and `URL.revokeObjectURL` for the tab's PDF URL before dropping it.

### 12. PDF tabs offered no-op actions and no-op undo entries

Files: `src/components/Sidebar.tsx`, `src/components/NewDocumentModal.tsx`, `src/stores/useDocStore.ts`

- Landscape and **Change template** are hidden for PDF-backed tabs; **Use template** is disabled for them in the new-document dialog.
- `applyTemplate` and `setLandscape` return without recording history when the action cannot change anything.

### 13. Slider drags flooded the undo stack

Files: `src/stores/useAnnotationStore.ts`, `src/components/Inspector.tsx`, `src/components/ui/controls.tsx`, `src/stores/annotationStore.test.ts`

- `update(ids, patch, recordHistory)` lets a drag record history once on `onDragStart` and then apply the rest without new entries.
- Test: `records one history entry for a whole slider drag` applies one recorded and two unrecorded updates, then undoes back to the original value in one step.

### 14. PDF search stopped at 500 pages and could not be cancelled

Files: `src/lib/pdfSearch.ts`, `src/components/SearchBar.tsx`, `src/lib/pdfSearch.test.ts`

- Removed `MAX_PAGES`; every page is searched.
- Page text is cached per page under `${url}#${pageNumber}` and cleared in `releasePdfDocument`.
- `searchTab` accepts an `AbortSignal` and a generation guard; `SearchBar` cancels the previous run through `AbortController`.
- Test: `searches every page and stops on abort` searches a 520-page document and verifies an aborted run returns nothing.

### 15. Backup import trusted its input

Files: `src/lib/storage.ts`, `src/lib/storage.test.ts`

- Tabs, pages and annotation lists are shape-checked; a malformed structure rejects the file.
- Any PDF tab must carry decodable `bytesBase64`; undecodable bytes reject the backup.
- Annotation and custom-stamp `imageUrl` values are limited to `data:image/`, `blob:` and `/assets/`; remote URLs are stripped.
- Tests cover malformed pages/annotations, undecodable PDF bytes, and remote URLs in both stamps and annotations.

### 16. `loadSidecar` parsed every PDF just to find nothing

Files: `src/lib/pdfEngine.ts`, `src/lib/base64.ts`, `src/lib/annotationGeometry.ts`, `src/lib/paper.ts`

- A fast byte scan for the `PDFMasterAnnotations` key runs before `PDFDocument.load`; files without a sidecar open without a full parse.
- Exports use `useObjectStreams: false`, keeping the sidecar key visible to the scan.
- Removed redundant copies and the dead exports `boundsContain`, `boxCenter`, `isBoxAnnotation` and `fitScale`.
- Moved base64 helpers into `src/lib/base64.ts`, shared by export, backup and boot paths.

## Nice-to-have

### 17. Print shortcuts were advertised on the wrong command

Files: `src/components/CommandPalette.tsx`

- **Print document** now shows the `Ctrl+P` hint and calls `printActiveDocument()`; **Print current page** no longer claims the shortcut.

### 18. Dead geometry helpers removed

Files: `src/lib/annotationGeometry.ts`, `src/lib/paper.ts`

- Deleted `boundsContain`, `boxCenter`, `isBoxAnnotation` and `fitScale`; no callers remained.

### 19. Shared base64 helper

File: `src/lib/base64.ts`

- `bytesToBase64` / `base64ToBytes` replace three hand-rolled copies.

### 20. Ineffective dynamic import and docs

Files: `src/lib/raster.ts`, `src/lib/pdfEngine.ts`, `README.md`

- `raster.ts` no longer dynamically imports `pdfEngine`; callers inject `renderPage` (`renderPdfPage`) through `CaptureRegionOptions`, removing the Vite `INEFFECTIVE_DYNAMIC_IMPORT` warning.
- `rasterizeTextAnnotation` lives in `raster.ts` and is imported statically by the engine.
- README updated: test count, per-tab IndexedDB layout, coverage summary and the sidecar limitation for older compressed exports.

## Verification output (key lines)

```
npx tsc -b
(no output — 0 errors)

npm test
Test Files  21 passed (21)
     Tests  143 passed (143)

npm run build
✓ 2339 modules transformed.
✓ built in 1.58s
(no warnings)

cargo check --manifest-path src-tauri/Cargo.toml
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.58s
exit 0
```

## Known limitation

The sidecar byte scan only finds `PDFMasterAnnotations` in uncompressed exports. PDFs exported by earlier builds (which used object streams) can reopen without their editable annotations. New exports are unaffected; the limitation is documented in `README.md`.
