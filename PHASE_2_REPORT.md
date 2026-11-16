# PHASE 2 — Data Migration, Application Scaffold & Glass Shell

**Project:** PDF Master (redesign of PDF Annotator 10.0.0.1011)
**Branch:** `main` · **Date:** 2026-11-17
**Scope:** complete port of the factory/user data model, a production-ready Vite + React + TypeScript shell, the parametric paper engine, and the Separate/Synchronous property contract. Annotation drawing, PDF I/O and persistence are explicitly Phase 3.

---

## 1. What shipped

| Area | Result |
|---|---|
| Preset migration | **617** presets in **21** groups (49 Pen, 26 Marker, 30 Text, 464 Stamp, 48 Graphical) |
| Stamp migration | **464** factory stamp records, **461** raster PNGs, bilingual EN/DE titles |
| Paper migration | **129** parametric recipes (1 Blank, 48 Ruled, 54 Squared, 8 Millimeter, 18 Grid) |
| Note PDFs | **2** (`Notes_IMPERIAL.pdf`, `Notes_METRIC.pdf`) |
| User stamps | **396** `.pai` stamps from `%LOCALAPPDATA%\PDF Annotator\10.0\Tools`, 396 PNGs |
| Migration gates | **15** machine gates, `allPassed: true` in `src/data/migration_manifest.json` |
| App | Vite 8.3.8 · React 19.3.1 · TypeScript 7.0.2 · Tailwind 4.3.5 · zustand 5.1.0 · lucide-react 1.73.0 |
| Verification | `tsc -b` clean · `vitest` 6/6 · `vite build` succeeds (861 kB JS, 150 kB gzip) |
| UI | Apple-style glass shell, 3 themes, 18 tools, preset drawers, 464-stamp gallery, 4-tab sidebar, Ctrl+K palette, presentation mode |

The retired stack from Phase 1 — `PDFXEditSimple.x64.dll`, GDI rasterization, MPRESS-packed DevExpress icons — is not referenced anywhere in the new app. Every visual is vector (SVG/lucide) or migrated bitmap art.

---

## 2. Migration verification

### 2.1 Pipeline

```
scripts/convert/
├── common.py                 shared readers, TColor/length/bool normalizers, JSON writer
├── 01_extract_presets.py     .pat XML → presets.json + groups.json
├── 02_extract_stamps.py      InkData hex → GIF → PNG, art fallbacks, stamps.json
├── 03_extract_templates.py   PAStyleTemplates.xml → paper_templates.json; .pap → PDFs
├── 04_extract_user_assets.py user .pai → PNG; user_stamps.json
├── 05_build_manifest.py      source hashes, 15 gates, 20-preset round-trip diff
└── run_all.py                runs 01 → 03 → 04 → 02 → 05
```

`02` runs after `04` because stamp art falls back to the user folder's `_48.bmp` thumbnails. Run order is documented in `run_all.py`, not implied by file numbers.

### 2.2 Normalization rules (as built)

| Source | Encoding | Target |
|---|---|---|
| `Color`, `BackColor`, `Fontcolor`, `TextboxColor`, `TextboxFrameColor` | Delphi `TColor` `0x00BBGGRR`; `clNone = 536870911`; `0x20xxxxxx` system colours | `{ hex: "#RRGGBB", transparent, system }` |
| `Thickness`, `LineWidth` | 1/100 mm | `thicknessMm` / `lineWidthMm` float |
| `Sensitivity`, `Snapping`, `Grouped`, `Style*` | `True`/`False` | boolean |
| `LineStyle` | 0 solid, 1 dash, 2 dot, 3 dash-dot, 5 dash-dot | `LineStyleName` |
| `TypeCode` | 0 Line, 1 Arrow, 2 Rectangle, 3 Ellipse, 6 Dimension | `typeName` on graphical presets |
| `InkTransparency` | percent | `inkTransparency` |
| `Category`, `GroupID`, `Position` | taxonomy | `category`, `groupId`, `groupSlug`, `position` |

