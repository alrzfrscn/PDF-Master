# Phase 17 Report

Date: 2026-11-22
Branch: `main`
Working tree: uncommitted changes for Phase 17

## Summary

All six Phase 17 fixes are implemented. TypeScript, the full vitest suite, the production build and the Tauri Rust check pass with zero errors.

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc -b` | 0 errors |
| Tests | `npm test` | 20 files, 130 tests passed |
| Production build | `npm run build` | built in 1.08 s, no errors |
| Rust | `cargo check --manifest-path src-tauri/Cargo.toml` | finished, 0 errors |

## 1. Pen ink rendering

Files: `src/lib/ink.ts`, `src/components/canvas/AnnotationLayer.tsx`, `src/lib/ink.test.ts`

- Pressure now starts at **0.5** for mouse/touch and `clamp(pressure, 0.25, 0.8)` for a stylus (`initialInkPressure`).
- Every subsequent sample uses exponential smoothing: `prev * 0.65 + target * 0.35` (`smoothPressure`).
- Samples closer than **0.25 mm** are dropped, preventing stacked points and the half-moon cap.
- Pointer moves replay **coalesced events**, so fast strokes keep their real curve.
- A one-point stroke, or a path shorter than **0.4 mm**, renders as a clean circle with radius `thicknessMm * 0.45` (`isDotStroke`, `dotPath`).
- Pen presets are exactly:
  - `basic`: thinning 0, smoothing 0.3, streamline 0.2
  - `pro`: thinning `0.45 * (level / 100)`, smoothing 0.38, streamline 0.28
  - `calligraphy`: thinning `0.65 * (level / 100)`, smoothing 0.45, streamline 0.35
- All strokes use `start/end: { taper: 0, cap: true }` and `last: true`.
- Live draft and committed annotation now pass identical options; the committed-only `smoothing: 0.85` rewrite on `annotation.smoothed` was removed. No smoothing is applied again on pointer-up.
- Updated `ink.test.ts` to the exact preset values and added checks for dot geometry, initial pressure, and pressure smoothing.

## 2. Touchpad / touchscreen pinch zoom

File: `src/components/canvas/PaperViewport.tsx`

- `pointerdown` pinch detection is registered in the **capture phase**, so a gesture that starts inside `AnnotationLayer` is still seen.
- A capture-phase, non-passive `touchmove` guard calls `preventDefault()` whenever two or more touches are active, preventing WebView2 page scaling.
- Wheel zoom is capture-phase and non-passive, with a window-level capture guard that blocks `ctrlKey`/`metaKey` wheel defaults before the browser can scale the UI.
- Touchpad pinch uses `Math.exp(-deltaY * 0.012)`; Ctrl/⌘ + mouse wheel uses `Math.exp(-deltaY * 0.0025)`.
- Zoom and pan are anchored to the **live pinch midpoint**: the page point under the previous midpoint is moved to the new midpoint, so zoom and two-finger translation happen in one gesture.
- Pure two-finger panning (constant finger distance) is handled explicitly in both continuous and paged modes via scroll updates or the pan offset.
- Paged-mode pinch panning no longer gets pulled back to the page centre.

## 3. Favourites bar reordering and active state

Files: `src/stores/useFavoritesStore.ts`, `src/components/FavoriteToolsBar.tsx`, `src/stores/useToolStore.ts`, `src/stores/useFavoritesStore.test.ts`

- Added persisted `reorder(fromIndex, toIndex)`; it updates in-memory order and localStorage/workspace backup order.
- Pointer drag starts after a **>160 ms hold or >6 px** move, with pointer capture.
- The dragged item lifts with `scale(1.1)` and an accent glow; release returns it to normal.
- A click activates a favourite only if the pointer stayed under 6 px and the drag did not start.
- Activating a favourite no longer opens the Inspector; an unpinned tool popover is closed. A pinned popover stays open.
- Added `activeFavoriteId` with an accent rounded ring; it is cleared when a favourite is removed, a backup is restored, or the tool/props/preset/stamp changes through the tool store (ToolBar, Inspector, palette, context menus).
- Added tests for reorder persistence and ring clearing.

## 4. Raw-PDF snapshot capture

Files: `src/lib/raster.ts`, `src/components/canvas/AnnotationLayer.tsx`, `src/components/Sidebar.tsx`

- Snapshot capture now receives the active `.page-paper` element plus explicit page width/height in mm and the `PdfPageSource`.
- PDF pages are composited over a **white** base; the theme `--paper` colour is used only for parametric paper pages.
- The PDF canvas is cropped using millimetre ratios against the actual page size, not the element's client size.
- If the on-screen canvas is missing or unpainted (zero dimensions), `renderPdfPage` renders the page offscreen at the snapshot DPI.
- The `PaperSheet` SVG is skipped for PDF pages, so ruled paper can never appear behind a PDF.
- Only `svg[data-annotation-layer]` is composited; selection handles and crop chrome remain excluded.

## 5. Sidebar View toggle

File: `src/components/Sidebar.tsx`

- Added `viewButtonRef` and assigned it to the View button.
- The outside-pointerdown dismissal handler now ignores both the popover and the View button, so the button's click toggles the popover instead of closing it and immediately reopening it.

## 6. Combine Documents modal

Files: `src/components/CombineModal.tsx` (new), `src/lib/combine.ts` (new), `src/components/TopBar.tsx`, `src/lib/combine.test.ts` (new)

- Extracted the modal into `CombineModal.tsx`; TopBar only keeps the open flag.
- Fixed the multi-select file picker: `multiple`, PDF filtering, input value reset, and files read into `{ id, name, bytes, pageCount }` using `PDFDocument.load(bytes, { ignoreEncryption: true })`.
- New dialog: `w-[92vw] max-w-[780px]`, `menu-surface rounded-2xl`, `grid-cols-2 gap-4`.
- Left column: open tabs with up/down arrows left of the checkbox, title and page count.
- Right column: PDF files with up/down arrows left of `Trash2`, filename, page count, plus drag-and-drop.
- Combining exports checked tabs and files in their exact reordered display order and opens the result as a new PDF tab.
- Footer shows `N items · M pages` and Cancel/Combine actions.
- Added unit tests for `moveItem`, `combineOrder`, and `combineSummary`.

## Build note

`vite build` reports one non-fatal warning: `src/lib/pdfEngine.ts is dynamically imported by src/lib/raster.ts but also statically imported elsewhere`. The dynamic import is intentional (avoids a static cycle with `formula.ts`) and does not create a separate chunk because `pdfEngine` is already in the main graph. It does not affect correctness or the build result.

## Verification output (key lines)

```
npx tsc -b
(no output — 0 errors)

npm test
Test Files  20 passed (20)
     Tests  130 passed (130)

npm run build
✓ 2337 modules transformed.
✓ built in 1.08s

cargo check --manifest-path src-tauri/Cargo.toml
Finished `dev` profile [unoptimized + debuginfo] target(s) in 13.84s
```
