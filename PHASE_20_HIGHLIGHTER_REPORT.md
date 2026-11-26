# Phase 20 — True Chisel-Nib Minkowski Sweep Highlighter Engine

## Result

All four highlighter tips now render from one deterministic geometry engine. The
`Vertical`, `Horizontal`, and `Squared` tips sweep an upright, fixed-orientation
nib, so hand jitter can no longer spin the end cap or fire miter spikes. The
`Ball` tip delegates to the Phase 19 fixed-width round ribbon.

## Root cause (fixed)

- Committed and draft markers were raw `<polyline>` strokes with butt/square
  caps; the draft also defaulted to a spiky `miter` join.
- `markerNib()` only changed stroke width and cap, so a thick nib was still a
  rotating stroke rather than a swept chisel rectangle.

## Implementation

### `src/lib/ink.ts`

- `markerNibSize(tipStyle, thicknessMm)` — fixed upright half-extents:
  - `vertical`: `halfW = max(0.25, t × 0.14)`, `halfH = max(0.25, t × 0.5)`
  - `horizontal`: `halfW = max(0.25, t × 0.5)`, `halfH = max(0.25, t × 0.14)`
  - `squared`: `halfW = halfH = max(0.25, t × 0.5)`
  - `ball`: `halfW = halfH = max(0.25, t × 0.5)`
- `markerPath(points, thicknessMm, tipStyle = "vertical")`:
  - `ball` → `inkPath(points, thicknessMm, { thinning: 0 })`.
  - Dedupes consecutive points closer than `1e-4 mm`; a tap or a stroke under
    `0.05 mm` emits one crisp clockwise upright rectangle.
  - Longer strokes reuse the Phase 19 local 3-point quadratic midpoint spine
    (`buildSegments` + `buildSpine`), so appending samples never moves earlier
    geometry.
  - Each spine step emits the exact clockwise convex hull of the upright nib
    swept from `A` to `B` (four sign cases; collinear cases collapse naturally).
  - All hulls are joined into one SVG path. Every hull is clockwise in SVG
    y-down space, so `fillRule="nonzero"` fills the union at uniform opacity.

### Rendering / UI / export

- `src/components/canvas/AnnotationLayer.tsx`: committed and live draft markers
  both render the same `markerPath()` result as a single nonzero-fill `<path>`
  with `mixBlendMode: multiply`. The old `markerNib()` helper and the `+0.01 mm`
  two-point tap hack were removed.
- `src/components/PropertyControls.tsx`: the Highlighter live preview now uses
  `markerPath()` with the compressed `3..12` preview nib, so each tip shows its
  real chisel/round shape. A light paper backing (`#fffdf7`) keeps yellow/cyan/
  green highlights vibrant under `multiply` in Dark mode.
- `src/lib/pdfEngine.ts`: `drawMarker` exports the same `markerPath()` via
  `drawSvgPath({ color, opacity })`. pdf-lib emits one `f` (nonzero fill) for
  all sub-paths, so PDF overlaps stay uniformly transparent.
- `src/lib/annotationGeometry.ts`: marker bounds use `markerNibSize()` per tip;
  marker hit-testing uses an exact upright swept-rectangle test for chisel tips
  and radial distance for `ball`, so selection and eraser hits match the pixels.

## Tests

- `src/lib/ink.test.ts`
  - nib extents per tip
  - `ball` delegation to `inkPath(..., { thinning: 0 })`
  - single-tap exact upright rectangle for all three chisel tips
  - every vertex inside the exact upright band for a horizontal `vertical`-tip
    stroke
  - earlier sub-paths unchanged when points are appended (all three chisel tips)
  - every swept hull has positive signed area (clockwise / nonzero-safe)
- `src/lib/annotationGeometry.test.ts`
  - upright nib bounds and vertical-band hit testing
  - single marker tap hit testing
- `src/lib/pdfEngine.test.ts`
  - all four tips flatten to exactly one `f` each with zero stroke operators
  - all four tip styles survive the editable sidecar round-trip

## Verification

| Command | Result |
| --- | --- |
| `npx tsc -b` | PASS (exit 0) |
| `npm test` | PASS — 21 files, 160 tests |
| `npm run build` | PASS (exit 0, no warnings) |
| `cargo check --manifest-path src-tauri/Cargo.toml` | PASS (exit 0) |

## Known limits

- The swept-nib union is exact for the sampled spine; sampling density follows
  the Phase 19 rule (`max(0.08 mm, thickness × 0.25)`), so extremely thick
  highlighters trade a little path size for smooth curves.
- The live preview uses an artificial `3..12` nib so all four tips fit the
  preview box; the canvas and PDF always use the real millimetre nib.
