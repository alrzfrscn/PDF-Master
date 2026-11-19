# PHASE 10 — Implementation Report

Date: 2026-11-19
Project: PDF Master (`D:\Project\PDF Master`)
Scope: keyboard-layout-independent shortcuts, palm rejection and stylus eraser, full-bleed canvas with floating rails, multi-page view modes with grid overlay, Persian/RTL document search, opaque Files menu, and a custom Apple-style colour picker.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc -b` | Pass (no errors) |
| Unit tests | `npm test` | Pass — 15 files, 85 tests |
| Production build | `npm run build` | Pass — 2332 modules, `dist/` emitted |
| Rust shell | `cargo check --manifest-path src-tauri/Cargo.toml` | Pass — `pdf-master v0.9.0` |

Baseline before this phase was 14 test files / 79 tests; the suite now has 15 files / 85 tests, including the new Persian search and physical-key tests.

---

## Task 1 — Keyboard-layout-independent shortcuts

### Problem
Bindings were derived from `event.key`. On a Persian (or any non-Latin) layout, `Ctrl+V` reports `key: "ر"`, so clipboard, tool and view shortcuts stopped working.

### Change
- `src/lib/shortcuts.ts`
  - Added `physicalKey(code)`, mapping `KeyA…KeyZ`, `Digit0…Digit9`, `Comma`, `Minus`/`NumpadSubtract`, and `Equal`/`NumpadAdd` to their US positions.
  - `bindingFromEvent()` now resolves `physicalKey(event.code) ?? event.key`, so the physical position wins and the localized character is only a fallback.
- `src/App.tsx`
  - Zoom shortcuts now test `event.code` (`Equal`, `NumpadAdd`, `Minus`, `NumpadSubtract`) with `event.key` as fallback.
  - Added shortcut actions for search and every view mode.
- `src/lib/shortcuts.ts` action table
  - New actions and defaults: `search` = `Ctrl+F`, `view-one-page` = `Ctrl+1`, `view-one-continuous` = `Ctrl+2`, `view-two-continuous` = `Ctrl+3`, `view-two-page` = `Ctrl+4`, `toggle-cover-page` = `Ctrl+7`.
- `src/lib/shortcuts.test.ts`
  - Added a Persian-layout test covering `Ctrl+V` (`KeyV`), `P` (`KeyP`), `Ctrl+Z` (`KeyZ`), `Ctrl+1` (`Digit1`) and `Ctrl+,` (`Comma`).

The settings re-binding dialog already used `bindingFromEvent`, so it inherits the physical resolution automatically.

---

## Task 2 — Palm rejection and hardware stylus eraser

### Change
- `src/lib/prefs.ts`
  - Added `touchDrawEnabled: boolean`, default `false`.
  - Persisted through `set()` and restored through `replace()`.
- `src/lib/storage.ts` + `src/lib/storage.test.ts`
  - Workspace backups now carry `touchDrawEnabled`; older backups fall back to the default via `replace()`.
- `src/components/canvas/AnnotationLayer.tsx`
  - New optional prop `touchScroll` (documented as “one finger scrolls; pen and mouse always draw”).
  - `onPointerDown` ignores `pointerType === "touch"` while `touchScroll` is true, so one-finger touch reaches the pan/scroll layer.
  - Hardware eraser detection runs before the left-button check:
    - `pointerType === "eraser"`, or
    - `pointerType === "pen"` with `button === 5` or `buttons & 32`.
  - A hardware eraser starts an `erase` interaction (same `eraseAt` path as the eraser tool) regardless of the active tool, and leaves the active tool unchanged, so it “returns” automatically when lifted.
  - Hardware erasers still work in hand/space-pan mode; the event is stopped so the viewport does not start a pan.
  - SVG `touchAction` is `auto` when `panMode || touchScroll`, otherwise `none`.
- `src/components/canvas/PaperViewport.tsx`
  - Passes `touchScroll={!touchDrawEnabled}` to every page.
  - `.page-paper` also gets inline `touch-action: auto` when touch scrolling is enabled, so native continuous scrolling is not blocked by the stylus CSS rule.
  - The viewport uses `pan-x pan-y` for touch in continuous mode; non-continuous one-finger pan uses the existing capture-based pan.
- `src/components/Sidebar.tsx`
  - Added a hand button below favourites that toggles `touchDrawEnabled` with `aria-pressed` and an explanatory tooltip.

Result: finger touch pans by default; a stylus or mouse always draws; a stylus eraser erases with any tool selected.

---

## Task 3 — Full-bleed canvas and floating left rail

### Change
- `src/components/Sidebar.tsx`
  - Removed the opaque 68 px flex column.
  - Rail is now `absolute left-3 top-3 z-40` (`12 px`), a floating `w-11` glass capsule.
  - Drawer and view popover anchor at `left-[52px]` relative to the rail (`64 px` on screen), no longer taking layout width.
- `src/App.tsx`
  - Sidebar remains inside the relative content container but no longer occupies flex width; `main` is full width.
- `src/components/ToolBar.tsx`
  - Rail moved to `right-[18px]`.
  - Removed the internal max-height and scroll containers, so the toolbar is fixed and non-scrolling.
- `src/index.css`
  - `.tool-btn` reduced from 38 px to 33 px (inside the requested 32–34 px range), radius 10 px.
- `src/components/Inspector.tsx`
  - Offset changed from `right-[74px]` to `right-[78px]` to clear the compact rail.
- `src/components/FavoriteToolsBar.tsx`
  - Removed the decorative `Heart` header and its import; the dock starts with real favourites.

---

## Task 4 — View modes and grid overlay

### State
`src/stores/useUIStore.ts`:
- `ViewMode = "one-page" | "one-continuous" | "two-page" | "two-continuous"`, default `"one-continuous"`.
- `separateCoverPage: boolean`, default `false`.
- `GridStyle = "none" | "squared-5" | "squared-10" | "ruled-8" | "dots-5" | "millimeter"`, default `"none"`.
- Setters: `setViewMode`, `toggleSeparateCoverPage`, `setGridStyle`.

### UI
`src/components/Sidebar.tsx`:
- View button above Pages opens a popover.
- Page View choices: One page, One continuous (default), Two continuous, Two page.
- Separate cover toggle appears for the two-page modes.
- Grid Line select: None, Squared 5 mm, Squared 10 mm, Ruled 8 mm, Dots 5 mm, Millimeter.

### Rendering
`src/components/canvas/PaperViewport.tsx`:
- `buildRows()` builds single-page rows or two-page spreads, with an optional standalone cover.
- Continuous modes render every row in a native `overflow-auto` `.doc-scroll` container.
- Non-continuous modes render only the active row, centred, with the existing pan transform.
- Scroll tracking picks the page closest to the viewport centre and calls `setPage`, so the current page follows continuous scrolling.
- Fit scaling accounts for a doubled width in two-page modes.
- Each page mounts an interactive `AnnotationLayer` lazily through `IntersectionObserver` (`rootMargin: 1200px`), so hundreds of pages stay cheap.
- Page activation happens in `onPointerDownCapture`, before annotation handlers, because the annotation store always targets the active document page.
- `GridOverlay` draws screen-only grids (never exported or printed): squared 5/10, ruled 8, dots 5, and 1 mm minor + 10 mm major lines.
- Search highlights render in page millimetre coordinates above the grid.

### CSS
`src/index.css`:
- `.doc-scroll` gives the continuous document its own 10 px scrollbar (WebKit + Firefox), transparent track, rounded thumb, `overscroll-behavior: contain`.
- Existing print rules keep rails, docks and inspector off paper.

---

## Task 5 — Persian/RTL-aware document search

### Engine — `src/lib/pdfSearch.ts`
- `normalizeSearchText()`:
  - NFKC folding for Arabic presentation forms.
  - Arabic yeh/alef maqsura → Persian yeh; Arabic kaf → Persian kaf.
  - Removes harakat, tatweel, bidi controls, ZWNJ and all whitespace.
  - Lower-cases Latin text.
- `searchTextContains()` matches the logical order and legacy visual (reversed) runs.
- `searchTab()` walks up to 500 pages, reads `getTextContent()` per PDF page, and also searches text-box annotations.
- PDF text positions convert points to millimetres (`25.4 / 72`) with y measured from the viewport top; text boxes use their stored mm geometry.
- A broken page is skipped without stopping the search.
- `useSearchStore` holds `query`, `matches`, `current` and `searching`.

### UI — `src/components/SearchBar.tsx`
- Floating capsule at `z-[90]`: search icon, input, `n/m`, previous, next, close.
- Debounced search (220 ms).
- `Enter` → next match; `Shift+Enter` → previous; `Escape` → close.
- Jump sets the current page and dispatches `pm:search-focus` for continuous scrolling.
- Opening focuses and selects the input; changing tab clears the search.

### Integration
- `src/components/Sidebar.tsx`: Search button below Stamps, `aria-pressed` bound to `searchOpen`.
- `src/App.tsx`: renders `<SearchBar />`; `Ctrl+F` opens it; `Escape` closes search before any other panel.
- `src/components/canvas/PaperViewport.tsx`: amber highlight boxes per page; current match is stronger and outlined; `pm:search-focus` scrolls the page into view in continuous mode.

### Tests — `src/lib/pdfSearch.test.ts`
- NFKC presentation-form folding.
- Arabic/Persian yeh and kaf unification.
- Harakat, tatweel and ZWNJ removal.
- Spaced query vs ZWNJ word matching in both directions.
- Legacy visual-order (reversed) run matching.

---

## Task 6 — Opaque menus and custom colour picker

### Opaque menus
- `src/index.css`
  - Added `--surface-menu` for light (`rgba(255,255,255,0.98)`), dark (`rgba(24,28,36,0.98)`) and sepia (`rgba(255,250,240,0.98)`).
  - Added `.menu-surface`: 98% surface, 24 px blur, border, soft shadow.
- `src/components/TopBar.tsx`
  - Files dropdown now uses `menu-surface` and `z-[100]` instead of translucent `glass-strong`.
  - The Files menu stays readable over busy PDF pages.

### Apple-style custom picker
New `src/components/ui/CustomColorPicker.tsx`:
- Saturation/value square with draggable thumb.
- Hue slider with a hue-strip track.
- Eyedropper (`EyeDropper` when available).
- Hex input and R/G/B numeric pills.
- Nine quick swatches from the project palette.
- Recent colours persisted in `localStorage` under `pm.recentColors`.
- Fully theme-aware through `menu-surface` and tokens.

Replaced native `<input type="color">` in:
- `src/components/ui/controls.tsx` — `ColorRow`.
- `src/components/PropertyControls.tsx` — `ColorGrid` (also removed the now-unused `useState` import).

`src/index.css` adds `.hue-range` styling for the hue slider (WebKit and Firefox thumbs).

---

## Files touched

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Floating layout, search rendering, new shortcut actions, Escape order, physical zoom keys |
| `src/components/Sidebar.tsx` | Floating rail, View popover, Search and touch-draw buttons |
| `src/components/ToolBar.tsx` | Compact fixed 18 px rail |
| `src/components/Inspector.tsx` | 78 px offset |
| `src/components/FavoriteToolsBar.tsx` | Decorative Heart removed |
| `src/components/TopBar.tsx` | Opaque Files menu |
| `src/components/SearchBar.tsx` | New floating search capsule |
| `src/components/ui/CustomColorPicker.tsx` | New colour studio |
| `src/components/ui/controls.tsx` | `ColorRow` uses the custom picker |
| `src/components/PropertyControls.tsx` | `ColorGrid` uses the custom picker |
| `src/components/canvas/PaperViewport.tsx` | View modes, grid, search highlights, lazy pages, scroll tracking |
| `src/components/canvas/AnnotationLayer.tsx` | Touch pass-through and hardware eraser |
| `src/stores/useUIStore.ts` | View/grid/search state |
| `src/lib/shortcuts.ts` | Physical key resolution and new actions |
| `src/lib/shortcuts.test.ts` | Persian-layout coverage |
| `src/lib/prefs.ts` | `touchDrawEnabled` |
| `src/lib/storage.ts` | Persist the new preference in backups |
| `src/lib/storage.test.ts` | Backup fixture updated |
| `src/lib/pdfSearch.ts` | Persian/RTL search engine and store |
| `src/lib/pdfSearch.test.ts` | Normalization and RTL matching tests |
| `src/index.css` | Menu surface, scrollbar, hue slider, compact tool buttons |

## Notes and limits

- Search is debounced and sequential across pages; very large PDFs (hundreds of pages) may take a moment to produce the match count.
- Grid overlays are screen-only and intentionally excluded from print/export.
- Recent colours and the touch-draw preference are stored locally; the touch preference is also included in workspace backups.
