# PHASE 3 — Vector Annotation & PDF Authoring

**Project:** PDF Master (redesign of PDF Annotator 10.0.0.1011)
**Branch:** `main` · **Date:** 2026-11-17
**Scope:** the annotation layer, selection/transform studio, multi-page documents, PDF open/render, vector PDF export with an editable sidecar or flattening, and workspace persistence. Text/Formula, measure calibration, snapshot/crop and `.paa` import stay out of Phase 3 and are named in §11.

---

## 1. What shipped

| Area | Result |
|---|---|
| Annotation model | Pen, Marker, Shape (line/arrow/rectangle/ellipse/polygon/dimension), Stamp — all in page-local millimetres |
| Ink | `perfect-freehand` variable-width outlines, real stylus pressure with a velocity fallback, Shift axis lock, scratch-out gesture |
| Shapes | Shift 15° lines / 1:1 boxes, Ctrl centre-out, arrowheads 0/3/5/7/10, dimension with extension lines + live unit label |
| Stamps | Click for native ink size or drag to scale; **464** factory stamps now all have art, plus the 396 user stamps |
| Selection | Click, Shift multi-select, marquee, lasso, 8 resize handles, rotation handle (Shift 15°), floating mini-bar, align/distribute, group/lock/z-order |
| Inspector | Live property panel for mixed selections (colour, width, opacity, fill, line style, align, distribute) with undo per edit |
| Pages | Per-tab page list with add, duplicate, rotate, move up/down, delete and thumbnail switching; per-tab undo/redo |
| Undo | 60 snapshots per tab, shared by drawing, transforms, page ops and Inspector edits |
| PDF open | `pdfjs-dist` 6.5.438: page sizes, outline → bookmarks, canvas rendering; drag-drop, Ctrl+O, both note PDFs as tabs |
| PDF export | `pdf-lib` 1.17.1, fully vector: ink outlines, shapes, arrowheads, dimension labels, embedded stamps, vector paper; editable sidecar or flattened output |
| Persistence | IndexedDB autosave (700 ms debounce) and workspace restore, including PDF bytes |
| Verification | `tsc -b` clean · `vitest` **18/18** · `vite build` succeeds · headless Playwright pass with **0 console errors** |

---

## 2. Coordinate and annotation model

`src/lib/annotationTypes.ts` defines the whole scene graph without a single pixel:

```ts
type Pt = [number, number];                    // page-local mm
type InkPoint = [number, number, number];      // x, y, pressure (0..1)

PenAnnotation      { points, color, thicknessMm, opacity, sensitivity, smoothed }
MarkerAnnotation   { points, color, thicknessMm, opacity, tipStyle }
ShapeAnnotation    { shapeType, start, end, points, strokeColor, fillColor,
                     fillTransparent, lineWidthMm, lineStyle, opacity,
                     arrowHead, arrowTail, dimensionUnit, dimensionScale }
StampAnnotation    { stampId, imageUrl, xMm, yMm, widthMm, heightMm,
                     rotation, flipH, flipV, opacity }
```

Every annotation also carries `id`, optional `groupId`, `locked` and `hidden`.

Rules that make zoom and rotation safe:

* Coordinates are millimetres in the **unrotated page space**. The page is rotated with a CSS transform on the wrapper; the annotation layer lives inside it, so strokes stay glued to the paper at any rotation.
* Pointer positions come from `svg.getScreenCTM().inverse()` (`AnnotationLayer.toMm`), so zoom, pan and rotation never need special-case math.
* Selection chrome is HTML over the SVG and counter-scales by `1 / zoom` in `SelectionOverlay.tsx`; handles stay 9 screen pixels at every zoom.
* `annotationBounds` inflates ink by half its stroke width and stamps by their rotated corners, which keeps hit-testing and resize boxes honest.

---

## 3. Pointer state machine and tools

`AnnotationLayer.tsx` owns one interaction ref (`ink`, `shape`, `move`, `marquee`, `lasso`, `scale`, `rotate`, `stamp`, `erase`) plus a draft for live preview. A single pointer-down/move/up pair drives every tool, including polygon click-chains and the eraser sweep.

### 3.1 Pen and Marker

