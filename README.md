# PDF Master

A precision glass studio for PDF and paper annotation: vector ink, shapes, text, LaTeX formulas, calibrated measurements, 464 stamps, snapshots, cropping, bookmarks and presentation mode — in the browser, as an installed PWA, or as a desktop window.

PDF Master is a ground-up rebuild of the behaviour and data model of **PDF Annotator 10.0.0.1011**, replacing its Delphi VCL + PDF-XChange stack with React 19, PDF.js and pdf-lib. The design direction is defined in [`.impeccable.md`](./.impeccable.md).

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
npm run preview    # serve dist/ on http://localhost:4173
npm test           # 143 unit tests
```

Requires Node 20+ (developed on Node 26, Windows 11).

---

## Feature tour

### Annotation tools

| Tool | Shortcut | What it does |
|---|---|---|
| Select | `V` | Select, move, resize, rotate, flip, align; `Ctrl+A` selects the page, `Esc` clears. |
| Lasso | `Q` | Freeform selection over ink and shapes. |
| Pen | `P` | Pressure-sensitive vector ink; snapping, scratch-out erase, ink-on-text. |
| Highlighter | `M` | Broad marker with its own property set (never synchronised with the pen). |
| Text | `T` | In-place text boxes with fill, frame and type styles; `Ctrl+B/I/U`, `Ctrl+M` fit. |
| Line / Arrow | `L` / `A` | 15° snapping with `Shift`, 10 arrowhead and tail shapes. |
| Rectangle / Ellipse | `R` / `O` | Fill, opacity and dash styles; `Shift` for square/circle. |
| Polygon | `G` | Click to add points, `Enter` to close. |
| Dimension | `D` | Distance or area with extension lines, editable scale and unit. |
| Stamp | `S` | 464 factory stamps plus your own; drag, resize, rotate, flip. |
| Eraser | `E` | Whole annotation or split strokes; rapid scribble erases ink underneath. |
| Measure | `U` | Distance, perimeter, area, angle, with calibration scales and unit conversion. |
| Formula | `F` | LaTeX via KaTeX, live preview, editable after insertion. |
| Crop | `C` | Crop the visible page box. |
| Snapshot | `Ctrl+Shift+S` | Copy a region, download it, or save it as a custom stamp. |
| Image | `I` | Place PNG, JPEG, WebP or SVG; paste from the clipboard. |
| Hand | `H` | Pan; hold `Space` from any tool. |

### Documents, pages and storage

- Multi-document tabs, per-tab page lists, reorder/duplicate/rotate/delete pages, per-page rotation and crop.
- 129 parametric paper recipes (Blank, Ruled, Squared, Millimetre, Grid) for A4 and Letter, drawn as SVG ink — not images.
- Autosave to IndexedDB, manual `.pmbackup.json` backup (version 2) with tabs, pages, annotations **and** custom stamps, scales, shortcuts, preferences and theme.
- Editable PDF export writes real vector ink, text and shapes plus a `PDFMasterAnnotations` sidecar; flattened export bakes everything into the page tree.
- The page tree is rebuilt on export, so page order, duplicates, crops and rotation survive the round trip.
- Bookmarks and the custom outline are read from imported PDFs and kept in the sidecar across an export/reopen cycle.

### Presentation and output

- Presentation mode (`Ctrl+Shift+P`): full-screen sheet, minimal bottom bar, page stepping.
- Print (`Ctrl+P`, top bar, command palette) prints the active sheet through `@media print`, hiding all chrome.
- PWA manifest with `display: standalone`, `window-controls-overlay` and an inline SVG icon.
- Desktop launch contract compatible with the original: `?new=A4+Landscape&fullscreen=1&print=1`.

---

## PDF Annotator 10 → PDF Master

### Why a rebuild

Phase 1 reconnaissance of the installed product found four stacks glued into one process: a Delphi VCL + DevExpress shell, the closed-source **PDF-XChange Editor SDK 10.8.4.409** (`PDFXEditSimple.x64.dll`, 41.5 MB), **ImageEn 8.1.5.0** for a second imaging path, and an MPRESS-packed executable. The whole application is 93.9 MB across 18 files, with an **8.4 MB XML file** holding 617 tool presets, and annotations persisted as **transparent raster images** at 72–1200 DPI. That is why saving is slow, files bloat, quality depends on a save-time DPI setting, and "melting" annotations exists as a separate command.

PDF Master keeps what was worth keeping — the tool model, presets, stamps, paper recipes and shortcut contract — and replaces the rest with web technology: vector-first, no install-time binary blob, no per-save rasterisation.

### Side-by-side

| Dimension | PDF Annotator 10.0.0.1011 | PDF Master |
|---|---|---|
| Platform | Windows only (x86/x64 native) | Browser, installable PWA, Windows desktop window (Tauri v2) |
| UI stack | Delphi VCL + DevExpress, ~690 bitmap glyphs | React 19 + Tailwind 4, Lucide icons, CSS glass tokens |
| PDF engine | PDF-XChange Editor SDK 10.8.4.409 (closed, GDI) | PDF.js 6 (render) + pdf-lib 1.17 (write), both open |
| Annotation model | Editable sidecar data, saved as transparent images | Vector geometry + images, kept as annotation data and written as vector PDF content |
| Save quality | Fixed by the chosen DPI (72/150/300/600/1200) | Zoom-independent vectors; images at source resolution |
| Install footprint | 93.9 MB, 18 files + language modules | 2.0 MB of JavaScript across 9 chunks (564 kB gzip); 6.9 MB with KaTeX/Inter webfonts |
| Tool presets | 617 presets in an 8.67 MB XML parsed at startup | Same 617 presets and 21 groups, bundled as JSON and split from app code |
| Stamps | 464 GIF stamps hex-encoded inside the XML | 464 PNG stamps in a lazy catalogue chunk, plus user stamps |
| Paper templates | 129 templates in `PAStyleTemplates.xml` | 129 parametric recipes as JSON, drawn as SVG |
| Text | Text boxes rasterised on save | Real PDF text with the same layout model on screen and in export |
| Formulas | LaTeX as ink | KaTeX rendered to PNG at export (same on-screen result) |
| Measurement | Distance/perimeter/area/angle, scale manager | Same four modes, calibrated scale store, unit conversion |
| Persistence | PDF + private editable data; "melt" required | Editable PDF with a `PDFMasterAnnotations` sidecar, or flattened PDF |
| Undo | Per-document history | Ctrl+Z/Ctrl+Y over pages, annotations and document state |
| Themes | Windows/skin based (PA_DARK / PA_LIGHT / PA_W11) | Light, dark and sepia glass themes |
| Shortcuts | Rebindable with conflict detection | Rebindable with conflict detection, per-command reset, backup included |
| Command line | `PDFAnnotator.exe [file] [/print] [/new:"A4 Landscape"] [/fullscreen]` | Same contract as URL query or arguments, via browser or Tauri |
| Updates | Bundled update wizard | Web deployment; desktop build rebuilt from source |

### What carried over

- Tool families, property semantics (mm, opacity, dash, arrowheads), and the "highlighter never syncs" rule.
- Default shortcuts (`Ctrl+O/S/P`, tool letters, `Shift` modifiers) and the rebindable keymap.
- 129 paper recipes, 617 presets, 464 stamps, 21 groups — migrated in Phase 2, not recreated by hand.
- Print, presentation, page operations, bookmarks, measurement scales and the launch contract.
- The visual goal: a professional annotation desk, not a generic web form.

---

## Keyboard shortcuts

| Scope | Shortcut → action |
|---|---|
| File | `Ctrl+O` open · `Ctrl+S` save editable PDF · `Ctrl+P` print |
| Tools | `H` hand · `V` select · `Q` lasso · `P` pen · `M` highlighter · `T` text · `L` line · `A` arrow · `R` rectangle · `O` ellipse · `G` polygon · `D` dimension · `S` stamp · `E` eraser · `U` measure · `F` formula · `C` crop · `Ctrl+Shift+S` snapshot · `I` image |
| View | `Ctrl+K` command palette · `Ctrl+,` settings · `Ctrl+Shift+P` presentation · `0` fit page |
| Edit | `Ctrl+Z` undo · `Ctrl+Y` redo · `Ctrl+A` select page · `Delete` remove · arrow keys nudge |
| Text editing | `Ctrl+B/I/U` bold/italic/underline · `Ctrl+M` fit box · `Ctrl+Enter` commit · `Esc` cancel |
| Modifiers | `Shift` 15° snap / square / circle · `Space` temporary pan · `Esc` cancel polygon/measure |

Every binding is editable in **Settings → Shortcuts**, with duplicate detection and per-action reset.

---

## Desktop builds

### 1. Zero-dependency launcher (no Rust, no install)

`PDFMaster-Desktop.cmd` → `scripts/launch-desktop.ps1`:

- builds `dist/` when missing or stale (or pass `-Rebuild`),
- serves it with Vite preview on port 4173,
- opens it in a **frameless Edge/Chrome `--app` window** at 1440×900 with its own profile (`%LOCALAPPDATA%\PDFMaster\DesktopProfile`),
- closes the preview server when the window exits.

No address bar, no tabs, no Node prompt. Windows only, requires Edge or Chrome.

### 2. Tauri v2 shell (native installer)

Verified with Rust 1.98.1 (`cargo check` finishes clean).

```bash
winget install Rustlang.Rustup      # once, then reopen the terminal
npm install
npm run build
npx @tauri-apps/cli dev             # development window (loads Vite on 5173)
npx @tauri-apps/cli build           # MSI/NSIS installer + executable
```

`src-tauri/tauri.conf.json`:

- product name **PDF Master**, identifier **com.pdfmaster.desktop**,
- 1440×900 window, minimum 1024×680, centred, resizable, drag-and-drop enabled,
- `frontendDist: ../dist`, `devUrl: http://localhost:5173`,
- bundle target `all` with 32/128/256 px PNG, `.ico` and `.icns` icons.