Preset ids are `{family}-{groupSlug}-{ordinal}`. The per-group ordinal is used because `Position` repeats inside the 464-entry Stamps group; ids are therefore stable and unique (gate: `preset ids unique = 617`).

### 2.3 Gates (all pass)

| Gate | Expected | Actual |
|---|---|---|
| groups | 21 | 21 |
| presets | 617 | 617 |
| presets by family | 49/26/30/464/48 | 49/26/30/464/48 |
| preset ids unique | 617 | 617 |
| stamps | 464 | 464 |
| stamp titles localized (en+de) | 464 | 464 |
| paper recipes | 129 | 129 |
| paper styles | blank 1, line 48, karo 54, mm 8, grid 18 | same |
| paper page sizes | A4, Letter | A4, Letter |
| stamp PNG files | 461 | 461 |
| stamp PNG integrity | no failures | no failures |
| user stamp PNG files | 396 | 396 |
| note template PDFs | 2 | 2 |
| note PDFs are PDFs | no failures | no failures |
| preset round-trip sample (20) | empty diff | empty diff |

Source files are pinned by SHA-256 in `migration_manifest.json`: `PADefaultToolData.pat` (8,670,888 B), `PADefaultTemplates.pap` (1,035,841 B), `PAStyleTemplates.xml` (37,691 B), `user/paStampTools.xml` (83,864 B).

### 2.4 Stamp art provenance

The factory GIF stubs are not usable art in most cases — the images are serialized annotation streams inside GIF comment extensions. Resolution order:

| Source | Count | Meaning |
|---|---|---|
| `app-thumbnail` | 377 | matched PDF Annotator's own `_48.bmp` 48 px renders by `(name, inkWidth, inkHeight)` |
| `gif-raster` | 66 | real raster payloads (proofreading marks) |
| `generated-text` | 18 | German stamps re-rendered typographically from their English twin, ink colour and size preserved |
| `missing` | 3 | `Doppelbogen` ×2, `Lachender Smiley`; raw `vectorInkBytes` kept in `stamps.json` |

The UI reports 461 factory stamps because records without a PNG are filtered from the gallery. No data is discarded.

### 2.5 Regenerating

```bash
npm run migrate        # python scripts/convert/run_all.py
```

Requires Python 3 with Pillow and a local PDF Annotator install. The generated JSON and PNGs are checked in, so a fresh clone can build without the source install.

---

## 3. Repository tree