* Pen preview and commit use the same `inkPath()` (`perfect-freehand`), with `thinning` from the `sensitivity` flag and `smoothing` from the `smoothed` flag.
* A stylus gives real `event.pressure`; a mouse falls back to `pressureFromVelocity()`, which maps fast movement to thin ink and slow movement to full width, clamped to 0.2–1.
* Shift at release (and during the stroke) snaps start → end to 15° steps.
* Marker is a `polyline` with `mix-blend-mode: multiply`, translucent by default (45 %), with `butt` / `square` / `round` caps for the vertical / squared / ball tips.
* `detectScratchOut()` turns a tight, rapid scribble into an erase: at least 4 direction reversals, 26 mm maximum bbox, 25 mm minimum travel, 0.6 mm dead zone. It deletes annotations intersecting the gesture box, ignoring locked/hidden ones.
* Committed strokes get `+5 mm` offsets only through duplicate/paste, never on creation.

### 3.2 Shapes

| Behaviour | Implementation |
|---|---|
| Shift = 15° ray | `snapAngle()` in `AnnotationLayer` |
| Shift = square/circle | `constrainEnd(..., boxy)` uses the larger delta on both axes |
| Ctrl/⌘ = centre-out | End is mirrored through the start |
| Arrowheads | 0 (none), 3 (open), 5 (filled triangle), 7 (diamond), 10 (dot); SVG markers on screen, polygon paths in PDF |
| Dimension | Offset dimension line, extension lines from both measured points, filled arrowheads, live `formatDimension()` label (mm / cm / in, one decimal for mm) |
| Polygon | Click adds vertices; clicking the first vertex (within 2.2 mm), double-click or Enter closes; Esc cancels; a dashed preview with vertex dots tracks the chain |
| Stamp | Click = native ink size centred on the cursor; drag > 1.5 mm on both axes = that rectangle |

Draft previews reuse the same `AnnotationView` component as committed annotations, so what is drawn is exactly what lands.

### 3.3 Eraser

* Whole-object mode removes every hit annotation (default).
* Split mode (`eraserSplit` in `useUIStore`, or hold Alt) cuts pen/marker strokes: `subtractEraser()` keeps the runs outside the 2.6 mm eraser circle and re-IDs each fragment. Shapes and stamps are still removed whole.
* The sweep is coalesced at 0.8 mm so a fast drag cannot fire hundreds of history entries; locked/hidden annotations are never erased.

---

## 4. Selection, transform and Inspector

| Interaction | Result |
|---|---|
| Click | Hit-tests topmost annotation (1.4 mm tolerance + half stroke); clicking empty paper clears unless Shift |
| Shift + click | Adds/removes from the selection; clicking any member of a group selects the whole group |
| Drag a selected annotation | Moves the whole selection, one undo entry per gesture |
| Drag empty paper | Marquee; annotations intersecting the box are selected |
| Lasso tool | Freehand polygon; centre or any of 40 sampled stroke points inside selects |
| Resize handles | 8 handles anchored on the opposite corner; Shift/Ctrl preserves aspect; stroke widths scale with the geometry |
| Rotate handle | Rotates about the selection centre; Shift snaps to 15° |
| Mini-bar | Duplicate, rotate 90°, flip H/V, group/ungroup, lock, front/back, delete |
| Arrow keys | 1 mm nudge; Shift = 5 mm |
| Inspector | Colour, width, opacity, fill, line style for mixed selections; align (6 modes, ≥2 objects), distribute H/V (≥3) |

Store operations live in `useAnnotationStore.ts`: `add`, `addMany`, `update`, `mutate`, `remove`, `deleteSelection`, `duplicateSelection`, `copySelection` / `cutSelection` / `paste`, `groupSelection` / `ungroupSelection`, `setLocked`, `bringToFront` / `sendToBack`, `align`, `distribute`, `nudge`, `eraseAt`, `scratchOut`. Selection is cleared automatically when the active tab or page changes.

Duplicate, paste and page duplication all mint new ids; duplicated groups get one fresh shared `groupId`, so a pasted group moves together but never merges with the original.

---

## 5. Documents, pages, history and persistence