`src-tauri/src/main.rs` forwards arguments (`--new "A4 Landscape" --fullscreen --print`) into the same query contract the web build understands. Icons are generated from the app mark with `python scripts/make_icons.py` (Pillow); rerun it after changing the logo.

---

## Launch contract (browser and desktop)

| Intent | URL | Arguments |
|---|---|---|
| New paper, portrait | `?new=A4` | `--new "A4"` or `/new:"A4"` |
| New paper, landscape | `?new=A4+Landscape` | `--new "A4 Landscape"` |
| Presentation | `?fullscreen=1` | `--fullscreen` |
| Print on open | `?print=1` | `--print` |

- Paper names resolve to the least busy matching recipe (`Blank` → `Ruled` → `Squared` → `Grid`); A4 has a Blank recipe, Letter resolves to a Letter ruled/squared recipe.
- Flags accept `1/true/yes/on`; `0`/`no` keep them off. Empty values are ignored.
- Both spellings (`--flag`, `/flag`, `flag=value`) are parsed by the same tested parser (`src/lib/bootArgs.ts`).

---

## Architecture

### Stack

| Layer | Libraries |
|---|---|
| UI | React 19, Tailwind CSS 4, Lucide icons, Inter Variable |
| State | Zustand 5 stores (documents, tools, annotations, UI) |
| PDF read | PDF.js 6 (`pdfjs-dist`) |
| PDF write | pdf-lib 1.17 |
| Ink | Local quadratic-ribbon engine (`src/lib/ink.ts`), no ink dependency |
| Formulas | KaTeX |
| Build | Vite 8, TypeScript 7 |
| Tests | Vitest 5 (unit), Playwright/Chromium (headless E2E, run ad hoc) |

