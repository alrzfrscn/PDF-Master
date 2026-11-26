# Phase 23 — Markdown/PDF Export, Persian RTL & Code Block Fixes

Real-world test file: a Persian + English Markdown document with tables, TOC links, `---` rules and bash fences, rendered in Reader/Split/Edit and exported to a 12-page PDF.

## Root causes found

| # | Symptom | Root cause |
|---|---------|------------|
| 1 | Every PDF page containing `---` was blank white | `rasterizeHtml` spliced raw HTML5 `innerHTML` into an `image/svg+xml` `<foreignObject>`. XML requires self-closed void tags; `<hr>`, `<br>`, `<input>` made the whole SVG fail to parse, so the page raster was empty. |
| 2 | White native scrollbars; editor scrollbar jumped to the far left on Persian text | Markdown panes used the undefined `.md-scroll` class, and the `<textarea dir="auto">` owns its own scrollbar, which Chromium places on the left for RTL content. |
| 3 | TOC `#anchor` clicks did nothing | Heading ids were built with a slugger that turned ZWNJ into `-` and no click interception existed; TOC links were never resolved. |
| 4 | Bash card had a native horizontal scrollbar, invisible Copy, broken Persian comments | `pre` used `overflow-x:auto`, the Copy button was `opacity:0` until hover, and the code font stack had no connected-script fallback. |
| 5 | Persian tables had column 1 on the left; list numbers clipped; inline flags scrambled | No document/block RTL detection, no `dir` on tables/lists, and inline `<code>` was not bidi-isolated. |

## Changes

### `src/lib/raster.ts`
- Added `toXhtmlFragment(html, style?)`: builds the fragment in a real DOM wrapper and serializes with `new XMLSerializer().serializeToString(...)`, guaranteeing `<hr/>`, `<br/>`, `<input .../>`, `<img .../>` and escaped entities.
- Strips UI-only chrome (`.md-copy`, `button`) before serialization.
- `rasterizeHtml` now embeds that XHTML in the `foreignObject`, so no page can fail XML parsing.

### `src/lib/markdown.ts`
- `slugifyHeading`: GitHub/Persian slugger — strips inline Markdown, removes ZWNJ/zero-width/bidi marks, folds Arabic `ي/ى/ك` to Persian `ی/ک`, lowercases, removes punctuation while keeping `\p{L}`/`\p{N}`, and collapses whitespace/hyphens.
  - `## 1. دستورات شل و زیرفرمان‌ها (\`agy\`)` → `1-دستورات-شل-و-زیرفرمانها-agy`
  - `## 4. اسلش‌کامندها (Slash Commands)` → `4-اسلشکامندها-slash-commands`
- `isPredominantlyRtl`: Persian/Arabic vs Latin prose count, with first-strong-character tie-break; fenced/inline code ignored.
- `renderMarkdown`:
  - Sets `dir="rtl"|"ltr"` per `<table>`, `<ol>`, `<ul>` (root `<article>` direction is set by the viewport).
  - Code fences now become `.md-code-block` → `.md-code-head` (uppercase language badge + visible Copy button with icon and `Copy` → `Copied!`) → wrapping `<pre>`.
- Pagination in `exportMarkdownToPdf`:
  - `splitTablePages` splits a table **between `<tbody><tr>` rows**, cloning `<thead>` onto every chunk so no row is cut and continued tables stay readable.
  - Headings `h1..h4` break to the next page when the following block cannot fit, so no heading is orphaned.
  - Oversized non-table blocks keep the documented overflow shortcut; tables are always split.
- Export styling:
  - Always paper-white `#ffffff` / ink `#14161b` (independent of app theme) for clean highlighter/pen annotation.
  - `white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; overflow-x:hidden` on `pre`/`code`.
  - Logical `text-align:start`, `border-inline-start`, `list-style-position:outside`, `padding-inline-start`.
  - Inline code `direction:ltr; unicode-bidi:isolate`; code font stack includes Persian-friendly fallbacks.
  - Root `.md-pdf` gets `dir` from the detected document direction.

### `src/components/MarkdownViewport.tsx`
- Reader and Split preview use `.doc-scroll`; Edit/Split editor is wrapped in a `dir="ltr"` `.doc-scroll` host with `padding-left:72px; padding-right:28px`.
- Editor `<textarea dir="auto">` is `overflow:hidden` and auto-grows via `useLayoutEffect` (plus window resize), so the only scrollbar is the host's and stays on the right, clear of the left rail.
- Anchor interception on the article:
  - `#fragment`: `preventDefault`, `decodeURIComponent`, exact id match then fuzzy `slugifyHeading` match (handles ZWNJ and `--`), smooth scroll + brief highlight.
  - `http(s)`: `preventDefault` and open in a new tab; if blocked, copy the URL and toast instead of navigating the Tauri window away.
- Copy button updates its inner `<span>` (`Copy`/`Copied!`) and reads from `.md-code-block`.
- Root `<article>` (reader and print sheet) gets `dir` from `isPredominantlyRtl`.

### `src/index.css`
- `.md-viewport .doc-scroll` keeps themed slim scrollbars but restores `touch-action:pan-y` and text selection for reading/editing.
- RTL-aware tables/lists (`text-align:start`, logical padding, extra RTL list padding).
- Inline code bidi isolation.
- Apple-style code card: header strip, uppercase badge, always-visible Copy button with icon, zero horizontal scrollbar, wrapping body, Persian-capable code font stack.
- Heading anchor flash highlight; print sheet hides code chrome and wraps code.

### `src/lib/save.ts`
- “Annotate as PDF” opens the result as `<title> (PDF)` so it is distinct from the `.md` tab.

## Tests added (`src/lib/markdown.test.ts`)
- XHTML serialization self-closes `<hr>`, `<br>`, `<input>`, `<img>` and parses cleanly as `image/svg+xml` (no `parsererror`).
- Copy chrome is stripped before rasterizing.
- `slugifyHeading` Persian/ZWNJ/double-hyphen cases and heading-id generation.
- `renderMarkdown` sets `dir="rtl"` on Persian tables/lists, `dir="ltr"` on English tables, isolates inline code, and builds the code header card.
- `isPredominantlyRtl` detection.
- `splitTablePages` splits between rows, repeats `<thead>`, and fills the current page first.
- `exportMarkdownToPdf` on a mixed document (multiple `---`, a 30-row table, a bash fence) produces **no blank pages**, multiple pages, repeated table headers, and all 30 body rows exactly once.

## Verification

```
npx tsc -b                              → exit 0
npm test                                → 22 files, 195 tests passed
npm run build                           → built in 1.71s, 0 errors/warnings
cargo check --manifest-path src-tauri/Cargo.toml → Finished, 0 warnings
```