`DocumentTab` now owns `pages: DocumentPage[]`; `pageCount` is kept in sync for the presentation bar. A page holds `templateId`, `rotation`, `annotations`, and optionally a `pdf` reference (`url`, `pageNumber`, `widthMm`, `heightMm`).

| Page op | Behaviour |
|---|---|
| Add | Inserts after the current page, inherits its template, selects the new page |
| Duplicate | Clones the page and annotations with new ids, inserts after the source |
| Rotate | 90° steps; rotation is a view transform only, annotation coordinates are untouched |
| Move up / down | `reorderPage()` swaps position and follows the moved page |
| Delete | Refuses to delete the last page, clamps the current index |
| Switch | Sidebar thumbnails, Prev/Next, PageUp/PageDown; PDF pages render real thumbnails at 96 px |

Undo history is **per tab**: `pushHistory(tabId)` stores a structured clone of the page array (max 60), and `undo`/`redo` move snapshots between the two stacks. Every mutation path — drawing, erasing, transforms, Inspector edits, page ops — pushes exactly once per user action; drags push once at gesture start.

Persistence (`src/lib/storage.ts`) writes `{ version, savedAt, activeId, tabs }` into IndexedDB database `pdf-master`, store `workspace`, key `current`, 700 ms after the last document change. On boot, `App.tsx` restores tabs and re-creates object URLs for stored PDF bytes. History and clipboard are intentionally in-memory only.

---

## 6. PDF engine

Everything lives in `src/lib/pdfEngine.ts`; there is no server and no native DLL.

### 6.1 Open and render

* `inspectPdf()` reads page sizes in mm and walks `getOutline()`, resolving named destinations to page indices. The result becomes the tab's `pdf.bookmarks` shown in the sidebar (depth preserved, custom bookmarks can be added).
* `renderPdfPage()` rasterises into a canvas at `min(4, max(1, quality))` device pixels per CSS pixel and cancels the previous render task when zooming or switching pages.
* PDF bytes are copied before hand-off because pdf.js transfers (detaches) the buffer to its worker.
* Opening is available from the top bar, Ctrl+O, drag-and-drop anywhere on the viewport, and both bundled note PDFs in New Document. Failures surface as a dismissible toast instead of a silent break.
* `PdfBackground.tsx` keeps the canvas sized to the current page box and re-renders on page/zoom changes.

### 6.2 Export

`exportPdf({ title, pages, sourceBytes?, mode })` runs entirely in the browser:

* Paper pages are created at exact mm × 72/25.4 pt; the parametric paper (lines, weights, colour) is drawn as vector lines by `drawPaperBackground()`.
* Ink is re-generated with `perfect-freehand` and drawn with `page.drawSvgPath`, preserving variable width.
* Shapes are native SVG paths; arrowheads are resolved to filled/outline polygons because `drawSvgPath` cannot reference SVG markers. Dimensions get real text via the embedded Helvetica font.
* Stamps are fetched (or decoded from `data:`) and embedded as PNG, with rotation (negative in PDF space), flip through the geometry, and opacity.
* PDF-backed pages reuse the original page object, so links, annotations and metadata survive; only rotation is added.
* **Editable** mode stores the whole scene as `PDFMasterAnnotations` (a PDF string in the catalog): `pm1:` + base64(JSON) with `version: 1`, title, save time and one entry per page (`templateId`, landscape, rotation, size, `pdfPageIndex`, annotations). Drawings are also painted into the page content, so any viewer shows the result.
* **Flattened** mode writes the same content and omits the sidecar, giving a clean hand-off file.
* `loadSidecar(bytes)` reads it back; the open path restores annotations and rotation when the page count still matches.

The tests pin the format: sidecar round-trip, editable export carries the catalog key, flattened export does not, re-exporting a PDF-backed file does not duplicate pages, and a flipped stamp is mirrored with negative image scales while its flip flags survive in the sidecar.

---

## 7. UI wiring