### Directory map

```
src/
  App.tsx                  shell: layout, shortcut router, boot args, autosave, export
  components/
    TopBar, Sidebar, ToolBar, Inspector, StatusLine, ZoomPill
    CommandPalette, SettingsModal, NewDocumentModal, StampGallery, PresetGallery
    PresentationBar, ThemeSwitcher
    canvas/
      PaperViewport        pan/zoom/fit, page stage
      PaperSheet           SVG paper recipe
      PdfBackground        rasterised source page
      AnnotationLayer      drawing, selection, snapshot, tools
      SelectionOverlay     handles and mini action bar (Save as stamp, …)
      TextView/TextEditor, FormulaView/FormulaEditor
      MeasureOverlay, CropOverlay, SnapshotBar
    ui/controls.tsx        shared chips, switches, segmented controls
  stores/                  useDocStore, useToolStore, useAnnotationStore, useUIStore
  lib/
    pdfEngine              inspect, render, export, sidecar (encode/load)
    annotationTypes, annotationGeometry, textLayout, ink, paper, pageUtils
    presets, data, tools, sync, images, raster, formula
    measure, customStamps, prefs, shortcuts, bootArgs
    storage               IndexedDB autosave, v1/v2 workspace backups
  data/                    617 presets, 464 stamps, 129 paper recipes, 21 groups
src-tauri/                 Tauri v2 shell (config, capabilities, icons, Rust entry)
scripts/                   launch-desktop.ps1, make_icons.py, conversion tooling
public/                    manifest.webmanifest, icon.svg, stamp assets
```

