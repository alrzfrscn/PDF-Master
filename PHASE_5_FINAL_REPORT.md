# Phase 5 report — gap closure, desktop packaging, final verification

Date: 2026-11-17
Scope: `D:\Project\PDF Master` (branch `main`, HEAD `cb1a3cf`, Phase 5 changes uncommitted)
Result: all Phase 4 §4 gaps closed or documented, desktop packaging added, design direction written, type-check clean, 47 tests passing, production build clean, `cargo check` clean, 28/28 headless E2E checks with 0 console errors.

---

## 1. What was delivered

### 1.1 Complete workspace backup (version 2)

`.pmbackup.json` used to carry tabs, pages and annotations only. It now also carries every studio preference store, and restores all of them:

| Section | Source | Restore path |
|---|---|---|
| `customStamps` | `pm.customStamps` | `useCustomStampStore.restore()` |
| `customScales`, `activeScaleId` | `pm.measure.scales`, `pm.measure.active` | `useScaleStore.restore()` |
| `shortcuts` | `pm.shortcuts` | `useShortcutStore.replace()` (normalised, gaps filled from defaults) |
| `prefs` | `pm.prefs` | `usePrefsStore.replace()` |
| `theme` | `pa.theme` | `useUIStore.setTheme()` |

- `storage.ts` exports `WorkspaceStores`, `collectWorkspaceStores()` and `applyWorkspaceStores()`.
- Version 1 backups still import; an absent `stores` block leaves current preferences untouched.
- Restores validate each entry (stamp id/image/size, scale denominator, known theme), so a corrupted file cannot poison the stores.
- Settings copy now states that backups carry stamps, scales, shortcuts, preferences and theme.

### 1.2 Selection → Save as stamp

- The selection mini-bar action rasterises the selected bounds through the existing `raster.ts` capture path (PNG data URL).
- The stamp is added to the custom library, the snapshot bar reports “Saved to stamps”, the toast confirms it, and the stamp tool becomes active so the stamp is ready to place.
- `AnnotationLayer.saveStampFrom()` now returns a boolean so failure to capture does not switch tools or show a success message.

### 1.3 Print

- New `print` shortcut action with default `Ctrl+P`, wired through the central shortcut resolver.
- Three entry points: `Ctrl+P`, the printer icon in the top bar, and “Print current page” in the command palette.
- `@media print` in `index.css` hides `.top-bar`, `.sidebar`, `.tool-rail`, `.inspector`, `.status-line`, `.selection-chrome`, `.snapshot-bar`, `.crop-overlay`, `.presentation-bar`, tooltips and fixed overlays; it flattens `.viewport`, `.page-stage` and `.page-paper` so only the active sheet reaches paper.
- Semantic class names were added to those components so print styles target structure, not Tailwind utility accidents.
- PDF page raster resolution now has a 2× floor (`PdfBackground`), keeping printed source pages sharp when zoomed out.

### 1.4 Bookmarks across the export round-trip

- `PdfExportInput` and `SerializedDocument` gained an optional `bookmarks` array; `exportInputFromTab()` forwards `tab.pdf.bookmarks`; `serializedFromInput()` writes them into the editable sidecar.
- `useDocStore.openPdfBytes()` prefers sidecar bookmarks (including user-created ones and their ids) over the re-read source outline.
- Covered by a new unit test: editable export keeps the array, flattened export carries no sidecar.
- Deliberate limit: bookmarks are not written as `/Outlines` (pdf-lib has no outline API; hand-writing the dictionary risks corrupting the catalogue). They survive reopen and export through PDF Master, which was the Phase 4 requirement.

### 1.5 Boot contract (CLI and URL)

`src/lib/bootArgs.ts`, shared by the web and desktop builds:

| Input | Result |
|---|---|
| `?new=A4+Landscape&fullscreen=1&print=1` | paper request, presentation, print |
| `--new "A4 Landscape" --fullscreen --print` | same |
| `/new:"A4 Landscape" /fullscreen /print` | same (original launcher spelling) |
| `--print=0`, `--fullscreen=no` | stays off |
| unknown paper (`B5`) | no new tab, app still boots |

