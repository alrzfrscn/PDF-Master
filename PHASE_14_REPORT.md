# Phase 14 — Page Centering, Focal Zoom and Edge-Safe Scrolling

Date: 2026-11-22
Viewport under test: 1440 × 900 (TopBar 56 px, canvas 1440 × 844)
Build under test: `dist/` served by `vite preview` at `http://127.0.0.1:5200/`

## 1. Objective

Diagnose the live DOM layout of `PaperViewport`, then fix:

- page centering in continuous and single/two-page modes,
- zoom that keeps the point under the cursor/fingers fixed,
- scrolling that never hides a page edge under the top bar or outside the viewport.

## 2. Diagnosis (before any edit)

Method: headless Chromium at 1440 × 900 with `favoritesOpen: true`, `sidebarOpen: false`,
continuous view and a blank A4 document. The script walked the live DOM and recorded
`getBoundingClientRect()` for `.doc-scroll`, the page wrapper, `.page-paper` and the
computed styles at 38 %, Fit Page, Fit Width and 138 %.

Baseline geometry:

| Element | Measurement |
| --- | --- |
| TopBar | 0 → 56 px |
| Canvas viewport | 0 → 1440 × 56 → 900 (844 px tall) |
| `.doc-scroll` padding | `padding-left: 124px`, `padding-right: 76px` |
| Safe strip | x = 124 → 1364, width 1240 px, centre x = 744 |
| Fitted page (Fit Page) | 451.27 → 1036.72, centre 744 (correct) |

### Exact root cause

`PageView` sized its outer wrapper to the **scaled** page (`displayW × displayH`), but
positioned the inner `.page-paper` with `left: (displayW - baseW*scale)/2` and
`top: (displayH - baseH*scale)/2` while scaling it with `transformOrigin: "center"`.
Scaling around the centre moves the visual box by another `(baseSize - baseSize*scale)/2`,
so the two offsets were applied twice:

- At 38 %: wrapper `left = 593.2`, `.page-paper` `left = 839.25` (+246.05 px).
- The paper's right edge stayed at `1140.83 px` (79.2 % of 1440) at **every** zoom level.
- At 138 %: `.page-paper` was at `left = 45.54`, `top = -157.28`, i.e. outside its own
  wrapper and clipped by it.

A second, independent defect: Fit Page/Fit Width used
`scrollIntoView({ block: "start" })`, which left `scrollTop = 32`. That hid the 24 px
canvas top padding, and the fitted page (828 px + 24 px top padding) could not fit in the
844 px viewport. `.doc-scroll` also owned the 124/76 px rail padding, so a fitted row was
centred in the padded content box rather than in the safe strip.

## 3. Fixes

### `src/components/canvas/PaperViewport.tsx`

- `PageView`: wrapper is exactly `displayW × displayH`; `.page-paper` sits at `left: 0;
  top: 0` with `transformOrigin: "0 0"`. Rotation uses positive translations
  (`translate(displayW,0)`, `translate(displayW,displayH)`, `translate(0,displayH)`) so
  90/180/270° sheets stay inside the wrapper. No negative overflow remains.
- Continuous scroller: `.doc-scroll` has no padding. A new inner `.doc-canvas` is
  `width = max(scrollerClientWidth, widestRow + leftInset + rightInset + 48)` with
  `padding: 24px (rightInset+24)px 48px (leftInset+24)px`, `display:flex`,
  `flex-direction:column`, `align-items:center`, `gap:20px`. Each row keeps its own
  measured width, so a wide page elsewhere never shifts this row.
- Scroller width is tracked with `ResizeObserver` so the safe centre accounts for the
  scrollbar.
- Zoom anchoring: `captureZoomAnchor(clientX, clientY)` records the page index and the
  normalised page point (`u`, `v`) under the pointer/fingers. A `useLayoutEffect` keyed on
  `zoom` reads the post-layout rect and corrects `scrollLeft/scrollTop` (continuous) or
  `pan` (single/two-page) synchronously, so the same page point lands back under the
  cursor. Captured before Ctrl/⌘+wheel, pinch midpoint, `+`/`−` buttons and keyboard;
  buttons anchor at the safe-strip centre.
- Fit logic now uses the scroller's client width, subtracts 24 px beside the rails and
  `24 + 48` px vertical padding in continuous mode (`16 px` in single mode). After
  fitting it centres the active page from its DOM rect and scrolls page 1 to `top: 0`,
  later pages to 20 px below the top.
- Page jumps (`pm:goto-page`) reuse the same top-position helper, so they no longer
  leave `scrollTop = 32`.
- A short `programmaticScrollUntil` guard stops the scroll listener from re-selecting a
  page while zoom or a fit is being applied.

### `src/lib/paper.ts`

`clampPan` now matches the visible safe strip:

- row fits horizontally: `maxX = (safeWidth - 24 - rowWidth) / 2` (12 px each side),
- row is wider: `maxX = (rowWidth - safeWidth) / 2 + 24` (24 px stays inside a rail),
- vertical: 16 px margin when it fits, 32 px below the top bar when it does not.

### `src/lib/paper.test.ts`

Updated the expected bounds and added two edge tests: a fitted page stops 12 px inside the
rails and 16 px from top/bottom; an oversized page stops 24 px beside the rail and 32 px
below the top bar.

### `src/App.tsx`

- `<main>` is now `relative h-full min-w-0 flex-1 overflow-hidden`, so the viewport can
  never grow the document.
- `case "print":` calls `printActiveDocument()` instead of `window.print()`.

### `src/components/ZoomPill.tsx`

Added `data-zoom` markers to the reset/out/in buttons so the viewport can capture the
zoom anchor before their handlers run. No visual or behavioural change.

## 4. Verification

### Static and unit gates

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, no diagnostics |
| `npm test` | 18 files, **112/112 tests passed** |
| `npm run build` | success (current `dist/`) |
| `cargo check --manifest-path src-tauri/Cargo.toml` | exit 0, `Finished dev profile` |

### Browser proofs (headless Chrome, built `dist/`, 1440 × 900)

Script: `C:\Users\Aa\AppData\Local\Temp\pw\proof.mjs` (Playwright installed outside the
repo; no project dependency added). It asserts all five proofs:

1. Fit to Page is centred and fully inside the viewport.
2. Fit to Width is centred and inside both floating rails.
3. 38 % zoom stays centred.
4. Ctrl+wheel zoom keeps the page point under the cursor within 3 px.
5. At high zoom the first page never goes under the top bar and the last page never goes
   below the viewport bottom.

Result: **21/21 checks passed.**

| Scenario | Evidence |
| --- | --- |
| Blank, favourites on — Fit Page | centre Δ 0.00 px, top gap 24.00 px, bottom gap 48.00 px, 69 % |
| Blank, favourites on — Fit Width | centre Δ 0.00 px, page 136.0 → 1352.0, rails 124 → 1364 |
| Blank, favourites on — 38 % | centre Δ 0.00 px, page 1 |
| Blank, favourites on — cursor focal | Δ (0.37, 0.14) px, 235 % |
| Blank, favourites on — 200 % top | page 1 top 80.0, top bar bottom 56.0 |
| Blank, favourites on — 200 % bottom | last page bottom 852.0, viewport 900 |
| Blank, favourites off — Fit Page | centre Δ 0.00 px, top 24.00 / bottom 48.00 |
| Blank, favourites off — Fit Width | centre Δ 0.00 px, page 80.0 → 1352.0, rails 68 → 1364 |
| Blank, favourites off — 38 % | centre Δ 0.00 px |
| Single page — Fit Page | centre Δ 0.00 px, 8 px top and bottom |
| Single page — Fit Width | centre Δ 0.00 px, page 136.0 → 1352.0 |
| Single page — 38 % | centre Δ 0.00 px |
| Single page — cursor focal | Δ (0.09, 0.00) px, 235 % |
| Mixed PDF page 1 (500 × 700 pt) — Fit Page | centre Δ 0.01 px, 83 % |
| Mixed PDF page 1 — Fit Width | centre Δ 0.39 px |
| Mixed PDF page 1 — 38 % | centre Δ 0.00 px |
| Mixed PDF page 2 (1400 × 900 pt) — Fit Page | centre Δ 0.44 px, 64 % |
| Mixed PDF page 2 — Fit Width | centre Δ 0.00 px, 136.0 → 1352.0 |
| Mixed PDF page 2 — 38 % | centre Δ 0.01 px |
| Mixed PDF — 200 % top | page 1 top 80.0 |
| Mixed PDF — 200 % bottom | last page bottom 852.0 |

The mixed-width PDF (`mixed.pdf`, four pages: 500×700, 1400×900, 595×842, 300×1200 pt)
confirms that a wide page does not shift narrower rows and that the active page is fitted
on its own metrics.

### Rotation geometry

Separate probe (`rot.mjs`): rotating the page 90°, 180° and 270° keeps `.page-paper`
exactly inside its wrapper — max delta 0.01 px in left/top/width/height — and on screen
(`inside = true` for all three).

Artifacts: `C:\Users\Aa\AppData\Local\Temp\pw\proof-final.png`,
`proof-failure.png` (unused), `rotation-final.png`, `diag-out.txt`.

## 5. Notes and limits

- No dependency, config or Tauri change was needed.
- The Playwright harness is intentionally outside the repository; the project build and
  test graph is unchanged.
- The proofs use a blank A4 document, a single-page view and a four-page mixed-width PDF;
  scanned PDFs and very large page counts were not re-measured, but the layout no longer
  depends on page content.
- `PHASE_14_REPORT.md` is the only added file.
