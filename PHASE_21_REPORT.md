# Phase 21 — Touchpad Zoom, Flicker-Free Rendering, Calibrated Ink, Welcome Workspace, Pages Panel

## Result

All seven tasks are implemented and the full gate set is green:

| Gate | Result |
| --- | --- |
| `npx tsc -b` | 0 errors |
| `npm test` | 21 files, **171 tests passed** |
| `npm run build` | success, 0 warnings |
| `cargo check --manifest-path src-tauri/Cargo.toml` | success, 0 warnings |

---

## 1. Windows touchpad pinch zoom

- `src-tauri/tauri.conf.json`: added `"zoomHotkeysEnabled": true` to the main window, so WebView2 no longer reserves Ctrl + wheel for its own UI scaling.
- `src/components/canvas/PaperViewport.tsx`:
  - The wheel handler now normalises line/page deltas to pixels, accepts fractional `deltaY` (0.5–15) with `ctrlKey`/`metaKey`, and clamps a single event's factor to `0.74–1.35` so a burst of tiny trackpad events zooms smoothly and one huge event cannot jump the whole range.
  - A capture-phase `window` wheel listener calls `preventDefault()` (never `stopPropagation()`). A pinch over the floating chrome zooms about the viewport centre; a pinch over the canvas is handled once by the element listener.
- `src/App.tsx`: a capture-phase `window` keydown listener calls `preventDefault()` for Ctrl/⌘ `+`, `-`, `=`, `0` (and numpad equivalents) without stopping propagation, so the document owns zoom instead of the WebView.

## 2. Zero-flicker double-buffered PDF rendering

- `src/lib/pdfEngine.ts` — `renderPdfPage` now:
  1. allocates an offscreen `<canvas>` at the target resolution,
  2. renders into it while the visible canvas keeps its previous bitmap,
  3. after `renderTask.promise` resolves, atomically sets the visible canvas size, copies the style size, and blits with `drawImage`,
  4. drops stale results when a newer render owns the canvas,
  5. frees the offscreen buffer (`width = 0; height = 0`).
- `src/components/canvas/PdfBackground.tsx`: the per-render cleanup that zeroed the visible canvas (and caused the white flash) was removed; only unmount frees the backing buffer.

## 3. Calibrated stylus pressure

`src/lib/ink.ts`:

- `level = clamp(pressureLevel, 0, 100) / 100`.
- `Basic` is fixed at `1.0×`.
- `Pro`: `pCurve = pow(clamp(p, 0.02, 1), 0.82)`, `mFull = 0.25 + 1.65 · pCurve`, `multiplier = 1 + level · (mFull − 1)`.
- `Calligraphy`: `mFull = 0.16 + 2.04 · pow(clamp(p, 0.02, 1), 0.88)`.
- `penStyleOptions` now carries `penStyle` and `pressureLevel`; `radiusForPressure` applies the calibrated curve, with the legacy thinning response kept when no style is supplied.
- `initialInkPressure` band widened to `0.15…0.95`.
- `smoothPressure(previous, target, hasRealPressure)` uses `prev·0.25 + target·0.75` for a real stylus and the old `prev·0.65 + target·0.35` for mouse/touch.

`AnnotationLayer.tsx` passes `hasRealPressure` into the smoother.

## 4. No auto-jump while scrolling

`PaperViewport.tsx`: `pageNumber` was removed from the fit `useLayoutEffect` dependency list. Free scrolling now only updates the page indicator. Re-fitting happens on an explicit fit (`fitEpoch`), `viewMode`, `tab.id`, or a rail resize; `pm:goto-page` / `pm:search-focus` still scroll through their own paths.

## 5. Apple-style empty welcome workspace

- Closing the last tab now yields `tabs: []`, `activeId: ""`, `page: 1`; a 15 s Undo is offered only when the closed tab had annotations.
- New `src/components/EmptyWorkspace.tsx`: document icon, title, subtitle, and three glass cards (Open / Create / Combine) plus PDF drag-and-drop.
- `PaperViewport` renders `EmptyWorkspace` when there is no tab; the viewport body moved into `PaperViewportBody` so hooks stay unconditional and remount per tab.
- Guards: `TopBar` (page/zoom pills, undo/redo/save/present disabled), `Sidebar` (drawer only with a tab), `Inspector` (returns `null`), `ToolBar` (hidden), `FavoriteToolsBar` (hidden), and document-only shortcuts in `App.tsx`.
- `#pm-pdf-input` is now `multiple` and opens every selected file sequentially.
- TopBar `+` opens the PDF picker with the tooltip `"Open PDF file(s)..."`.
- `NewDocumentModal` tolerates an empty workspace: template selection creates the first tab instead of reading `tab.pages`.

## 6. Pages panel overhaul

- Removed the Move up / Move down row.
- The trash button opens a `.menu-surface` popover with **Delete this page**, **Delete pages after this**, and **Delete pages before this**.
- `useDocStore`: new `deletePagesAfter`, `deletePagesBefore` (single undo snapshot, bookmark remap, page clamp) and `movePage` (same single-step reorder semantics, moved page stays selected).
- `src/lib/bookmarks.ts`: new `delete-range` page op; bookmarks inside a removed block clamp to the nearest surviving page.
- Pages drawer: fixed header, scrollable thumbnail grid, sticky footer with Add / Copy / Rotate / Delete ▾, Prev / X/Y / Next, Alignment guides, and Portrait/Landscape + Change Template for paper tabs only.
- Pointer-event drag reorder in both grid and strip: activates after a 140 ms hold or 6 px movement, lifts the thumb (`scale 1.06` + accent ring) and shows a blue insertion line. Pointer capture starts only once the drag activates so a plain tap still selects the page.
- `useUIStore`: `pagesCompactMode` + `togglePagesCompactMode`. Compact rail is 104 px wide at x 68, `max-height: calc(100vh - 80px)`, header + thumbs only (no footer).
- `FavoriteToolsBar` sits at `left: 184px` beside the compact strip.
- `getWorkspaceInsets` accepts `pagesCompactMode`: `leftInset` 184 without favourites, 240 with them.
- Other left-rail actions (View, Search, Favourites, finger mode) close the compact strip; the Pages icon toggles it.

## Tests added / updated

- `src/lib/ink.test.ts`: pressure band `0.15…0.95`; fast stylus smoothing; Pro and Calligraphy widening from 0.15 to 0.95 at 55 % and 100 %; flat Basic and 0 % levels.
- `src/stores/useDocStore.test.ts`: closing the last tab leaves `tabs.length === 0` / `activeId === ""`; annotated last tab stays recoverable; `deletePagesAfter` / `deletePagesBefore` single undo + bookmark remap + clamps; `movePage` single undo + bookmark follow + selection.
- `src/lib/bookmarks.test.ts`: unchanged suite still covers remapping.
- `src/lib/paper.test.ts`: compact insets 184 / 240, and 68 when the strip is closed.

## Known limits

- Drag reorder sets `touch-action: none` on page thumbs, so a finger scrolls the pages list with the wheel/scrollbar rather than by dragging a thumb. Mouse and pen are unaffected.
- `pagesCompactMode` is session state, not persisted.
- A workspace emptied and then restarted falls back to the built-in demo tabs because `loadWorkspace` returns `null` for an empty workspace; this is existing behaviour outside this phase.