### Data flow

1. **Open** — PDF.js renders the source page into a canvas; `inspectPdf` reads page sizes and outline entries; the sidecar is restored if present.
2. **Annotate** — the SVG annotation layer keeps geometry in page millimetres; zoom scales the wrapper, never the data.
3. **Autosave** — documents and annotations are written to IndexedDB; preference stores (stamps, scales, shortcuts, prefs, theme) live in `localStorage`.
4. **Export** — `exportPdf` rebuilds the page tree, draws paper, annotations and rotation, then embeds either the editable sidecar or flattened content.
5. **Backup** — `workspaceBackup` collects documents plus every preference store into a version 2 `.pmbackup.json`.

### Persistence

| Layer | Key / file | Holds |
|---|---|---|
| IndexedDB `pdf-master/workspace/current` | `current` meta + one record per tab id | tab order/active id, then each tab's pages and annotations |
| IndexedDB `pdf-master/pdf-blobs` | tab id | imported PDF bytes, kept out of the structural save |
| `localStorage` | `pm.customStamps`, `pm.measure.scales`, `pm.measure.active`, `pm.shortcuts`, `pm.prefs`, `pa.theme` | studio preferences |
| PDF sidecar | `/PDFMasterAnnotations` info key, `pm1:` + base64 JSON | page map, annotations, bookmarks |
| Workspace backup | `*.pmbackup.json` (version 2) | everything above |

Version 1 backups (tabs only) still import; missing stores are left untouched.

---

## Testing and verification

| Check | Command | Result |
|---|---|---|
| Type-check | `npx tsc -b` | clean |
| Unit tests | `npm test` | 21 files, 143 tests passing |
| Production build | `npm run build` | clean, no warnings, 997 ms |
| Tauri shell | `cargo check` (in `src-tauri`) | `Finished dev profile` |
| Headless E2E | Chromium via Playwright | 28/28 checks, 0 console/page errors |

The E2E pass covers: PWA manifest, drawing ink, selection → save as stamp, stamp-tool switch, v2 backup export, backup import restoring stamps/scales/shortcuts/preferences/theme, `Ctrl+P` firing print, `@media print` hiding the chrome, `?new=Letter+Landscape&fullscreen=1` boot, and `?print=1`.

