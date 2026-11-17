# Phase 4 report — Text, Formula, Measure, Snapshot, Image, Crop, rebuilt export

Date: 2026-11-17
Scope: `D:\Project\PDF Master` (branch `main`, Phase 3 at `442dc27`, Phase 4 uncommitted)
Result: implementation complete, type-check clean, 35 tests passing, production build clean, headless browser smoke pass with 0 console errors.

---

## 1. What was delivered

### 1.1 Text annotation (vector, in place)

- New `TextAnnotation` model (`src/lib/annotationTypes.ts`) with box geometry, rotation, font family (`Helvetica`, `TimesRoman`, `Courier`), size in points, text colour, bold/italic/underline/strike-out, alignment, sub/superscript, box fill, frame styles (none, box, rounded, drop-shadow callout), line width, auto-fit, opacity.
- `TextView` renders text as SVG `<text>` with per-line alignment, and draws underline/strike-out and callout shadows. `TextEditor` is an in-place `<textarea>` aligned to the box in page millimetres, scaled by page zoom.
- Keyboard while editing: `Ctrl+B` bold, `Ctrl+I` italic, `Ctrl+U` underline, `Ctrl+M` auto-fit (box shrinks to the text), `Ctrl+Enter` / blur commits, `Escape` cancels.
- Double-click an existing text box to edit it; the edited annotation is hidden during editing and restored on commit.
- Export writes real PDF text (`page.drawText`) with cached standard fonts, wrapped by the same layout model used on screen (`src/lib/textLayout.ts`), so line breaks and auto-fit agree between canvas and PDF. Rotation is applied around the box centre.

### 1.2 Formula annotation (KaTeX)

- New `FormulaAnnotation` model: LaTeX source, box, colour, size, fill, rotation, opacity.
- `FormulaEditor` portal popover with live KaTeX preview, a palette of fractions/roots/integrals/limits/matrices/Greek/relations, colour, size, fill, opacity and transparent-fill controls.
- `FormulaView` renders KaTeX inside an SVG `foreignObject`, so the formula participates in page zoom, selection, rotation and move/scale like any other box.
- Double-click an existing formula to reopen the editor with its source.
- Export rasterises the formula to a PNG at 2× and embeds it (`embedPng`). The raster path renders **native MathML** (`output: "mathml"`) rather than KaTeX HTML, because the isolated SVG document used for rasterisation has no KaTeX stylesheet or webfonts; MathML needs neither and keeps fractions, radicals and scripts correct. A headless/test environment with no DOM falls back to drawing the LaTeX source in Helvetica.
- Formula ink colour is passed into the raster; the box fill is drawn as a vector rectangle before the image.
- Round-trip: LaTeX source, size, colour, fill and box geometry are stored in the sidecar and restored verbatim.

### 1.3 Measure tool

- Four sub-modes in `useUIStore.measureMode`: distance, perimeter, area, angle.
- `MeasureOverlay` draws the live polyline/polygon/angle with vertex handles, label chips and the measurement summary bar (Commit / Clear).
- Math in `src/lib/measure.ts`: `distanceStats`, `polylineLength`, shoelace `polygonArea`, `angleAt`, `formatLength`, `formatArea`, `formatNumber`.
- Scale calibration: page length × real length in the chosen unit produces a denominator (`calibrateDenominator`), saved as a custom scale (`useScaleStore`, `localStorage` key `pm.measure.scales`) with presets `1:1 … 1:500`. “Calibrate from Page” seeds the page length with the current page width.
- Units: mm, cm, m, in, ft, persisted in prefs.
- “Commit” converts the measurement into durable annotations:
  - distance → dimension shape with the active scale/unit,
  - perimeter → open/closed polygon outline,
  - area → filled polygon,
  - angle → text annotation with the measured degrees.

### 1.4 Snapshot tool

- Drag a region to capture it at 72/150/300 DPI (`usePrefsStore.snapshotDpi`).
- Capture (`src/lib/raster.ts`) composes: paper SVG background, any PDF canvas, then the annotation SVG, clipping CSS theme variables into the cloned markup.
- `SnapshotBar` offers Copy PNG (clipboard), Download PNG, Save as stamp and Close, with inline status.
- Saved snapshots become reusable custom stamps (`src/lib/customStamps.ts`, `pm.customStamps`), selectable from the stamp gallery and usable from the toolbar.

### 1.5 Image insert / paste / drop

- New `image` tool (toolbar after Snapshot) opens a file picker and places any decodable raster/SVG as a movable, scalable stamp annotation (`src/lib/images.ts`).
- Drag-and-drop onto the viewport accepts images; PDFs still open as tabs.
- Pasting an image from the clipboard (`paste` event) places it on the current page; annotation clipboard paste keeps priority inside the canvas.
- Images are normalised to PNG via canvas, capped at 2400 px on the long side.

### 1.6 Crop