```
PDF Master/
├── index.html                      inline SVG favicon, #root mount
├── package.json                    dev / build / preview / test / migrate
├── vite.config.ts                  react + tailwind plugins, port 5173
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── scripts/convert/                migration pipeline (see §2)
│   └── reverse/                    ink-format probes kept for Phase 3 decoder work
├── public/assets/
│   ├── stamps/                     461 factory PNGs
│   ├── user_stamps/                396 user PNGs
│   └── templates/                  Notes_METRIC.pdf, Notes_IMPERIAL.pdf
└── src/
    ├── main.tsx                    font import, React root
    ├── App.tsx                     shell layout, global shortcuts, presentation switch
    ├── index.css                   theme tokens, glass, controls, scrollbars, motion
    ├── data/                       groups.json, presets.json, stamps.json,
    │                               paper_templates.json, user_stamps.json,
    │                               migration_manifest.json
    ├── lib/
    │   ├── types.ts                Preset, PaperTemplate, ToolProps, DocumentTab…
    │   ├── data.ts                 typed imports + lookup maps (paperById, groupById…)
    │   ├── presets.ts              family/type queries, preset→ToolProps patch, swatches
    │   ├── sync.ts                 Separate/Synchronous engine
    │   ├── sync.test.ts            6 vitest cases
    │   ├── paper.ts                mm geometry, grid path builder, fit scale
    │   └── tools.ts                18 tool metadata, toolbar groups, zoom steps
    ├── stores/
    │   ├── useUIStore.ts           theme (persisted), sidebar, palette, library, modal
    │   ├── useDocStore.ts          tabs, template, zoom, fit mode, page
    │   └── useToolStore.ts         active tool, per-tool props, presets, stamp choice
    └── components/
        ├── TopBar.tsx              brand, doc tabs, zoom, guides, library, palette, theme
        ├── ToolBar.tsx             floating glass rail + shapes flyout
        ├── StatusLine.tsx          template, size, page, zoom, active-tool hint
        ├── Inspector.tsx           tool header, presets/live controls or stamp gallery
        ├── PresetGallery.tsx       factory presets grouped by source group, live swatches
        ├── PropertyControls.tsx    colour, width, opacity, fill, style, arrowheads, type
        ├── StampGallery.tsx        search + group chips + 857-item gallery
        ├── StampLibrary.tsx        modal variant of the gallery
        ├── Sidebar.tsx             Pages / Bookmarks / Annotations / Favourites
        ├── CommandPalette.tsx      Ctrl+K, 157 commands (tools, actions, paper)
        ├── NewDocumentModal.tsx    129 recipes, filters, thumbnails, note PDFs
        ├── PresentationBar.tsx     page nav + deduped Category 6 presets
        ├── ThemeSwitcher.tsx       Apple Light / Apple Dark / Sepia
        ├── ZoomPill.tsx            zoom out / fit-cycle / zoom in
        ├── toolIcons.tsx           one lucide glyph per tool, 1.75 px stroke
        ├── ui/controls.tsx         Segmented, Switch, SliderRow, ColorRow, SectionTitle
        └── canvas/
            ├── PaperSheet.tsx      parametric SVG paper renderer
            └── PaperViewport.tsx   pan, zoom-to-cursor, fit page/width, aux overlay
```

Architecture is one-directional: `data → lib → stores → components`. Components never read JSON directly except through `lib/data.ts` maps; all mutable state lives in the three zustand stores.

---

## 4. Separate vs. Synchronous contract

Implemented in `src/lib/sync.ts` and enforced by `useToolStore.setProps` / `selectPreset`.

| Property | Synchronised tools |
|---|---|
| Colour | Pen, Text, Formula, Line, Arrow, Rectangle, Ellipse, Polygon, Dimension |
| Line width / thickness | same nine tools |
| Line style | Line, Arrow |
| Fill | Rectangle, Ellipse, Polygon |
| Opacity | Rectangle, Ellipse, Polygon |
| — | **Highlighter/Marker is never synchronised, in either direction** |

Rules:

1. Default is **Separate**, matching the factory default in `opttoolproperties.htm`; the switch enables Synchronous.
2. With Separate active, every edit touches only the active tool.
3. The Marker branch in the inspector replaces the switch with an explanatory note, so the invariant cannot be broken through the UI.
4. Preset selection goes through the same engine, so picking a Pen preset updates every synchronised tool's colour/width but never the Marker.

`sync.test.ts` covers the six behaviours: field scoping, sync on/off, marker exclusion in both directions, unknown field fallback, and immutability of the input map.

---

## 5. Paper engine

`src/components/canvas/PaperSheet.tsx` + `src/lib/paper.ts` render every recipe as live SVG; no paper bitmaps are stored.

* Page geometry: A4 210 × 297 mm, Letter 215.9 × 279.4 mm, landscape by swapping axes from each recipe's `page.landscape`.
* Recipe → three paths (`base`, every 5th line, every 10th line) so `HighlightMinor=5` / `HighlightMajor=10` on the 8 millimetre recipes is exact, not approximated.
* `line` style rules horizontally only (`DeltaY`); `karo`, `mm` and `grid` rule both axes (`DeltaX`/`DeltaY` or a single `Delta`).
* Margins (`Bounds`) offset the ruled area; only 55 of 129 recipes carry bounds.
* Screen strokes use `vector-effect="non-scaling-stroke"` at 0.7 / 0.9 / 1.1 px so 0.1 mm rules stay visible from 10 % to 600 % zoom.
* All 129 recipes are reachable through the New Document modal, with size/style filters, search, per-page previews and the 2 note PDFs listed as downloadable templates.