Unit coverage includes annotation geometry, text layout, ink paths, measurement conversion, shortcut normalisation/conflicts, PDF export and sidecar round-trips (including bookmarks and non-WinAnsi text), boot-argument parsing, workspace backup round-trips and malformed/remote-URL rejection, document-wide search and cancellation, per-mode save handles, custom-stamp conflict resolution, and store-level undo/selection.

---

## Known limitations

- **Formula export is raster.** KaTeX depends on fonts/styles that do not load inside the isolated SVG raster document; native MathML renders at the cost of a PNG. Text stays vector.
- **Bookmarks are sidecar-only.** pdf-lib has no outline API, so custom bookmarks survive reopen and export but are not written as `/Outlines`; other readers see the original outline only.
- **Letter has no Blank recipe** in the migrated data; `?new=Letter` resolves to a ruled or squared Letter sheet.
- **Print uses the DOM print pipeline**, so hidden PDF canvas fragments that have not painted print blank; pages are rasterised at a 2× floor to keep them sharp.
- **Crop handles assume an unrotated viewer.** 0°/180° are exact; 90°/270° use the rotated screen box and can feel slightly off at high zoom.
- **Snapshot capture is best-effort** for PDF pages that have not painted yet.
- **Desktop windows are Chromium** (WebView2 for Tauri, Edge/Chrome for the launcher); Safari/Firefox are untested.
- **Stamp catalogue is one ~569 kB chunk** (59 kB gzip); the Vite warning limit is raised to 600 kB rather than lazy-loading synchronous stamp lookup everywhere.
- **Older compressed exports may lose annotations on import.** The sidecar byte scan only finds the `PDFMasterAnnotations` key in uncompressed exports; files written before this change can open without their editable annotations.

---

## Project documents

| File | Contents |
|---|---|
| [`PHASE_1_RECON_REPORT.md`](./PHASE_1_RECON_REPORT.md) | Binary/resource analysis of PDF Annotator 10, feature and command-line matrix |
| [`PHASE_2_REPORT.md`](./PHASE_2_REPORT.md) | Asset migration and data model |
| [`PHASE_3_REPORT.md`](./PHASE_3_REPORT.md) | Core editor: canvas, ink, shapes, selection, zoom, export |
| [`PHASE_4_REPORT.md`](./PHASE_4_REPORT.md) | Text, formulas, measurement, snapshot, images, crop, export rebuild |
| [`PHASE_5_FINAL_REPORT.md`](./PHASE_5_FINAL_REPORT.md) | Gap closure, desktop packaging, design system, final verification |
| [`PHASE_6_AUDIT_FIX_REPORT.md`](./PHASE_6_AUDIT_FIX_REPORT.md) | Audit fixes, persistence hardening, export correctness |
| [`PHASE_7_UI_OVERHAUL_REPORT.md`](./PHASE_7_UI_OVERHAUL_REPORT.md) | Tool rail, popovers, drawers, favorites dock, ink studio |
| [`PHASE_8_REPORT.md`](./PHASE_8_REPORT.md) | Popover polish, shapes studio, crop bar, 15 audit fixes |
| [`PHASE_17_REPORT.md`](./PHASE_17_REPORT.md) | Ink, pinch zoom, favourites, snapshot capture, combine dialog |
| [`PHASE_18_REPORT.md`](./PHASE_18_REPORT.md) | 20 audit fixes: save modes, landscape export, virtualization, Unicode, persistence |
| [`.impeccable.md`](./.impeccable.md) | Design direction, tokens, component grammar, anti-patterns |
| [`src/data/migration_manifest.json`](./src/data/migration_manifest.json) | Provenance and checksums for every migrated asset |

The 464 stamps are the original artwork converted from hex GIF to PNG during the offline migration; PDF Master ships no code from PDF Annotator.
