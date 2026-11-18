# Phase 9 — Pixel-Perfect Visual Polish Report

All 11 refinements applied. Verification gate green: TypeScript, 79/79 unit tests, production build and `cargo check` all pass.

## 1. Scrollbars removed from rails, capsules and popovers
- Added a `.no-scrollbar` utility in `src/index.css` (`scrollbar-width: none`, `-ms-overflow-style: none`, hidden WebKit scrollbar) and applied it to:
  - `FavoriteToolsBar` capsule (+ `overflow-x-hidden`)
  - `ToolBar` rail (+ `overflow-x-hidden`, padding tightened)
  - `Sidebar` drawer body
  - `Inspector` popover body
  - `FormulaEditor` textarea, preview strip and palette list
  - TopBar document tab strip (scroll still works, no track)
- The Favorites capsule no longer grows a horizontal track from its hover tooltips.

## 2. Minimal, capped stroke previews
- `FavoriteToolsBar`: icon stroke is now `min(3, 1.4 + sqrt(thicknessMm) * 0.4)` — 1.4 px thin, ~2.1 px medium, 3.0 px max, so wide pens stay delicate in the 32 px glyph.
- `PropertyControls` `Live preview` uses compressed curves:
  - Pen: `min(9, 1.5 + sqrt(thicknessMm) * 1.4)`
  - Highlighter: `min(12, 3 + sqrt(thicknessMm) * 1.5)`
- 9.8 mm / 17 mm nibs now read as a refined S-curve instead of a blob.

## 3. One colour picker everywhere
- Moved the curated palette to `INK_COLORS` in `src/lib/presets.ts` (removed the old 12-colour `SWATCHES`).
- `ColorRow` (used by `FormulaEditor`, `Inspector` selection panel, text box fill, formula ink/fill) and `ColorGrid` (pen/highlighter/text studios) now share the same 9 colours: `#EF4444 #2563EB #000000 #10B981 #8B5CF6 #F97316 #FACC15 #EC4899 #06B6D4`.
- All are 24 px rounded squares (`h-6 w-6 rounded-[7px]`, `.swatch` CSS updated from circles), plus the compact `...` custom-colour button and the `None` chip when allowed. Rows wrap instead of squeezing swatches into ovals.

## 4. Selection behaviour
- Drawing commits (`pen`, `marker`, shapes/polygon, stamp, text, formula, plus measurement) now leave `selection` empty, so no box or mini-bar appears after drawing.
- `AnnotationLayer` adds a 320 ms long-press within 4 px tolerance: holding on any existing annotation selects it even with a drawing tool active (pending stroke/draft is discarded, pointer-up does not commit).
- The floating mini-bar is anchored `26 + 22 / zoom` page px above the selection top, i.e. a constant 22 screen px above the rotate handle at any zoom. Near the page top it flips below the selection box.
- Selecting no longer auto-opens the right-hand Inspector. A new `Style / Properties` button on the mini-bar opens it on demand.
- Mini-bar gained the style button while keeping duplicate, rotate, flips, group, lock, front/back, stamp and delete.

## 5. TopBar and ZoomPill
- Removed the redundant top-left sidebar toggle; `📁 Files` is now the first TopBar item, followed by document tabs and `+`.
- ZoomPill order is now `[Fit to Page] [Fit to Width] [100%] [−] [+]`.

## 6. Floating panel spacing
- Right `ToolBar` rail: `right: 12px`, padded to a 48 px rail.
- `Inspector`: `right: 74px` → crisp 14 px gap from the rail.
- Left icon rail: `left: 12px`, 44 px wide (right edge 56 px).
- `Sidebar` drawer: `left: 68px`, 268 px wide (right edge 336 px) → 12 px gap from the rail.
- `Pages` action row is a compact `grid-cols-4` with `px-1 text-[10px]` buttons; the trash button no longer overflows the card.
- `FavoriteToolsBar`: `left: 68px` closed, `left: 348px` with the drawer open → 12 px clearance both ways.

## Verification
| Gate | Result |
| --- | --- |
| `npx tsc -b` | 0 errors |
| `npm test` | 14 files, 79/79 tests passed |
| `npm run build` | built successfully |
| `cargo check --manifest-path src-tauri/Cargo.toml` | exit 0, no errors |

## Note
During the pass a background merge of `origin` inserted conflict markers into seven files (`App.tsx`, `FavoriteToolsBar`, `Inspector`, `PropertyControls`, `Sidebar`, `presets.ts`). Each hunk compared the Phase 9 edit against its pre-Phase-9 version; all were resolved to the Phase 9 side, and all gates above were rerun afterwards.
