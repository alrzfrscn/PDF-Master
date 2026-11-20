# PHASE 12 — Stylus `pointercancel`, Safe-Area Centering, Compact Page Pill

Project: `D:\Project\PDF Master`
Date: 2026-11-20
Scope: four hands-on bugs found on a Windows 11 touchscreen + stylus laptop.

---

## 1. Stylus only drew dots when finger drawing was OFF

### Root cause (confirmed in code, not guessed)

Phase 10 made the canvas yield to native touch scrolling by switching `touch-action`:

| Surface | Before this phase |
| --- | --- |
| `AnnotationLayer` `<svg>` | `touchAction: panMode \|\| touchScroll ? "auto" : "none"` |
| `.page-paper` | `touchAction: touchScroll ? "auto" : undefined` |
| `.viewport` | `touchAction: continuous && !touchDrawEnabled ? "pan-x pan-y" : "none"` |
| `.doc-scroll` | no rule at all |

`touchDrawEnabled` defaults to **`false`** (`src/lib/prefs.ts`), so out of the box every one of those surfaces was `auto` / `pan-x pan-y`.

Chromium applies `touch-action` to **pens as well as fingers**. With `auto`, the pen `pointerdown` placed the first ink point, and after 2–3 px the browser's native pan/scroll recognizer took the gesture and fired `pointercancel`, which runs:

```ts
onPointerCancel={() => { cancelLongPress(); interaction.current = null; setDraft(null); }}
```

The stroke was discarded and only the initial dot remained. Finger drawing worked because that path never depended on native scrolling; the palm-rejection toggle merely hid the bug from fingers.

### Fix

1. **`touch-action: none` everywhere, unconditionally.** Removed every conditional `auto` / `pan-x pan-y` override. The value now comes from one exported constant, `CANVAS_TOUCH_ACTION` (`src/lib/canvasInput.ts`), used by `.viewport`, `.page-paper` and the annotation `<svg>`; `.doc-scroll` was added to the `touch-action: none` rule in `src/index.css`.
2. **Finger input routed by pointer type, not by CSS.** `drawsWithPointer(pointerType, touchDrawEnabled)` — pen and mouse always draw; a finger only when palm rejection is off. A finger returns from `AnnotationLayer.onPointerDown` **before** `stopPropagation` / `setPointerCapture`, so the event bubbles to the viewport's own gesture.
3. **Programmatic one-finger panning** in `PaperViewport.onPointerDown`, gated by `pansWithPointer(pointerType, touchDrawEnabled, canPan)`:
   - continuous (`one-continuous` / `two-continuous`): `pointermove` writes `scrollEl.scrollLeft/Top` directly;
   - single/two-page: `pointermove` updates `pan.x/pan.y`.
4. **Second finger still wins.** The pinch effect now sets a `pinching` ref, and `onPointerDown` ignores a new touch pointer while it is set — otherwise the second finger's `pointerdown` would restart the one-finger pan and fight the pinch.

`pointercancel` can no longer fire for a scroll gesture because the browser never owns the gesture.

---

## 2. Page not centered between the rails (`Fit to Page` / `Fit to Width`)

### Root cause A — `box-sizing` on the continuous wrapper

```jsx
<div style={{ width: "max-content", minWidth: "100%",
              paddingLeft: Math.max(24, leftInset),
              paddingRight: Math.max(24, rightInset) }}>   // content-box
```

`min-width: 100%` is a **content-box** width, so the rail padding was added on top: the scroll content became `viewport + leftInset + rightInset` wide even when the page fitted. The rows were then centered inside a content box that starts at `leftInset`, which pushes the fitted page right by `leftInset` and clips its right edge — exactly the right-shifted page in screenshot 1. A stale `scrollLeft` from a previous zoom did the mirror damage in `Fit to Width` (page pinned near `x = 0`).

### Root cause B — insets did not match the actual chrome

`leftInset = sidebarOpen ? 344 : favoritesOpen ? 120 : 68` did not describe the real geometry:

| Chrome | Real right edge | Correct inset |
| --- | --- | --- |
| Left rail only (`left-3`, `w-11`) | 12 + 44 = 56 | **68** |
| + favourite dock (`left: 68`, `w-11`) | 68 + 44 = 112 | **124** |
| + sidebar drawer (`left-[52px]`, `w-[268px]`) | 332 | **348** |
| + drawer and favourite dock | 392 | **404** |
| Right `ToolBar` (`right-[18px]`, 46 px) | 64 | **76** |
| Pinned `Inspector` (`right-[78px]`, 320 px) | 398 | **410** |