* **Sidebar Pages** — thumbnails (PDF thumbnails rendered), add/copy/rotate/move/delete, Prev/Next, orientation, guides, template change, paper style counts.
* **Sidebar Annotations** — per-page annotation list, click jumps to the page and selects, eye toggles `hidden`, trash removes.
* **Sidebar Bookmarks** — outline entries with depth indentation and page jump; "bookmark this page" for any PDF tab.
* **Top bar** — Open PDF, Undo, Redo, Save editable PDF, Export flattened PDF, plus all Phase 2 controls.
* **Inspector** — Selection panel replaces tool properties whenever something is selected; Eraser mode exposes Split strokes; stamp panel states click vs drag.
* **Status line** — source (Paper/PDF), size in mm, `Page n / total`, zoom, active-tool hint, live dimension hint.

Global shortcuts added in `App.tsx`:

| Key | Action |
|---|---|
| `V` / `P` / `M` / … | Select / Pen / Marker / tool shortcuts |
| Ctrl+O | Open PDF |
| Ctrl+S | Export editable PDF |
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Undo / redo |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / cut / paste annotations |
| Ctrl+D | Duplicate +5 mm |
| Ctrl+A | Select all on the page |
| Ctrl+G / Ctrl+Shift+G | Group / ungroup |
| Delete / Backspace | Delete selection |
| Arrows / Shift+Arrows | Nudge 1 mm / 5 mm |
| Esc | Cancel polygon, close overlay, clear selection |

---