- New `crop` tool and `DocumentPage.cropBox` (`{xMm, yMm, widthMm, heightMm}`).
- `CropOverlay` draws the crop frame with 8 handles, rule-of-thirds guides, live size readout, Apply and Reset. Dragging, resizing and clamping are in page millimetres.
- On screen the page is clipped with CSS `clip-path: inset(...)`; full-page coordinates are kept, so annotations and snapshots stay aligned while the cropped margin is hidden.
- “Apply crop” pushes history, stores `cropBox`, and returns to the select tool. The Inspector shows the current crop and can reset it.
- Export applies `page.setCropBox(...)` with the Y axis converted from page-top to PDF-bottom, and the sidecar stores the box so reopening restores it (`useDocStore` restore path).

### 1.7 Export: full page-tree rebuild

`exportPdf` no longer mutates the source document. It now:

1. Creates a fresh `PDFDocument.create()`.
2. Walks the tab’s pages in current order:
   - PDF-backed pages: `copyPages(source, [pdfPageIndex - 1])` and `addPage(copy)`;
   - paper pages: `addPage([widthMm, heightMm])` and redraws the paper template/grid.
3. Applies page rotation and `cropBox`.
4. Draws annotations onto the new pages.
5. Writes the sidecar with each copied page’s **new** 1-based index (`pdfPageIndex: index + 1`), plus crop boxes and annotations.

Consequences: page reorder, duplicate, delete, rotate, crop and interleaved paper pages all survive export; copying a source page twice is now two independent output pages; the source bytes are never modified.

### 1.8 Settings and shortcut editor

- `SettingsModal` opens from the gear in the top bar, the command palette (“Open settings”) or `Ctrl+,`.
- Shortcut editor lists every tool and action (`src/lib/shortcuts.ts`), captures keys with `bindingFromEvent`, normalises to canonical `Ctrl+Alt+Shift+Key` form, persists to `pm.shortcuts`, and supports per-action and global reset.
- Conflict detection (`detectConflicts`) marks every action sharing a binding; the app resolver keeps the first action in table order, so a conflicting binding never fires twice.
- App key handling now resolves tools and actions through the shortcut store (`palette`, `settings`, `save`, `open`, `undo`, `redo`, `presentation`, `fit-page`, all tools), while annotation clipboard/group/align shortcuts stay fixed.
- `Ctrl+B/I/U/M` inside the text editor and `Escape` cancellation remain local to the editor.

### 1.9 Preferences and workspace storage

- Preferences persisted under `pm.prefs`: scratch-out erasing, default measure unit, snapshot DPI.
- `SettingsModal` shows an IndexedDB usage/quota bar (`navigator.storage.estimate`).
- Workspace backup: export a `.pmbackup.json` (`workspaceBackup`), import it with validation (`parseWorkspaceBackup` → `restore`), with toast feedback.
- Autosave failures are now reported once per session via a toast instead of being swallowed (“storage may be full… export a backup”).

### 1.10 Stamp gallery virtualisation and custom stamps

- `StampGallery` (used by the Inspector panel and the full `StampLibrary` modal) now windows rows: fixed tile height/gap, computed start/end rows from scroll position and measured container height, absolutely positioned visible grid inside a spacer of total height.
- Library uses 7 columns, panel 3; only visible rows render, so ~465 stamps no longer create ~465 DOM tiles.
- New “Custom” chip lists snapshot/selection stamps; “My stamps” keeps the migrated Tools-folder stamps; “All” merges factory + user + custom. Selection works for all three sources (`stampArt` and the Inspector lookup include custom stamps).
- Filter change resets the scroll position.

### 1.11 Bundle splitting

`vite.config.ts` manual chunks:

| Chunk | Size (min) | gzip |
|---|---:|---:|
| `pdfjs` | 444.44 kB | 133.92 kB |
| `pdf-lib` | 419.68 kB | 175.51 kB |
| `stamp-data` | 569.02 kB | 59.49 kB |
| `katex` (JS) | 259.46 kB | 77.73 kB |
| `react` | 211.47 kB | 66.12 kB |
| `index` (app) | 179.41 kB | 52.79 kB |
| `icons` | 30.39 kB | 10.60 kB |
| `vendor` | 4.39 kB | 1.93 kB |

`chunkSizeWarningLimit` is 600 kB with a comment: the stamp catalogue is a single synchronous JSON payload (569 kB, 59 kB gzip) and splitting it further would require lazy stamp lookup everywhere. Build finishes with **zero warnings**.

---

## 2. Tests added

`npm test` — 6 files, 35 tests, all passing.

- `src/lib/annotationGeometry.test.ts`
  - unrotated text bounds,
  - rotated 90° bounds swap width/height and keep the centre,
  - hit-test inside/outside a rotated formula,
  - scaling a text box grows the font and preserves the centre,
  - rotating text around its centre normalises 400° to 40°.
- `src/lib/measure.test.ts`
  - distance/angle/components, length/area formatting through scale and unit,
  - polyline length, shoelace area, angle at a vertex,
  - calibration denominators and invalid inputs, custom scale label.