Viewport behaviour:

| Interaction | Result |
|---|---|
| Ctrl/⌘ + wheel | zoom about the cursor, 10 %–600 % |
| Wheel / trackpad | pan |
| Space + drag, middle-drag, Hand tool | pan |
| Double-click | fit page |
| Zoom pill | 25 %…400 % steps, fit-page → fit-width → 100 % cycle |
| Alignment guides toggle | dashed centre lines, plus the margin rectangle when the recipe has bounds (non-printing, SVG only) |

Switching template, tab, orientation or window size re-fits automatically; manual zoom clears the fit mode so the page is not snapped back.

---

## 6. UI shell

* **Top bar** — sidebar toggle, gradient mark, document tabs with close buttons, new-document +, zoom pill, alignment guides, stamp library, command palette, presentation mode, theme switcher.
* **Sidebar** (248 px, rail 44 px when collapsed) — Pages (live paper preview, orientation, guides, template link, paper-style counts), Bookmarks, Annotations, Favourites (recent stamps).
* **Tool rail** — 18 tools in four groups; the shape button becomes the active shape's icon and opens a flyout for Line/Arrow/Rectangle/Ellipse/Polygon/Dimension.
* **Inspector** (316 px, hidden below 1024 px) — tool header with shortcut; for drawing tools: factory presets grouped by source group, live controls, Separate/Synchronous switch. For Stamp: selected-art card + searchable 857-item gallery (461 factory + 396 user) with group chips. For non-drawing tools: document facts and migration totals.
* **Command palette** — Ctrl+K, 157 commands (tools, actions, 129 paper recipes), keyboard navigation, grouped results; identical recipes such as the six "A4 Ruled 9 mm" variants are distinguished by their recipe detail (colour/margins).
* **Presentation mode** — canvas only, page navigation, deduped Category 6 presets (Pen 0.68 mm, Marker 16 mm, Text Arial 10), Esc to exit.
* **Themes** — Apple Light, Apple Dark, Sepia. Tokens live in `src/index.css`; the choice is stored in `localStorage` under `pa.theme` and applied on `documentElement[data-theme]`.
* **Shortcuts** — single-key tools (H, V, Q, P, M, T, L, A, S, E, U, F, C), +/- zoom, 0 fit page, PageUp/PageDown, Ctrl+K palette, Esc closes the topmost layer.

Glass is real backdrop blur over a tinted radial-gradient background, with inset highlights and layered shadows; every control has a visible `:focus-visible` ring and `prefers-reduced-motion` disables transitions.

---

## 7. Verification performed

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc -b` | no errors, no unused locals |
| Unit | `npm test` | 6/6 pass (`sync.test.ts`) |
| Production build | `npm run build` | success; 2,121 modules; 861 kB JS / 150 kB gzip |
| Migration | `python scripts/convert/run_all.py` | 15/15 gates, `allPassed: true` |

Browser pass (headless Chrome via `playwright-core`, 1440 × 900):

* preset selection updates the active tile and live ink controls;
* Marker shows the never-synchronised note and no switch;
* Ctrl+K → "ruled 9" opens the correct recipe tab, with six distinct hints;
* stamp library opens, search filters, selection updates the inspector card, gallery tiles render at 74 px with real art;
* presentation mode shows exactly three deduped presets;
* Sepia theme re-tints surfaces and paper;
* New Document filter + "Use template" replaces the active tab;
* zero console errors, zero failed requests, favicon served inline.

Known build warning: the single JS chunk exceeds Vite's 500 kB advisory because all four JSON datasets (≈840 kB) are bundled for instant search. Acceptable for a local-first desktop app; code-splitting the palette/stamp gallery is the obvious Phase 3 trim if startup time matters.

---

## 8. Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # tsc -b && vite build
npm run migrate    # optional; regenerates data from the installed PDF Annotator
```