## 8. Verification performed

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc -b` | no errors |
| Unit | `npm test` | **18/18** passed in 3 files (`sync` 6, annotation store 7, PDF engine 5) |
| Production build | `npm run build` | success, 1,355.9 kB JS / 348.4 kB gzip + pdf chunk 433.8 kB; only the 500 kB advisory |
| Browser | headless Chromium 1500 × 950 against the dev server | all steps passed, **0 page/console errors** |

The Playwright run performed, in order:

1. drew a 24-segment pressure stroke → 1 SVG path in the annotation layer;
2. pressed `V`, clicked the actual sine curve (the earlier failure was a test that clicked 30 px off the stroke, not an app bug), asserted the mini-bar, then Ctrl+D → 2 paths;
3. placed a stamp → 1 `<image>`;
4. drew a rectangle → 1 `<rect>`;
5. added a page, moved it up (`1/2`) and down (`2/2`), deleted it;
6. drew a dimension → live label `58.8 mm`;
7. exported editable PDF → 14,427 bytes, 1 page, catalog sidecar starting `pm1:e…`;
8. exported flattened PDF → 9,742 bytes, no sidecar;
9. opened `Notes_METRIC.pdf` as a tab → title tab present, status `Page 1 / 1`, canvas 794 × 1123;
10. re-opened the exported editable PDF through the file input → paths, rect, image and text all restored from the sidecar.

Screenshots from the run: `annotated.png` (duplicated stroke, stamp, rectangle and dimension), `pdf-tab.png` (rendered metric notes), `roundtrip.png` (restored export) in `%TEMP%\opencode\phase3-verify`.

One real defect was found by this pass and fixed before the final run: the dimension branch of the PDF exporter referenced `heightMm`/`font` outside its destructuring scope, so exporting a dimension would have thrown. `drawShape()` now destructures both from `DrawContext`; the verified export includes the dimension label.

A second closed-check exported the same stamp flat, flipped it with the mini-bar, exported again, and reopened both files: the mirrored glyph stayed at the same page position, the rendered page hashes differed, and the run finished with zero console errors. The unit test for this asserts the negative image scales in the content stream and the surviving flip flags in the sidecar.

Known build advisory: the main chunk is 1.36 MB because all preset/stamp JSON plus pdf.js remain eagerly imported. Acceptable for a local-first desktop app; the obvious trim is lazy-loading the stamp gallery and PDF engine.

---

## 9. Repository changes

```
src/
├── lib/
│   ├── annotationTypes.ts        new · annotation unions, patch, labels
│   ├── annotationGeometry.ts     new · bounds, hit-test, translate/scale/rotate/flip,
│   │                                  scratch-out, split eraser, dimension text
│   ├── ink.ts                    new · perfect-freehand outline → SVG path, velocity pressure
│   ├── pdfEngine.ts              new · inspect/render, sidecar, vector export
│   ├── pageUtils.ts              new · page size/template helpers (unrotated space)
│   ├── storage.ts                new · IndexedDB workspace
│   └── types.ts                  extended · DocumentPage, PdfSource, PdfBookmark, tab pages
├── stores/
│   ├── useAnnotationStore.ts     new · all annotation mutations + selection
│   ├── annotationStore.test.ts   new · 7 store/geometry tests
│   ├── useDocStore.ts            rewritten · pages, page ops, PDF open, history, restore
│   └── useUIStore.ts             extended · split-eraser preference
├── components/
│   ├── canvas/
│   │   ├── AnnotationLayer.tsx   new · pointer state machine, rendering, selection
│   │   ├── SelectionOverlay.tsx  new · bbox, 8 handles, rotate handle, mini-bar
│   │   ├── PdfBackground.tsx     new · pdf.js canvas host
│   │   └── PaperViewport.tsx     rewritten · page stage, rotation, drop target, errors
│   ├── Sidebar.tsx               extended · real pages, annotations, bookmarks
│   ├── Inspector.tsx             extended · selection panel, eraser mode
│   └── TopBar.tsx                extended · open/undo/redo/save/flatten
├── App.tsx                       extended · shortcuts, autosave/restore, file input
└── components/NewDocumentModal.tsx extended · note PDFs open as tabs
```

New runtime dependencies: `perfect-freehand@1.2.3`, `pdfjs-dist@6.5.438`, `pdf-lib@1.17.1`.

---

## 10. Known limits and risks

* **Three stamps still use stand-in art.** The factory serialized ink streams for `Doppelbogen` ×2 and `Lachender Smiley` were never byte-decoded in Phase 3. Their records point at twin art (a factory `Doppelbogen` and the user "Lachender Smiley" stamp) and are flagged `artSource: "twin-art"`; `migration_manifest.json` still reports `missing: 3` at generation time because it describes the extraction run, not the shipped gallery. All 464 stamps now have a PNG, so nothing is filtered from the gallery.
* **The sidecar is PDF Master-specific.** `PDFMasterAnnotations` is a base64 JSON string, not a PDF annotation array. Other readers see the painted vector result; they cannot edit it as annotations. Flatten mode is the intended interchange for those cases.
* **PDF-backed page structure is preserved, not rebuilt.** Export reuses the source page objects: annotations and rotation are applied, deleted source pages are not removed from the saved file, and tab reordering does not reorder source pages. Paper pages added to a PDF tab are appended after the existing pages. Page ops are fully reflected for generated paper documents. Rebuilding page trees would fix this but risks losing outlines, forms and links, so it is postponed to a dedicated export pass.
* **IndexedDB stores whole tabs, including PDF bytes.** Very large PDFs can exceed quota; storage failures are intentionally swallowed (`openDb` resolves `null`) so the app keeps working, but there is no visible "autosave failed" state. There is no size cap or eviction policy yet.
* **History is memory-only.** Reload restores the document, not the undo stack or clipboard.
* **pdf.js background is raster.** Page content renders to a canvas at up to 4× CSS pixels; there is no text layer or text selection on PDF pages. Encrypted PDFs depend on pdf.js defaults and fail into the error toast.
* **Marker multiply is screen-only.** Export draws translucent strokes, not a true multiply blend, because pdf-lib does not expose blend modes through the path API.
* **Out of scope by design:** text boxes and LaTeX/Formula, measure calibration, crop/snapshot, image insert, `.paa` annotation lists, CLI parity and a shortcut editor. The tools remain visible with metadata, as in Phase 2.

---

## 11. What Phase 4 should pick up

1. Rebuild-on-export for PDF-backed tabs (page order/deletion, duplicate pages) while preserving outline and links; or move the sidecar to real PDF annotation objects.
2. Text and Formula: caret editing, fit-to-box, LaTeX rendering, and PDF text export.
3. Real measure tool with calibration and unit persistence; snapshot/crop/image insert.
4. PDF annotator interoperability: read/write the factory annotation stream (which would also replace the three twin-art stamps) and `.paa` lists.
5. Autosave UX: quota estimate, failure surface, backup/export of the workspace.
6. Performance: lazy-load the stamp data and PDF engine, virtualise the gallery, split the worker chunk.

---

*Phase 3 deliverable: a usable vector annotation studio with real PDF round-trip. Text and measurement are the next layer.*