### The layout contract now in code

`src/lib/paper.ts`:

```ts
getWorkspaceInsets({ sidebarOpen, favoritesOpen, inspectorOpen, inspectorPinned })
  → { leftInset, rightInset }

workspaceSafeArea(viewportWidth, leftInset, rightInset)
  → safeWidth   = max(200, viewportWidth - leftInset - rightInset)
  → safeCenterX = leftInset + safeWidth / 2
```

`PaperViewport` uses it for all three modes:

- **Fit to Width**: `zoom = (safeWidth - 24) / rowWidthPx`, `pan = {0,0}`.
- **Fit to Page**: `zoom = min((safeWidth - 24) / rowWidthPx, (viewportHeight - 16) / rowHeightPx)`, `pan = {0,0}`.
- **Continuous**: the scroll wrapper is `box-sizing: border-box` with `paddingLeft: leftInset`, `paddingRight: rightInset`; rows use `margin-inline: auto` instead of flex `align-items: center`, so a zoomed-in page can overflow without the left edge being clipped. `scrollLeft` is reset to `0` after a fit so a stale offset cannot park the page under a rail.
- **Single/two-page**: the stage sits at `left: calc(leftInset + (100% - leftInset - rightInset) / 2)`, i.e. exactly `safeCenterX`.
- **Re-fit on chrome changes**: the fit effect depends on `leftInset` / `rightInset` / `viewMode` / `continuous` and keeps its `ResizeObserver`, so toggling `FavoriteToolsBar`, the sidebar, the pinned inspector, or resizing the window re-runs the fit and keeps the page dead-centre.

The pinned inspector is only subtracted when it is **pinned**; the unpinned tool popover floats over the page and closes on the first stroke, so it must not move the page.

---

## 3. TopBar page pill

`Page 13 / 27` → `13 / 27`. The `<select>` gained `whitespace-nowrap` and `min-w-[64px]` (kept `max-w-[96px]`), so 1-, 2- and 3-digit counts fit without clipping the trailing digit.

---

## 4. Files changed

| File | Change |
| --- | --- |
| `src/lib/canvasInput.ts` | **new** — `CANVAS_TOUCH_ACTION`, `drawsWithPointer`, `pansWithPointer` |
| `src/lib/paper.ts` | **new** — `getWorkspaceInsets`, `workspaceSafeArea` |
| `src/lib/canvasInput.test.ts` | **new** — 3 tests (stylus never blocked, touch-action constant, finger routing) |
| `src/lib/paper.test.ts` | **new** — 6 tests (insets, safe centre, fit-width/fit-page edges) |
| `src/components/canvas/AnnotationLayer.tsx` | unconditional `touch-action: none`, pointer-type routing, no `stopPropagation` for fingers |
| `src/components/canvas/PaperViewport.tsx` | insets helper, safe-area fit math, `border-box` scroll wrapper, margin-auto rows, programmatic one-finger pan, pinch hand-off, `scrollLeft` reset |
| `src/index.css` | `.doc-scroll` joins the `touch-action: none` rule |
| `src/components/TopBar.tsx` | `13 / 27` pill, `whitespace-nowrap`, `min-w-[64px]` |

## 5. Verification

```
npx tsc -b                              → exit 0, 0 errors
npm test                                → 17 files, 101 tests passed (9 new)
npm run build                           → ✓ built in 1.33s, 0 errors
cargo check --manifest-path src-tauri/Cargo.toml → exit 0, Finished dev profile
```

New coverage:

- `getWorkspaceInsets` for all four `sidebarOpen` × `favoritesOpen` combinations (68 / 124 / 348 / 404) and both inspector states (76 / 410).
- `safeCenterX = leftInset + (viewportWidth - leftInset - rightInset) / 2` for every combination.
- Fit-to-Width: page left edge `= leftInset + 12` and `>= leftInset` (never `0`) in all four combinations; right edge `= viewportWidth - rightInset - 12`.
- Fit-to-Page: same strip, page width within `safeWidth - 24`.
- 200 px floor on a narrow window.
- `drawsWithPointer("pen", false) === true` (the exact Phase 10 regression), `CANVAS_TOUCH_ACTION === "none"`, and finger panning gated correctly (off / on / hand tool).

## 6. Not verified on hardware

The pen path is asserted at the routing level and at the CSS contract level; an actual Windows 11 pen stroke was not re-run in this session. The behavioural risk left is Chromium's two-finger pinch while a one-finger pan is captured — handled by the `pinching` ref, but worth one manual pass on the laptop.