- `src/lib/shortcuts.test.ts`
  - normalisation (`shift+ctrl+s` → `Ctrl+Shift+S`, `meta+K` → `Ctrl+K`, `Ctrl+,`),
  - event → binding including bare-modifier rejection,
  - default map is conflict free,
  - duplicate binding flags both actions.
- `src/lib/pdfEngine.test.ts` (extended)
  - text + formula export keeps both annotations and payloads in the sidecar,
  - rebuilt page tree keeps count, order and paper page size while copying a PDF page twice,
  - sidecar re-indexes copied pages (`[undefined, 2, 3]`) and keeps the paper page’s annotation.

Existing Phase 1–3 tests (`annotationStore`, `sync`, original PDF engine cases) still pass.

---

## 3. Verification run

```text
npx tsc -b        → clean (strict, noUnusedLocals/noUnusedParameters)
npm test          → 6 files, 35 tests passed
npm run build     → built in ~1.1 s, zero chunk warnings
```

Headless browser pass (Playwright 1.65.1, Chromium, production `vite preview` build, 1440×900):

1. Loaded the app.
2. Drew a text box, typed text, toggled bold/underline (`Ctrl+B`, `Ctrl+U`), clicked away to commit.
3. Opened the formula studio, entered `a^2 + b^2 = c^2`, applied it.
4. Opened Settings with `Ctrl+,`, rebound the Pen shortcut to `Ctrl+Shift+9`.
5. Opened the Measure panel, Crop panel and Snapshot panel; verified their controls rendered.
6. Pressed `Ctrl+S` and received a PDF download (`A4 Blank.pdf`), exercising the rebuilt export path.

Result: **0 console errors, 0 page errors**. The npm Playwright dev dependency and the temporary smoke scripts were removed after verification; no test-only code remains in the app.

Formula raster verification: `latexToPng("E = mc^2 + \\frac{a}{b}", 40, 420, 120)` produced a 840×240 PNG with correct superscript and stacked fraction.

---

## 4. Known limits (deliberate, documented)

- **Formula export is raster**, not vector. KaTeX HTML depends on its stylesheet/webfonts, which do not load inside the isolated SVG raster document; native MathML does, at the cost of a PNG. Text export remains vector.
- **Bookmarks are not written as PDF outlines.** They stay in the workspace/sidecar; a future phase should map them to `pdf.catalog` outlines.
- **Crop frame dragging assumes an unrotated page viewer.** The overlay lives inside the rotated page wrapper, so 0°/180° are exact; 90°/270° use the rotated screen bounding box for pointer conversion and can feel slightly off at high zoom.
- **Snapshot capture is best-effort** for PDF canvases that have not painted yet; the region then shows the paper/annotations without that PDF fragment.
- **Stamp data stays in one 569 kB chunk** (59 kB gzip); the warning limit is raised to 600 kB rather than lazy-loading synchronous stamp lookup across the app.
- **Custom scales/stamps live in `localStorage`**, not IndexedDB; clearing site data drops them. The workspace backup covers tabs, pages and annotations but not those two preference stores.

---

## 5. File map

New:

- `src/components/SettingsModal.tsx`
- `src/components/canvas/TextView.tsx`
- `src/components/canvas/TextEditor.tsx`
- `src/components/canvas/FormulaView.tsx`
- `src/components/canvas/FormulaEditor.tsx`
- `src/components/canvas/MeasureOverlay.tsx`
- `src/components/canvas/SnapshotBar.tsx`
- `src/components/canvas/CropOverlay.tsx`
- `src/lib/textLayout.ts`
- `src/lib/measure.ts`
- `src/lib/formula.ts`
- `src/lib/raster.ts`
- `src/lib/images.ts`
- `src/lib/prefs.ts`
- `src/lib/shortcuts.ts`
- `src/lib/customStamps.ts`
- `src/lib/annotationGeometry.test.ts`
- `src/lib/measure.test.ts`
- `src/lib/shortcuts.test.ts`

Modified (main):

- `src/lib/annotationTypes.ts`, `types.ts`, `tools.ts`, `annotationGeometry.ts`
- `src/lib/pdfEngine.ts` (text/formula draw, crop, page-tree rebuild, sidecar re-index)
- `src/lib/storage.ts` (save result, quota estimate, backup encode/decode)
- `src/stores/useDocStore.ts` (restore crop box), `useUIStore.ts` (settings, measure mode, toast)
- `src/components/canvas/AnnotationLayer.tsx`, `PaperViewport.tsx`, `SelectionOverlay.tsx`
- `src/components/Inspector.tsx`, `StampGallery.tsx`, `TopBar.tsx`, `Sidebar.tsx`, `CommandPalette.tsx`, `toolIcons.tsx`
- `src/App.tsx` (shortcut resolver, settings, image paste, toast, save-failure reporting)
- `vite.config.ts` (manual chunks, warning limit)
- `package.json` / `package-lock.json` (`katex`)
