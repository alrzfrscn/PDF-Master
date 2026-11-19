# Phase 11 — UX and behavior fixes

Branch `main`, working tree changes only (not committed). All fixes below are implemented, tested, and built.

## Fixes

| # | Reported problem | Change | Files |
|---|---|---|---|
| 1 | Top bar and its tab strip sat under floating canvas controls | Header raised to `z-[120]` | `src/components/TopBar.tsx` |
| 2 | Fit ignored the floating side rails; pages were not centered in the visible area | Fit computes against `leftInset`/`rightInset`; continuous content pads by the same insets; single-page stage centers between them | `src/components/canvas/PaperViewport.tsx` |
| 3 | Closing the last tab did nothing | Last tab is replaced by a fresh blank tab (undo keeps the old tab for 15 s when it has annotations); new blank tab comes from one `createInitialTab()` helper | `src/stores/useDocStore.ts` |
| 4 | Ink: taps left no mark; scratch-out erased handwriting; selecting one ungrouped annotation selected every ungrouped annotation | A tap commits a dot; scratch-out is off by default and requires a wide, 8-reversal scribble (`minAspect`); group selection only expands a real group id (`selectionForAnnotation`) | `src/components/canvas/AnnotationLayer.tsx`, `src/lib/prefs.ts`, `src/lib/annotationGeometry.ts`, `src/stores/useAnnotationStore.ts` |
| 5 | A newly saved snapshot/stamp was not the stamp that got placed; previews missed newly saved stamps | One `resolveStamp()` lookup for factory, user and saved stamps (saved wins); save returns the created stamp; save switches to the Stamp tool with it selected | `src/lib/customStamps.ts`, `src/stores/useToolStore.ts`, `src/components/canvas/AnnotationLayer.tsx`, `src/components/Inspector.tsx`, `src/components/StampGallery.tsx` |
| 6 | Snapshot bar overflowed the page edge and was clipped | Bar is measured, clamped inside the sheet at any zoom, laid out `inline-flex w-max`, raised to `z-[95]` | `src/components/canvas/SnapshotBar.tsx`, `src/components/canvas/AnnotationLayer.tsx` |
| 7 | Polygon was click-per-vertex and tedious; dropped images were placed but not selected | Polygon draws by dragging a box (`regularPolygonPoints`), with a sides selector; imported/snapshot images auto-select and switch to the Select tool | `src/lib/annotationGeometry.ts`, `src/components/canvas/AnnotationLayer.tsx`, `src/components/PropertyControls.tsx`, `src/lib/images.ts` |
| 8 | Highlighter had no tip choice and no straight mode | Tip styles (vertical, horizontal, squared, ball) render in the live preview and on the page; "Straight line highlight" collapses the stroke to two points and snaps horizontal within ±4° | `src/lib/types.ts`, `src/lib/presets.ts`, `src/components/PropertyControls.tsx`, `src/components/canvas/AnnotationLayer.tsx` |
| 9 | Search was whole-document only and boxes were wrong per word | Per-character normalization with an index map gives word-level slices for LTR and RTL runs; legacy reversed runs still match; whole-word toggle `[ab]` | `src/lib/pdfSearch.ts`, `src/components/SearchBar.tsx` |
| 10 | Explicit page jumps fought scroll tracking in continuous mode | Pages carry `data-page-number`; `setPage` dispatches `pm:goto-page`; scroll updates the page with `setState` so it never loops; vertical scrollbar is always reserved and visible in all themes | `src/components/canvas/PaperViewport.tsx`, `src/stores/useDocStore.ts`, `src/index.css` |

## Tests added

- `src/lib/pdfSearch.test.ts`
  - original indices for a Latin word;
  - `wholeWord`: `"water"` in `"water damage"` matches, in `"waterfall"` does not; `"آب"` matches itself, not `"آبدهی"`;
  - LTR bounding box matches the slice offset and width of the text item;
  - Persian RTL box: `"آب"` maps to the visual right edge, `"دهی"` to the left.
- `src/stores/useDocStore.test.ts`
  - closing the only tab yields one fresh blank tab with a new id and no annotations.
- `src/stores/annotationStore.test.ts`
  - clicking one of three ungrouped annotations selects exactly one id.
- `src/lib/annotationGeometry.test.ts`
  - a hexagon dragged from (10, 20) to (60, 70) has 6 vertices, all inside the drag box.

## Verification

| Command | Result |
|---|---|
| `npx tsc -b` | exit 0, no errors |
| `npx vitest run` | 15 files, 92 tests passed |
| `npm run build` | built in 926 ms, exit 0 |
| `cargo check --manifest-path src-tauri/Cargo.toml` | finished dev profile in 19.28 s, exit 0 |

## Limits and decisions

- Highlighter tips are approximated with stroke width and cap rather than a shaped nib outline (marked `shortcut:` in `AnnotationLayer.tsx`).
- Search keeps the existing legacy visual-order fallback, which highlights the whole text item because those runs cannot be sliced.
- Undo after closing the last tab restores the closed tab next to the fresh blank one: no data is lost, but the blank is not removed automatically.
- Changes are uncommitted on `main`; last commit is `f3bd8d2 update config`.