- `resolvePaperTarget()` prefers an exact recipe name, then the least busy style for the requested size (`Blank → Ruled → Squared → Grid`) and applies the requested orientation.
- `App.tsx` applies the request after workspace restore: opens the requested sheet, enters presentation, or waits 500 ms then calls `window.print()`.

### 1.6 PWA metadata

- `public/manifest.webmanifest`: `display: standalone`, `display_override: ["window-controls-overlay", "standalone"]`, standalone scope, categories, light/dark theme colours, inline SVG icon for `any` and `maskable`.
- `public/icon.svg`: the app mark as a scalable icon (no raster dependency).
- `index.html`: manifest link, light/dark `theme-color`, application name, iOS/Android web-app flags, description.

### 1.7 Tauri v2 desktop shell

`src-tauri/` contains a complete, `cargo check`-verified scaffold:

- `tauri.conf.json`: product “PDF Master”, identifier `com.pdfmaster.desktop`, 1440×900 window, min 1024×680, centred/resizable/drag-drop, `frontendDist: ../dist`, dev server on 5173, bundle target `all`, icon set, category and descriptions.
- `Cargo.toml` / `build.rs` / `capabilities/default.json` / `.gitignore`.
- `src/main.rs`: forwards `--new`, `--fullscreen` and `--print` into the same query contract, percent-encoding values so `A4 Landscape` survives into the webview.
- `icons/`: 32/128/256/512 PNG, `icon.ico`, `icon.icns`, generated from the same mark by `scripts/make_icons.py` (Pillow).
- Verified with Rust 1.98.1: `Finished dev profile [unoptimized + debuginfo] target(s) in 1.33s`.

### 1.8 Zero-dependency desktop launcher

- `PDFMaster-Desktop.cmd` calls `scripts/launch-desktop.ps1`.
- The script rebuilds `dist/` when stale or missing (or with `-Rebuild`), starts the Vite preview server on port 4173 if not already running, and opens a frameless Edge/Chrome `--app` window at 1440×900 with a dedicated profile under `%LOCALAPPDATA%\PDFMaster\DesktopProfile`.
- The server is stopped when the window closes; PowerShell syntax was validated with the built-in parser.

### 1.9 Design direction

`.impeccable.md` defines the “Apple macOS Sequoia / iPadOS Freeform & Preview precision glass studio” direction: personality traits, spatial/radius/density rules, the three theme token sets with usage rules, type scale, glass/light/paper recipes, motion timings, component grammar, accessibility rules, anti-patterns and a review checklist.

### 1.10 Accessibility and layout audit

Headless audit of the production build at 1440×900:

- 124 buttons, **0 unnamed** (each has text, `aria-label` or `title`).
- All icon-only controls carry an accessible name; the heuristic flagged eight chip buttons that are text-labelled (“Prev”, “Next”, “Change template”, paper-style counts), not icon-only.
- **CLS 0** over the load and first interaction window; no layout shift entries.
- All chrome uses `:focus-visible` outlines; print and reduced-motion paths remain intact.

---

## 2. Verification run

| Check | Command | Result |
|---|---|---|
| Type-check | `npx tsc -b` | clean, no output |
| Unit tests | `npm test` | 8 files, **47 tests passed** (615 ms) |
| Production build | `npm run build` | clean, **990 ms**, no warnings |
| Bundle | `dist/assets` | 9 JS chunks, 2.03 MB raw, **564 kB gzip**; `stamp-data` 569.02 kB → 59.49 kB gzip |
| Tauri | `cargo check` in `src-tauri` | `Finished dev profile … in 1.33s` |
| Headless E2E | Playwright/Chromium on `dist` | **28/28 checks**, 0 console errors, 0 page errors |
| Accessibility/layout | Playwright audit script | 0 unnamed buttons, CLS 0 |
| Launcher syntax | PowerShell parser | `launcher syntax OK` |

E2E coverage (all passing):