Requirements: Node 20+ (developed on Node 26), npm 10+. No backend, account, licence server or network access is needed at runtime.

Useful first steps in the app: press `Ctrl+K`, type `millimeter`, Enter; open the stamp library from the top bar; switch themes from the top-right control; toggle the alignment guides to see margins of bounded recipes.

---

## 9. What Phase 3 needs

1. **Annotation model + canvas interaction.** `PaperSheet` is currently a read-only SVG; Phase 3 adds an annotation layer with hit-testing in millimetres, transforms that survive zoom, selection handles, lasso, align/distribute, rotate/flip and z-order. Tool properties already exist in `useToolStore` — drawing must consume them through `presets.ts`/`sync.ts`, not duplicate them.
2. **PDF open/render/export.** Replace the retired `PDFXEditSimple.x64.dll`; commit to either a WASM engine (pdf.js + annotation export) or a native sidecar. Annotations must round-trip to PDF, including flatten/melt at 72–1200 dpi.
3. **Ink decoder for the remaining 3 stamps.** `stamps.json` preserves `vectorInkBytes` for `Doppelbogen` ×2 and `Lachender Smiley`. `scripts/convert/reverse/` contains the format probes and `table.json`; `inventory.py` re-extracts payloads. Decoding to SVG would also let every stamp scale losslessly.
4. **Persistence.** Document tabs, annotation lists and user preferences need a durable store (IndexedDB or file-based), plus autosave/backup and the three persistence modes (always editable / editable until saving / not editable).
5. **Text & formula editing.** Real text boxes with caret, alignment, sub/superscript, fit-to-box (Ctrl+M) and LaTeX rendering; the current Text/Formula presets and controls are wired but not placed.
6. **Measure, snapshot, crop, eraser, image insert.** These 5 tools are present in the rail with metadata only; each needs its own interaction and output pipeline.
7. **Import/export of existing user data.** `.paa` annotation lists, `.pai` stamp creation, stamp-from-selection, and the `PDFAnnotator.exe` command-line contract (`/print`, `/new:"A4 Landscape"`, `/fullscreen`).
8. **Shortcut editor and settings.** Current shortcuts are hardcoded; the factory supports rebinding with conflict detection, plus units, save quality, gestures and language (EN/DE/FR). Labels already carry EN/DE for stamps and groups.
9. **Performance.** Virtualize the 857-item gallery and 157-command palette when the datasets grow, and split the bundles listed in §7.

Deliberately not attempted in Phase 2 (named, not silently dropped): PDF rendering, annotation storage, printing, licensing/telemetry, the opaque `PAGlobalConfig.cfg`, and language switching of the UI chrome.

---

## 10. Notes and risks

* **Art provenance.** 377 stamps use the application's own 48 px thumbnails because the factory GIF payload is a serialized annotation stream. They are faithful at gallery and placement size but are not vector; the Phase 3 decoder removes that limit.
* **Generated German stamps.** 18 typographic re-renders match size and ink colour but not pixel-for-pixel glyph shapes. They are flagged `artSource: "generated-text"` so they can be replaced later.
* **`InkData` payloads are proprietary.** The migration stores only extracted PNGs and metadata needed by this app; no original installer binaries are redistributed.
* **Marker semantics.** Keeping Marker out of the sync engine in both directions is intentional and tested; changing it would diverge from the factory contract.
* **Data volume in git.** `public/assets` and `src/data` are tracked (≈2.4 MB + 0.8 MB) so a clone runs without the original installer. `npm run migrate` remains the source of truth.

---

*Phase 2 deliverable: migration + scaffold + shell + paper engine. Phase 3 starts at the annotation layer.*
