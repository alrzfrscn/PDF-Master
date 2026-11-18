# Phase 9 — Visual Polish Report

All 11 refinements are implemented and verified. No test regressions.

## 1. Scrollbars
- Added a `.no-scrollbar` utility in `src/index.css` (WebKit + Firefox + `scrollbar-width`).
- Applied to actual scroll containers only: `Sidebar`, `FavoriteToolsBar`, `ToolBar`, `Inspector`.
- `FavoriteToolsBar` and `ToolBar` also get `overflow-x-hidden` so no horizontal rail appears.

## 2. Stroke previews
- `FavoriteToolsBar`: nib radius clamped to **1.4–3.0 px** for pen and line glyphs.
- `PropertyControls.tsx` (`previewNib`):
  - Pen: `Math.min(9, 1.5 + Math.sqrt(thicknessMm) * 1.4)`
  - Highlighter: `Math.min(12, 3 + Math.sqrt(thicknessMm) * 1.5)`
- `WavePreview` now receives the active tool so each preview uses its own formula.

## 3. Color pickers
- Shared 9-color `SWATCHES` in `src/lib/presets.ts`:
  `#EF4444 #2563EB #000000 #10B981 #8B5CF6 #F97316 #FACC15 #EC4899 #06B6D4`.
- Used by both `ColorRow` (`ui/controls.tsx`) and `ColorGrid` (`PropertyControls.tsx`).
- `.swatch` is now 24×24, `border-radius: 7px`, `flex: 0 0 auto` — rounded squares, never circles.
- Compact custom-color input (24 px) and an optional `None` chip; the chip sits in the label row so the 274 px Selection panel does not wrap.

## 4. Selection behavior
- `AnnotationLayer` commits ink/shape/stamp/text/formula via `addSilently()`, leaving `selection` empty after drawing.
  (`annotationStore.add()` still selects — covered by `annotationStore.test.ts`.)
- Long-press selection: 320 ms hold, ≤4 px movement, enabled even with a drawing tool active; cancelled on move/up/cancel, tool change, and unmount.
- `SelectionOverlay` mini-bar lifts 48 screen px above the box (≈26 px above the rotate grip), flips below when the box is near the page top, anchors to the near horizontal edge so 12 buttons never clip, and ignores clicks via a stem.
- Inspector no longer auto-opens from selection: the effect in `App.tsx` was removed.
- New leading **Style / properties** button on the mini-bar opens the tool popover.

## 5. Top bar & zoom
- `TopBar`: sidebar toggle removed; **Files** is the first control.
- `ZoomPill` order: Fit page → Fit width → percentage → − → +.

## 6. Floating panel geometry
| Element | Position / size |
| --- | --- |
| Left rail | `left: 12px`, 44 px wide |
| Pages drawer | `left: 68px`, 268 px wide |
| Favorite dock (closed) | `left: 68px` |
| Favorite dock (drawer open) | `left: 348px` |
| Right ToolBar | `right: 12px`, 48 px wide |
| Inspector | `right: 74px` (14 px gap to ToolBar) |
| Pages action row | 4-column grid, compact buttons — no overflow |

## Verification
- `npx tsc -b` — exit 0
- `npm test` — 14 files, **79/79 passed**
- `npm run build` — success (839 ms)
- `cargo check --manifest-path src-tauri/Cargo.toml` — exit 0
- Playwright (Chrome, 1440×900) geometry check:
  - 9 swatches at 24×24
  - rail 44 @ x=12; drawer 268 @ x=68; dock x=68 closed / x=348 open
  - ToolBar 48 @ right 12; Inspector gap 14 px
  - ZoomPill labels in required order
  - no selection chrome after a freehand stroke
  - long-press bar clears the rotate grip (~26 px) and stays on screen at left/right/top edges