1. PWA manifest served as standalone and requests window-controls-overlay.
2. Paper sheet renders at the expected size.
3. Drawing ink creates a selection; “Save as stamp” produces one custom stamp and selects the stamp tool.
4. Backup export is version 2 and carries tabs, custom stamps, shortcut table (including `print: Ctrl+P`), preferences and theme.
5. Editing that file then importing it restores both stamps, one calibrated scale, rebound pen shortcut, `snapshotDpi: 300`, and dark theme (localStorage + `data-theme`).
6. `Ctrl+P` calls the print path exactly once.
7. `@media print` hides top bar, sidebar, tool rail, inspector and status line, and unpositions the page stage.
8. `?new=Letter+Landscape&fullscreen=1` opens a landscape Letter sheet, enters presentation, and creates a tab titled “Letter Landscape”.
9. `?print=1` runs the print path on boot.

---

## 3. Files

New:

- `src/lib/bootArgs.ts`, `src/lib/bootArgs.test.ts`
- `src/lib/storage.test.ts`
- `.impeccable.md`, `README.md`, `PHASE_5_FINAL_REPORT.md`
- `public/icon.svg`, `public/manifest.webmanifest`
- `PDFMaster-Desktop.cmd`, `scripts/launch-desktop.ps1`, `scripts/make_icons.py`
- `src-tauri/` (`tauri.conf.json`, `Cargo.toml`, `build.rs`, `capabilities/default.json`, `.gitignore`, `src/main.rs`, `icons/*`)

Modified:

- `src/lib/storage.ts` (v2 backup, store collect/apply), `customStamps.ts`, `measure.ts`, `prefs.ts`, `shortcuts.ts` (restore + print action)
- `src/lib/pdfEngine.ts`, `pdfEngine.test.ts` (sidecar bookmarks)
- `src/stores/useDocStore.ts` (sidecar bookmark preference), `useUIStore.ts` (DOM-safe theme setter)
- `src/App.tsx` (boot args, print routing)
- `src/components/TopBar.tsx`, `CommandPalette.tsx`, `SettingsModal.tsx`, `ToolBar.tsx`, `Sidebar.tsx`, `Inspector.tsx`, `StatusLine.tsx`, `PresentationBar.tsx`
- `src/components/canvas/AnnotationLayer.tsx`, `SelectionOverlay.tsx`, `SnapshotBar.tsx`, `CropOverlay.tsx`, `PaperViewport.tsx`, `PdfBackground.tsx`
- `src/index.css` (semantic chrome classes, print stylesheet)
- `index.html` (PWA metadata)

---

## 4. Known limits (deliberate, documented)

- **Bookmarks are sidecar-only.** PDF Master reopens and re-exports them correctly, but the `/Outlines` dictionary is not regenerated, so other readers only see the source document's outline.
- **Formula annotations export as PNG**, not vector text, because KaTeX fonts/styles do not load inside the isolated raster document. Text annotations remain vector.
- **Print is DOM print**, not a generated PDF. Source PDF pages that have not painted can print blank; the 2× raster floor mitigates softness.
- **Letter has no Blank recipe** in the migrated 129-template set; `?new=Letter` resolves to a ruled or squared Letter sheet.
- **Crop handles assume an unrotated viewer.** 0°/180° are exact; 90°/270° use the rotated screen box and can feel slightly off at high zoom.
- **Snapshots are best-effort** for PDF pages not yet painted.
- **Desktop rendering is Chromium** (WebView2/Edge/Chrome); Safari and Firefox are untested.
- **The Tauri installer was not produced in this environment**: `cargo check` passes, but bundling needs the WebView2 runtime and the platform bundler toolchain. Build steps are in `README.md`.
- **The stamp catalogue is one 569 kB chunk**; the warning limit is set to 600 kB rather than lazy-loading synchronous stamp lookup across the app.
- **Phase 5 changes are not committed** (HEAD is `cb1a3cf`, worktree dirty). Commit them as a unit when ready.

---

## 5. Reproduce

```bash
npx tsc -b
npm test
npm run build
npm run preview            # http://localhost:4173

# Desktop, no Rust
PDFMaster-Desktop.cmd

# Desktop, Tauri
winget install Rustlang.Rustup
cd src-tauri && cargo check
npx @tauri-apps/cli build
```

Headless checks are ad hoc Playwright scripts under
`C:\Users\Aa\AppData\Local\Temp\opencode\` (`pdfmaster-e2e.cjs`, `pdfmaster-audit.cjs`); they are not part of the repository.
