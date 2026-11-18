# Phase 7 — UI Overhaul Report

Date: 2026-11-18
Branch: `main` (all changes uncommitted)

## Summary

Phase 7 reworks the workspace chrome: tools move to a right-edge rail with a floating
property popover, navigation moves to a left icon rail with floating drawers, favorites
get a persistent capsule dock, the pen studio becomes a full ink panel, and the top bar
gains a Files menu, document tabs, and a live page/zoom cluster. The bottom status pills
are removed. All existing document, annotation, storage and export behavior is preserved;
63 existing tests still pass and 9 new tests were added (72 total).

## Layout Changes

### Right tool rail + floating property popover
- `ToolBar` is now a docked right rail (`Hand` … `Image`). Clicking a tool selects it;
  clicking the active tool opens/closes its property popover.
- `Inspector` renders as a floating 320px glass popover anchored to the rail, with
  `max-height: calc(100vh - 96px)`, a pin toggle and a close button.
- Unpinned popover collapses when a drawing stroke starts or the selection changes away;
  a pinned popover stays open. `Escape` closes an unpinned popover first, then clears
  selection.

### Left rail + floating drawers
- `Sidebar` collapses to a 44px icon rail: Pages, Bookmarks, Annotations, Stamps/Library
  and Favorite Tools (Heart).
- Each panel opens as a 268px floating glass drawer with pin and close controls and
  click-outside dismissal. Existing `sidebarOpen` / `sidebarTab` state was reused, with
  `SidebarTab` extended to `"pages" | "bookmarks" | "annotations" | "stamps"`.
- The bottom `StatusLine` component was deleted, along with its pills.

### Favorite Tools capsule dock
- New persisted store `useFavoritesStore` (`pm.favoriteTools`) seeded with 10 exact
  default tools.
- New `FavoriteToolsBar` capsule dock at `left: 56px`; click selects the tool, right-click
  or the × control enters edit mode and removes an entry, and a header button adds the
  current tool to favorites.
- Favorites are included in `.pmbackup.json` through the storage backup/restore path.
  The `WorkspaceStores.favorites` field is optional so older backups and test fixtures
  remain valid.

### Pen studio
- `PropertyControls` rebuilt as an ink studio:
  - live S-curve pressure/thickness preview,
  - Basic / Pro / Calligraphy style cards,
  - ticked thickness slider with a numeric pill,
  - 9-color swatch grid plus a custom color picker,
  - ticked opacity slider,
  - collapsible "Smart inking" section,
  - Separate / Synchronous control,
  - presets moved behind a `...` menu.
- `ToolProps` gained `penStyle` and `pressureLevel`. `penStyleOptions(style, level)` maps
  them to rendering parameters: `thinning = style === "basic" ? 0 : level / 100`, with
  calligraphy using 0.85 smoothing. Legacy annotations without `penStyle` fall back to
  `sensitivity ? "pro" : "basic"` at level 55, so old documents render unchanged.

### Top bar
- Files dropdown: Open, Create, Combine, Save, Save As, Flatten, Print full, Print
  current.
- Document tabs with a `+` button, a `Page X / Y` pill, and `ZoomPill` with Fit Page and
  Fit Width icon buttons.
- Undo, redo, save, presentation, settings and theme controls remain in the bar.
- Command palette and alignment-guide toggles moved into Settings; `Ctrl+K` still opens
  the palette globally.

## Functional Additions

- `combinePdfs(parts: Uint8Array[])` in `pdfEngine.ts` uses `pdf-lib` `copyPages` to merge
  multiple PDFs into one. The TopBar combine dialog accepts checked open tabs plus a
  multi-file picker.
- `saveActiveDocument` accepts `alwaysAsk`, used by Save As to force the save dialog.
- `printActiveDocument` exports the flattened document into a hidden iframe for full
  document printing; "Print current" prints the active page.
- Flatten now exports the annotated/flattened PDF through the same engine path.
- Print CSS hides the favorites dock and the removed status-line area.

## Files Changed

```
 M src/App.tsx
 M src/components/Inspector.tsx
 M src/components/PropertyControls.tsx
 M src/components/SettingsModal.tsx
 M src/components/Sidebar.tsx
 D src/components/StatusLine.tsx
 M src/components/ToolBar.tsx
 M src/components/TopBar.tsx
 M src/components/ZoomPill.tsx
 M src/components/canvas/AnnotationLayer.tsx
 M src/index.css
 M src/lib/annotationTypes.ts
 M src/lib/ink.ts
 M src/lib/pdfEngine.test.ts
 M src/lib/pdfEngine.ts
 M src/lib/presets.ts
 M src/lib/save.ts
 M src/lib/storage.ts
 M src/lib/sync.test.ts
 M src/lib/tools.ts
 M src/lib/types.ts
 M src/stores/useUIStore.ts
?? src/components/FavoriteToolsBar.tsx
?? src/lib/ink.test.ts
?? src/stores/useFavoritesStore.test.ts
?? src/stores/useFavoritesStore.ts
```

Diff: 22 tracked files changed, +1225 / −407, plus 4 new files.

## Tests Added

- `src/stores/useFavoritesStore.test.ts` — defaults, add/remove, persistence.
- `src/lib/pdfEngine.test.ts` — `combinePdfs` page count and content merge.
- `src/lib/ink.test.ts` — pen style option mapping and legacy fallback.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc -b` | 0 errors |
| Tests | `npm test` | 13 files, 72 tests passed (baseline 63) |
| Build | `npm run build` | success |
| Rust | `cargo check --manifest-path src-tauri\Cargo.toml` | `Finished dev profile`, 0 errors |

Note: the PowerShell wrapper reported exit code 1 for `cargo check` only because cargo
writes progress lines (`Compiling` / `Finished`) to stderr; the output contains no errors.

## Risks / Known Limits

- All changes are uncommitted; nothing has been pushed.
- Popover/drawer stacking assumes the existing z-index scale; extreme zoom or very short
  viewports may clip the 96px-reserved popover height.
- Combine is synchronous and memory-bound for very large inputs.
- Custom pen-style rendering changes only newly created annotations; existing ones use the
  legacy fallback path.
