# PHASE 1 — Static Reconnaissance & Asset Extraction Report
## PDF Annotator 10.0.0.1011 — Redesign / Modernization Baseline

| | |
|---|---|
| Target | `C:\Program Files\PDF Annotator` (read-only, nothing modified or executed) |
| Product | PDF Annotator 10.0.0.1011 — GRAHL software design, build date 2026‑04‑20 |
| Recon date | 2026‑11‑16 |
| Method | PE metadata parsing (in-house `scripts/pe_scan.py`), REA portable PE inspectors (imports/exports), XML/ZIP parsing, CHM decompilation, byte-level signature analysis. **No native decompilation, no unpacking, no execution of target binaries.** |
| Deliverables | this report + `scripts/inspect_assets.py`, `scripts/pe_scan.py`, `scripts/exe_resources.py`, `scripts/pe_meta.py`, `scripts/parse_help.py`, `scripts/help_digest.py`, `scripts/out/*.json`, `scripts/out/help_digest.md` |

---

## 1. Executive Summary — the original architecture, and why it is heavy

PDF Annotator 10 is a **32/64-bit native Windows VCL application** whose core was never re-platformed. Four independent stacks are glued together in one process:

| Layer | Technology (evidence) | Consequence |
|---|---|---|
| App shell / UI | **Delphi VCL + DevExpress VCL** *(inferred: DevExpress-only resource names + `TColor`/`True`/`False` encodings + no CLR/.NET; DFM payloads are packed so the compiler cannot be confirmed directly)* — `DXSKINS`, `DXNAVBARSKINS`, `RCDATA` names `ACTIONS_DARK_LG`, `ADVGRAPHICS*SVG`, `CX*`/`DXSPREADSHEET*` glyph resources (§3.5) | Windows-only, high-DPI/skin driven UI, ~690 bitmap resources, ribbon/navbar redraw cost, no declarative UI model we can port |
| PDF engine | **PDF‑XChange Editor SDK 10.8.4.409** — `PDFXEditSimple.x64.dll`, 41.5 MB, exports `PXCV_*` (§3.4) | closed-source raster/print pipeline, GDI-centric (`gdi32`, `MSIMG32`, `mscms`), page rendering bound to CPU raster |
| Image handling | **ImageEn 8.1.5.0** (`ielib64.dll`) + a bundled image editor UI | duplicate imaging stack alongside PDF-XChange |
| Application code | **MPRESS-packed PE** — sections `.MPRESS1` (entropy 8.0), `.MPRESS2`, `.rsrc`; imports reduced to a 2-function KERNEL32 stub in the loader table (§3.3) | the entire app (forms, string tables, icons, DFMs) is compressed; cold start pays unpack cost, and nothing of the UI is statically inspectable |

**Why the product feels heavy and slow — three concrete, evidence-backed causes:**

1. **Annotations are persisted as raster images, not vectors.** The manual states plainly: *"PDF Annotator saves your annotations to a PDF document in the form of transparent images. The resolution of these images determines the sharpness … 72 dpi (low), 150 dpi (standard), 300/600/1200 dpi"* (`optsavequality.htm`). Every save re-rasterizes ink at a user-chosen DPI and embeds transparent images per page → file bloat, slow save, resolution-dependent quality. "Melting" annotations (Edit ▸ Melt All Annotations) exists precisely because the editable form is sidecar data, not real PDF content.
2. **GDI rasterization everywhere.** `PDFAnnotator.exe` imports `gdi32`, `gdiplus`, `msimg32`-class imaging via its SDK, plus `FontSub`, `usp10`, `avifil32`, `MsVfW32` (legacy Video-for-Windows, used for the `PA_WAIT.AVI` splash). No Direct2D/Direct3D/Vulkan path exists in the shipped binaries — there is no GPU acceleration to inherit.
3. **An 8.4 MB XML tool-preset file is the app's tool model.** `PADefaultToolData.pat` (8,670,888 bytes) is a plain UTF‑8 XML that defines **617 presets** (464 of them hex-encoded GIF stamps: ~4.4 MB of binary art carried as ~8.4 MB of hex text). It is loaded/parsed by the VCL app at startup or on toolbox open, in a DOM-style parse — a single-core XML read for what should be a 200 KB binary cache.

Also relevant for UX parity: the app is Chinese-wall localized through **compressed binary language modules** (`.ENG/.DEU/.FRA` + `.lng`), not resource files, so translations cannot be diffed or reused as text (§3.6).

**Verdict for the redesign:** the parts worth keeping are *data and behaviour* (tool presets, stamps, paper templates, feature set, shortcuts), not *code*. All of that lives in **loose, documented, parseable files** — which is why Phase 1 succeeded despite the packed executable.

---

## 2. Method, constraints, and what could not be recovered

* Target directory was only read (`Get-ChildItem`, `Get-Content -TotalCount`, raw byte reads). Nothing was written, deleted, or executed inside `C:\Program Files\PDF Annotator`.
* Multi-MB files were never dumped into the analysis context: parsing was done by local Python scripts producing counts, schemas and truncated samples (`scripts/inspect_assets.py --json scripts/assets.json`).
* No Ghidra/IDA decompilation. REA was used only for its portable PE table readers:
  * `inspect_pe_imports` → evidence `ev_6d219aa5…` (exe), `ev_2e577fc8…` (PDFXEdit), `ev_5b17be68…` (ielib64), `ev_ec1a9957…` (paHelper), `ev_69a77d9f…` (goa.exe)
  * `inspect_native_exports` (`PXCV_*`) → evidence `ev_6013dd46…`
  * `inspect_pe_resources` **failed by design of the target**: *"Resource range is not entirely file-backed in one section"* — the observed signature of MPRESS packing. This is recorded as a finding, not an error.
* **Not recoverable in Phase 1 (and not claimed):** Delphi DFM form definitions, menu/action trees, accelerator tables, RT_STRING UI text, tool icons and `SVG`/`PNG` assets from the exe. All 1,993 resource entries except icons/version/manifest live in MPRESS-compressed address space (`.MPRESS1` VSize 85,942,272 vs RawSize 18,974,208), i.e. their RVAs are **not** file-backed (`0/505` STRING blocks, `0/690` RCDATA, `0/107` SVG readable). Absence here is *not* proof they do not exist — they are compressed, not missing.
* Consequently, the **feature/UI taxonomy in §5 is derived from three independent, non-binary sources**: the shipped `.pat` preset file, the shipped `PAStyleTemplates.xml`, and the 119-topic English help set (decompiled from the CHM). Where a claim is inference, it is marked *(inferred)*.

---

## 3. Binary & Resource Analysis (Task 1)

### 3.1 Install inventory — 93.9 MB, 18 files + 8 language files

| File | Bytes | Identity / version | Notes |
|---|---|---:|---|
| `PDFAnnotator.exe` | 19,420,160 | `PDFAnnotator` 10.0.0.1011, © 2004‑2026 GRAHL | **MPRESS-packed**, x86‑64, subsystem GUI |
| `PDFXEditSimple.x64.dll` | 41,453,016 | **PDF‑XChange `SimpleViewDLL` / `pxcview.dll` 10.8.4.409**, © PDF‑XChange Co Ltd | PDF engine; exports `PXCV_*` |
| `ielib64.dll` | 3,268,056 | **ImageEn 8.1.5.0**, © 2011‑2024 imageen.com | image editor backend |
| `paHelper.exe` | 6,285,784 | GRAHL helper (no version block) | printer helper, x64 |
| `paHelper32.exe` | 4,125,144 | GRAHL helper | same, x86 (also installed to `C:\Program Files\Print2PDFAnnotator`) |
| `goa.exe` | 1,090,008 | `goa` 10.0.0.1011, © GRAHL | x86, "GRAHL output adapter" (print pipeline) |
| `PADefaultToolData.pat` | 8,670,888 | XML, UTF‑8 BOM | **464 stamps + 153 tool presets** |
| `PADefaultTemplates.pap` | 1,035,841 | **ZIP** (deflate) | 2 PDF note-paper templates |
| `PAStyleTemplates.xml` | 37,691 | XML | 129 parametric paper templates |
| `pad_file.xml` | 15,440 | PAD XML | marketing/product metadata (version, price, update URLs) |
| `ReadMe_EN.txt` | 2,935 | text | version, support and licensing notes |
| `setup.ini` | 51 | INI | `[Setup] CheckForUpdates=False`, `UninstallSurvey=1` |
| `aspr_keys.ini` | 84 | INI | ASProtect-style registration placeholders (§3.7) |
| `PDFAnnotator_EN.chm` / `_DE.chm` | 267,371 / 289,472 | HTML Help | **119 topics, 333 index keywords** (EN) |
| `Languages\*` | 8,571,013 | compressed modules | 3 languages + native strings (§3.6) |
| `unins000.exe/.dat/.msg` | 3,884,222 | **Inno Setup** uninstaller | install manifest leaks file list (§3.9) |

### 3.2 Runtime topology (from import tables)

```
PDFAnnotator.exe (VCL UI, MPRESS-packed)
 ├─ PDFXEditSimple.x64.dll ── PDF render/print/edit   (loads gdi32, msimg32, mscms, usp10, wininet, ktmw32)
 ├─ ielib64.dll ───────────── ImageEn image codec/edit (WS2_32 ordinals, OLEAUT32)
 ├─ advapi32/ole32/oleaut32 ─ COM, registry, licensing
 ├─ gdiplus/gdi32/usp10 ───── raster + text shaping
 ├─ winspool.drv ──────────── virtual printer ("Print to PDF Annotator")
 ├─ avifil32/MsVfW32 ──────── legacy Video-for-Windows, for the `PA_WAIT.AVI` wait animation (resource name observed)
 ├─ wintrust/Crypt32/wininet/URLMON ─ update check, PAD/NewsFeed fetch, signature check
 └─ paHelper(32).exe ──────── printing/devenum helper (winspool: DocumentPropertiesW, OpenPrinterW; wtsapi32)
```
`paHelper*.exe` import set (`winspool`, `wtsapi32`, `gdi32`, `msvcrt`) is a print-driver configuration helper; `goa.exe` (x86, same subset) is the print output adapter. Neither contains PDF logic.

### 3.3 `PDFAnnotator.exe` — packing and what survives

| Observation | Value |
|---|---|
| Sections | `.MPRESS1` (VSize 85.9 MB / Raw 18.97 MB, **entropy 8.00**), `.MPRESS2` (6,968 B, 4.76), `.rsrc` (437,944 B, 3.78) |
| Loader imports | **29 DLLs, but only 2 functions from KERNEL32 in the file** (`GetModuleHandleA`, `GetProcAddress`) → classic unpacker stub; the real IAT is built at runtime |
| Delay-import directory | RVA 60,002,304, 37,428 bytes (also inside packed space) |
| COFF timestamp | 1776675702 → 2026‑04‑20 (matches VERSION `Montag, 20. April 2026 11:00`) |
| Packer signature scan | no `UPX`/`ASPack`/`Themida`/`VMProtect` strings; the `.MPRESS1/.MPRESS2` section names are the MPRESS signature |
| `TPF0` (binary DFM) occurrences | **0** in file bytes → expected for a packed image |

**Resource directory survives, payloads do not.** The `.rsrc` tree enumerates 1,993 entries, but the data-entry RVAs point into the packed virtual range:

| Resource type | Entries | Entries with file-backed payload |
|---|---:|---|
| `RT_ICON` (3) | 13 | **13/13** (group icon + manifest + VERSION readable) |
| `RT_VERSION` (16) | 1 | 1/1 |
| `RT_MANIFEST` (24) | 1 | 1/1 |
| `RT_STRING` (6) | 505 blocks | **0/505** |
| `RT_RCDATA` (10) | 690 | **0/690** |
| `RT_BITMAP` (2) | 198 | 0/198 |
| `RT_CURSOR` (1) / `RT_GROUP_CURSOR` (12) | 288 / 122 | 0 |
| `RT_DIALOG` (5) | 5 (`TEXTFILEDLG`, `IDD_IETEMPLATE1‑2`, `DLGTEMPLATE`) | 0 |
| `SVG` (custom) | 107 | 0 |
| `PNG` (custom) | 45 | 0 |
| `DXSKINS` / `DXNAVBARSKINS` | 9 / 5 | 0 |
| `MAD` | 2 (`CALIBRATE`, `EXCEPT`) | 0 |
| `AVI` | 1 (`PA_WAIT.AVI`) | 0 |

*Interpretation:* the **resource directory (names)** was left in place by MPRESS while **payloads** were moved into the compressed block → we can read the *names* of 690 bitmaps and 107 SVGs but not their pixels. Recovery would require unpacking or runtime dumping — explicitly out of Phase 1 scope.

### 3.4 PDF engine — PDF‑XChange Editor SDK

`PDFXEditSimple.x64.dll` is the *Simple Viewer* wrapper of the PDF‑XChange Editor SDK:

* exports (`ev_6013dd46…`) — exactly **23**, the whole Simple-Viewer API: `PXCV_Init`, `PXCV_ReadDocumentW`, `PXCV_ReadDocumentFromMemory`, `PXCV_ReadDocumentFromIStream`, `PXCV_FinishReadDocument`, `PXCV_DrawPageToDC`, `PXCV_DrawPageToDIBSection`, `PXCV_DrawPageToIStream`, `PXCV_GetPagesCount`, `PXCV_GetPageDimensions`, `PXCV_GetPageRotation`, `PXCV_GetDocumentInfoW`, `PXCV_GetPermissions`, `PXCV_CheckPassword`, `PXCV_SetCallBack`, `PXCV_ReleasePageCachedData`, `PXCV_ReleaseCachedData`, `PXCV_Delete`, `PXCV_Err_FormatErrorCode/Facility/Severity` (+2 unnamed ordinals). Notably **no text-extraction, no annotation, no edit API** — PA keeps its own annotation model and only uses the SDK to read/measure/rasterize pages.
* sections: `.text`, `.rdata`, `.data`, `.pdata`, **`.fptable`** (PDF‑XChange's floating-point lookup tables), `.rsrc`, `.reloc`; no managed code, no CLR.
* imports of note: `GDI32`, `MSIMG32` (alpha blitting), `mscms` (ICC colour management), `USP10` (Uniscribe shaping), `WINSPOOL.DRV` (direct printing), `CRYPT32`/`WININET` (signatures/online), `ktmw32` (transactions), `RPCRT4`.
* API surface is *procedural C* — meaning the new app can still use this SDK as a headless renderer behind a thin FFI layer if a commercial engine swap is deferred. **This is the single largest architectural leverage point**: the annotation/raster model, not PDF parsing, is what must be replaced.

### 3.5 UI framework — Delphi VCL + DevExpress

Evidence (all from the exe's resource *names*, which survive packing):

* `DXSKINS`: `PA_DARK`, `PA_LIGHT`, `PA_W11`, `OFFICE2013WHITE`, `OFFICE2019BLACK`, `WXI`, `DEFAULTSKINICON*`, `DEFAULTUSERSKINDATA`
* `DXNAVBARSKINS`: `HAMBURGERMENU`, `OFFICE12_BLUE/SILVER/BLACK`, `VISTA`
* `SVG`/`PNG` glyph sets prefixed `CX*` (ExpressEditors), `DXNAVBAR*`, `DXSPREADSHEET*` → **DevExpress VCL** (cxEditors, dxNavBar, dxSkinController, **dxSpreadsheet**)
* `RCDATA` names: `ACTIONS_DARK_LG/SM`, `ACTIONS_LIGHT_LG/SM`, `ADVGRAPHICS*SVG`, `BBABORT`, `BBCANCEL`, `BBCLOSE` (ExpressQuantumGrid/Bar button glyphs)
* `MAD`: `CALIBRATE`, `EXCEPT` → **madExcept** crash reporting (matches the `bugreport.txt` path in the install log)

Design implications for the redesign: the `PA_DARK` / `PA_LIGHT` / `PA_W11` skins tell us the three shipped themes users expect; the ribbon/navbar structure plus "Toolbox", "Tool Switch", "Sidebar", "Document Tabs" (see §5.4) is the information architecture to re-express in a modern declarative UI.

### 3.6 Language modules — compressed, not text

| File | Size | Header |
|---|---:|---|
| `Languages\lang.ini` | 30 | text: `[Setup] Version=10.0.0.1011` |
| `PDFAnnotator.ENG` | 2,173,912 | `4D 5A 50 00` = `MZP\0` — proprietary container (DOS-EXE-like stub, not a PE: no `PE\0\0` at e_lfanew) |
| `PDFAnnotator.DEU` / `.FRA` | 2.21 MB each | same |
| `PDFAnnotator.ENG.lng` | 485,085 | `4C 5A 4B 30` = `LZK0` — proprietary LZ container |
| `PDFAnnotator.ntv.lng` | 481,049 | same (native/language selection strings) |

Neither format is a standard PE/MZ/zip; strings are not recoverable without the app's own decompressor. **English UI strings must therefore be re-authored** (help text in §5.4 is a reliable source for wording) or captured at runtime in a later phase.

### 3.7 Licensing

`aspr_keys.ini` (84 B):
```ini
[names]
1=PAS10R1-SH123456789R1
[keys]
1=AB123C-DEF45-67GHI-89JK1-LM23N-O456P
```
Placeholder values for an **ASProtect-style registration scheme** ("PAS10R1" = PDF Annotator Suite 10 Release 1). Combined with `wintrust`/`Crypt32` imports and PAD update URLs (`http://www.ograhl.com/pdfannotator/std/en/refupd/PDFAnnotatorSetup.exe`), licensing/update is name+key based, not online-account based. Nothing here is a migration blocker; do not carry the scheme over.

### 3.8 Product metadata (`pad_file.xml`, PAD 4.0)

`<XML_DIZ_INFO>` sections: `MASTER_PAD_VERSION_INFO`, `Company_Info`, `Program_Info`, `Program_Descriptions`, `Web_Info`, `Permissions`, `DeuPAD`, `ASP`, `UpdateWizard`, `NewsFeed`, `Press_Release`. Key values: version `10.0.0.1011`, release `2026‑04‑20`, status "Major Update", type "Shareware", USD/EUR 79.95, languages "German,English,French", OS "Windows 10, Windows 11", installer size 138 MB, unique IDs `{8124F07A-…}` / `{97D8B65F-…}`.

### 3.9 Install manifest leak (`unins000.dat`)

The Inno Setup log lists files not present in the current tree — useful to know the full product surface (printer component, per-user config):

```
…\PDF Annotator\PDFAnnotator.exe, paHelper.exe, paHelper32.exe, PDFXEditSimple.x64.dll,
   ielib64.dll, goa.exe, PDFAnnotator_EN.chm, PDFAnnotator_DE.chm,
   History_EN.txt, History_DE.txt, License_EN/DE/FR.txt, ReadMe_EN/DE/FR.txt,
   pad_file.xml, PADefaultToolData.pat, PAStyleTemplates.xml, PADefaultTemplates.pap
…\Print2PDFAnnotator\paHelper.exe, PDFAnnotator.ico, unins000.*      ← virtual printer component
…\Common Files\PDF Annotator\PDFAnnotatorSetup.exe                    ← shared updater
…\PDF Annotator\versions.txt, key.ini, OnStartupToolConfig.pat, NovaPA.ini
```
`OnStartupToolConfig.pat` confirms the `.pat` format is also the **runtime/user** tool-config format (not just factory defaults).

---

## 4. Asset Schema & Extraction Blueprint (Task 2)

### 4.1 `PADefaultToolData.pat` — the tool model

* **Format:** plain XML, UTF‑8 **with BOM**, CRLF, 8,670,888 bytes (`<?xml version="1.0" encoding="UTF-8"?>`). No archive, no base64 wrapper beyond per-stamp hex payload.
* **Root:** `<Tools>` with exactly four sections plus a group table:

```
<Tools>
  <Groups>      21 × <Group GroupID="{GUID}" Category="0..6" Position="n" [ToolVersion="n"]>
                    <GroupCaption [Language="DEU"]>text</GroupCaption>   (1..2 per group)
  <InkTools>    75  → <Pen> 49, <Marker> 26
  <TextTools>   30  → <Text>
  <StampTools>  464 → <Stamp> … <Description>…</Description><Grouped>True</Grouped><InkData>hex</InkData>
  <GOTools>     48  → <GraphicalTool TypeCode="0|1|2|3|6">
```
Counts verified: 617 preset elements, 788 `<Description>`, 464 `<InkData>`, 377 `<Grouped>True</Grouped>` / 87 unset.

**Group table (all 21, `Category` = tool family):**

| Category | Group caption (EN) | Tools |
|---|---|---|
| 0 | Standard | 8 Pen, 4 Marker, 5 Stamp, 3 Text, 4 Graphical |
| 1 | Standard / **Technical Pens** | 30 Pen + 9 ISO technical pens |
| 2 | Standard | 20 Marker |
| 3 | Standard, Small/Large Icons, Small/Large Arrows, Small/Large Black Icons/Arrows, **Stamps**, **Time & Date**, **Proofreading**, **Proofreading Small** | 464 Stamp (see §4.1.2) |
| 4 | Standard | 25 Text |
| 5 | Standard, **Semitransparent Rectangles**, **Dimension** | 44 + 5 + 2 Graphical |
| 6 | Full Screen | 2 Pen, 2 Marker, 2 Stamp, 2 Text |

`Category=6` groups are the "Full Screen" toolbox variants (matches help topic `optfullscreen.htm`). `ToolVersion` marks presets introduced/changed by tool-schema revisions (values 1,2,3,5 present) — i.e. GRAHL already versions tool records; our importer must tolerate it.

**Pen / Marker attribute schema (observed keys and value domains):**

| Attr | Domain (observed) | Meaning |
|---|---|---|
| `Color` | `0`, `255`, `16711680`, `32768`, `8421504`, `65535`, `16711935`, `65280`, `16776960` | **Delphi `TColor` = `0x00BBGGRR`** → `255`=red, `16711680`=`$FF0000`=blue, `32768`=green, `8421504`=grey |
| `Thickness` | `68,74,100,102,142,198,200,283,400,600,800,1200,1600,2400` | **hundredths of a millimetre** (1.00 mm … 16.00 mm marker). Inferred from the ISO nib series 0.68/0.74/1.02/1.42/1.98/2.83 ≈ 0.7/1.0/1.4/2.0/2.8 |
| `Sensitivity` | `True` 40 / `False` 9 | pressure-sensitive width |
| `Snapping` | `False` (all) | snap-to-grid/aux-lines |
| `DPI` | `144` (47), `96` (2) | ink sampling resolution |
| `ToolVersion` | `3` | schema rev |
| `InkOnText`, `InkOnTextLineMode` | `False`, `0` | text-aware inking (2 presets) |

**Text tool schema:** `TextboxColor` (clNone `536870911`=**0x1FFFFFFF**, `16777215` white, `12648447`=`$C0FFFF` pale yellow …), `TextboxFrametype` `0|1|2|3`, `TextboxFrameColor`, `Fontname` (all `Arial`), `Fontsize` `8…16`, `Fontcolor` `0`, `StyleBold/Italic/Underline/StrikeOut` (all False in defaults).

**Graphical tool schema:** `TypeCode` `0|1|2|3|6` (inferred: 0=Line, 1=Arrow, 2=Rectangle, 3=Ellipse, 6=Dimension — matching group/attribute evidence: type 1 carries `ArrowHead=10`, type 2/3 carry `BackColor`+`InkTransparency`, type 6 carries `CalibratedUnit/CalibratedDistance/MeasuredUnit/MeasuredDistance`), `LineStyle` `0|1|2|3|5`, `LineWidth` `0|98|100|200`, `ArrowHead` `0|3|5|10`, `ArrowTail` `0|3|6|7`, `InkTransparency` `0|50` (%), `Snapping` (2× `True`), `DPI`.

#### 4.1.1 Stamp record schema and payload

```xml
<Stamp Category="0" GroupID="{CFE54438-…}" Position="15">
  <Description>Check</Description>
  <Description Language="DEU">Erledigt</Description>
  <Grouped>True</Grouped>
  <InkData>47494638396121002100F70000…</InkData>   <!-- 935 … 27,872 bytes of hex -->
</Stamp>
```
* **`InkData` = hex-encoded complete GIF file.** Verified: `GIF89a` magic in all 464, and **464/464 decode to valid images** (Pillow `Image.open().load()`), sizes 7×12 … 135×44 px (dominant 33×33 ×154, 65×65 ×147 — i.e. "small"/"large" icon sets are the same art at two raster sizes).
* Payload size: min 935 B, median 9,456 B, max 27,872 B → **~4.4 MB of binary art** currently carried as ~8.8 MB of hex text.
* `Grouped=True` (377) = stamp is a composite/contains multiple annotations; unset (87) = single image.
* 145 distinct English descriptions (plus one unnamed entry), e.g. `Check`, `Cross`, `Question`, `Warning`, `Star`, `APPROVED`, `CONFIDENTIAL`, `DRAFT`, `COMPLETED`, plus German-only proofreading marks (`Absatz`, `Doppelbogen`, `Einzug tilgen I`, `Durchschuss zu klein`, `Blockadezeichen`), plus time/date stamps (`Datum: ISO-Form`, `DATUM/UHRZEIT`).

#### 4.1.2 Stamp inventory by group (464)

| Group | Count | | Group | Count |
|---|---:|---|---|---:|
| Large Icons | 50 | | Proofreading (`Korrekturzeichen`) | 43 |
| Small Icons | 50 | | Proofreading Small | 43 |
| Large Black Icons | 46 | | Stamps (`Stempel`) | 36 |
| Small Black Icons | 46 | | Large/Small Black Arrows | 25 / 25 |
| Large/Small Arrows | 42 / 42 | | Time & Date | 9 |
| Standard | 5 | | Full Screen | 2 |

### 4.2 `PADefaultTemplates.pap` — a ZIP with two PDFs

```
PK\x03\x04 … deflate
├── Notes_IMPERIAL.pdf   549,229 B (515,251 packed)  header "%PDF-" ✔
└── Notes_METRIC.pdf     554,585 B (520,348 packed)  header "%PDF-" ✔
```
**No folders, no grid assets, no metadata.** The `.pap` format is simply "a ZIP of finished note-paper PDFs" (2 entries, both validated as PDF). All the *parametric* paper art lives in `PAStyleTemplates.xml` instead — the two files are complementary: `.pap` = pre-rendered metric/imperial note pages, `.xml` = generator recipes (shown in the *New Document* dialog).

### 4.3 `PAStyleTemplates.xml` — 129 parametric paper templates

```
<Templates>
  <Template Style="blank|line|karo|mm|grid" [IsMetric="true"]>
    <Page Cnt="1" Size="A4|Letter">
      <Bounds Left="19.5" Top="11.0" Right="10.1" Bottom="11.0"/>   <!-- margins, optional -->
    </Page>
    <Lines Width="0.1" Color="$aaaaaa">
      <Line DeltaX="5.0" DeltaY="5.0" [HighlightMinor="5" HighlightMajor="10"]/>
      <!-- or --> <Grid Delta="5.0"/>
    </Lines>
  </Template>
```

| Metric | Value |
|---|---|
| Templates | **129** (1 blank, 48 `line`, 54 `karo`, 8 `mm`, 18 `grid`) |
| Page sizes | `A4` ×60, `Letter` ×69 |
| Orientation | `IsMetric` true 51 / false 69 / absent 9 |
| With `<Bounds>` (margins) | 55 |
| Line widths | `0.1` (ruled) and `0.25` (grid) — units mm |
| Colours | `$aaaaaa` grey, `$0000FF` blue, `$EEC494` tan (HTML `#RRGGBB`, `$` prefix) |
| Pitches | metric `5/7/10 mm`; imperial `1.5875/2.54/3.175/5.08/6.35/25.4 mm` (= 1/16″…1″); `line` style uses `DeltaY` only (`6.4/7.6/10.16/12.7 mm` = 0.25/0.3/0.4/0.5″) |
| Note | `A0‑A10, B0‑B10, ISOB0‑ISOB10, C0‑C7, DL, Letter, Legal, Statement, Tabloid, Ledger, Executive, Folio` are supported by the parser (documented in the file's header comment) even though the shipped set only uses A4/Letter |

### 4.4 Configuration files

| File | Format | Content |
|---|---|---|
| `setup.ini` | INI | `CheckForUpdates=False`, `UninstallSurvey=1` |
| `aspr_keys.ini` | INI | licence placeholders (§3.7) |
| `pad_file.xml` | PAD 4.0 XML | product/version/price/URLs (§3.8) |
| `ReadMe_EN.txt` | text | version 10.0.0.1011, 2026‑04‑20, Win 10/11 only, contact data |
| `%LOCALAPPDATA%\PDF Annotator\PAGlobalConfig.cfg` | **hex-encoded blob** (30,090 B, 32 hex chars/line) | all global settings; not plaintext, presumably compressed/encrypted → **settings schema must be re-authored, not imported** |
| `%LOCALAPPDATA%\PDF Annotator\10.0\Tools\*.pai` + `*_48.bmp` | **397 `.pai` (raw GIF89a)** + 396 `_48.bmp` thumbnails | per-user stamps/tool images, filename = tool `{GUID}`. This is the real-world custom-stamp store and the highest-value user data to migrate |

### 4.5 Portable recon tooling produced in Phase 1

| Script | Purpose |
|---|---|
| `scripts/inspect_assets.py` | parses `.pat`, `.pap`, `PAStyleTemplates.xml`, `pad_file.xml` → `scripts/assets.json` (schemas, domains, samples, listing) |
| `scripts/pe_scan.py` | tolerant PE reader: headers, sections+entropy, imports, resource tree (works on packed images), packer/DFM signature scan |
| `scripts/exe_resources.py` | resource inventory, VERSIONINFO, RT_STRING decode, asset naming → `scripts/out/exe_resources.json` |
| `scripts/pe_meta.py` | VS_VERSIONINFO (fixed-file-info + key/value), import summary → `scripts/pe_meta.json` |
| `scripts/parse_help.py` | CHM TOC/index/topic-heading extraction → `scripts/out/help_topics.json` |
| `scripts/help_digest.py` | compact per-topic text digest → `scripts/out/help_digest.md` (source for §5) |

---

## 5. Complete Feature & Tool Matrix (Task 3)

Sources: `.pat` presets (parameters), `PAStyleTemplates.xml` (paper), help TOC/topics (behaviour, defaults, gestures). 119 help topics / 333 index keywords were catalogued; nothing below is guessed from marketing copy.

### 5.1 Annotation tools — full matrix

| # | Tool | Preset element | Presets | Configurable attributes (from file) | Behavioural attributes (from help) |
|---|---|---|---:|---|---|
| 1 | **Pen** | `<Pen>` | 49 | Color, Thickness (1–16 mm), Sensitivity, Snapping, DPI, InkOnText | Tip style, Auto‑Smooth (line/rect/circle/triangle snapping), Auto‑Snap Underline/Underline‑Wave/Strike‑Out, Shift = temp. smooth, pressure width |
| 2 | **Marker / Highlighter** | `<Marker>` | 26 | same as Pen (thicker: 8–24 mm) | Tip styles **Vertical / Horizontal / Squared / Ball**, Auto‑Snap Highlight, never property-synchronised with Pen |
| 3 | **Text box** | `<Text>` | 30 | TextboxColor, TextboxFrametype (0–3), TextboxFrameColor, Fontname, Fontsize, Fontcolor, Bold/Italic/Underline/StrikeOut | Alignment L/C/R, Sub/Superscript, Fill + Border colour, Auto‑Fit, Ctrl+M fit, max-width default, on‑screen keyboard |
| 4 | **Line** | `<GraphicalTool TypeCode=0>` | 7 | Color, LineStyle, LineWidth, Snapping | Ctrl = draw from centre; Connect Lines; Snap to 15° (Shift) |
| 5 | **Arrow** | `TypeCode=1` | 18 | + ArrowHead (0/3/5/10), ArrowTail (0/3/6/7) | same as Line |
| 6 | **Rectangle / Square** | `TypeCode=2` | 13 | Color, BackColor (clNone allowed), LineStyle, LineWidth, InkTransparency (0/50 %) | Square/Rectangle switch, Shift = square, opacity |
| 7 | **Ellipse / Circle** | `TypeCode=3` | 8 | same as Rectangle | Circle/Ellipse switch, Shift = circle |
| 8 | **Polygon** | `TypeCode` (no default preset found) | 0 | same family attributes *(inferred)* | ≥3 points, Close/Accept/Discard, Connect Lines, Snap 15° |
| 9 | **Dimension** | `TypeCode=6` | 2 | Color, LineWidth, Snapping, `CalibratedUnit`, `CalibratedDistance`, `MeasuredUnit`, `MeasuredDistance`, DPI | Distance vs Area mode, extension + dimension line + text, Display Unit, editable dimension text, Scale list, Connect Lines |
| 10 | **Stamp** | `<Stamp>` | 464 | Description (multi-language), Grouped, InkData (GIF) | Click-to-place then move/resize; "Save as stamp" from selection; stamp from image file; Duplicate to All/Next/… pages |
| 11 | **Eraser** | — (no preset) | — | — | Whole Annotation/Stroke vs **Split Strokes**, eraser widths, stylus-eraser end, scratch-out gesture |
| 12 | **Select** | — | — | — | Rectangular select, move/resize, Keep Aspect Ratio (Ctrl/Shift), align L/R/CH/T/B/CV + space equally, rotate (angle+direction), flip H/V, duplicate, style edit per property checkbox |
| 13 | **Lasso select** | — | — | — | Freeform select |
| 14 | **Measure** | — (temporary, not persisted) | — | — | **Distance, Perimeter, Area, Angle**, live readout, custom scale, "Measure on document" calibration, scale list manager (add/edit/delete/reorder/reset) |
| 15 | **Snapshot** | — | — | — | Rect select → clipboard / image file / **save as stamp**, resolution (default 72 dpi, higher on demand) |
| 16 | **Image insert / editor** | — | — | — | From file / clipboard → ImageEn editor (crop/rotate/...) → place & resize |
| 17 | **Formula (LaTeX)** | — | — | Color, Font size, Fill color, Opacity | LaTeX tab + expression/symbol palettes, preview, cut/copy/paste of sub-expressions, editable after insert |
| 18 | **Link** | — | — | — | `toolslinks.htm` — hyperlink annotation creation |
| 19 | **Pan / Hand** | — | — | — | Pan gesture, kinetic scrolling |
| 20 | **Crop** | — | — | — | Page crop (`pagescrop.htm`) |
| 21 | **Auxiliary lines/grid** | `PAStyleTemplates.xml` | 129 | Style (blank/line/karo/mm/grid), pitch, colour, width, margins, page size | View ▸ Auxiliary Lines = non-printing screen grid; styles depend on Units setting |

**Tool-wide parameter semantics (normalize in the new model):**

| Old attribute | Type | Old encoding | New model |
|---|---|---|---|
| `Color`, `BackColor`, `Fontcolor`, `TextboxColor` | colour | `TColor` `0x00BBGGRR`; `536870911` = `clNone`; `0x20xxxxxx` system colours | `#RRGGBB` + `alpha`; `transparent: true` |
| `Thickness`, `LineWidth` | length | **1/100 mm** (ISO nib series confirms) | millimetres (float) or points |
| `Fontsize` | length | points | points (unchanged) |
| `LineStyle` | enum | 0 solid, 1 dash, 2 dot, 3 dash‑dot, 5 "curly" (per help) | enum + dash array |
| `ArrowHead` / `ArrowTail` | enum | 0 none, 3, 5, 7, 10 (shape ids, undocumented) | named arrowheads; map by rendering comparison |
| `InkTransparency` | percent | 0 / 50 | `opacity` |
| `Sensitivity`, `Snapping`, `InkOnText`, `Grouped`, `Style*` | bool | `True`/`False` (capitalized) | `true`/`false` |
| `DPI` | int | 96 / 144 | sampling DPI (retain for fidelity) |
| `Category`, `GroupID`, `Position`, `ToolVersion` | taxonomy | 0‑6 / GUID / int / int | `family`, `groupId`, `order`, `schemaVersion` |

### 5.2 Application feature matrix (from the 119 topic help set)

| Area | Features |
|---|---|
| **Files** | Open/Save/Save As, multi-document tabs, new document from 129 templates + 129 paper recipes, open images → PDF, create PDF via virtual printer, combine files, present, print (+print lists of annotations), document properties & security, password protection, backups, set as default PDF app |
| **Annotate** | all 21 tools above, group & lock annotations, select/edit/align/rotate/flip/duplicate (incl. page ranges, even/odd), copy/paste cross-app, melt annotations (rasterize into content), annotations sidebar, print/export/import `.paa` annotation lists, annotate PDF forms, hide annotations |
| **Navigate / view** | page navigation, text search (Ctrl+F, F3/Shift+F3), page layout, zoom, full screen, aux lines, page preview thumbnails |
| **Pages** | select, add/delete, copy/paste, extract, insert documents, move, rotate, add margins, crop, headers & footers, watermarks, page numbers |
| **Structure** | bookmarks (add/edit/goto), attachments, portfolios |
| **Customization** | skin/theme (PA_DARK/PA_LIGHT/PA_W11 per §3.5), document tabs, toolbars, sidebar, tool switch, full screen, scrolling, PDF comments mapping, cursor, text, extract-text, measure/scales, **tool properties separate vs synchronous**, gestures, search, performance (battery: reduced-quality live stroke), backup, recent files, **persistence mode** (always editable / editable until saving / not editable), **save quality 72–1200 dpi**, open-with, explorer integration, quick start, units, **shortcuts editor**, language (DE/EN/FR), update wizard, logging, export/import settings, reset, shutdown |

**Tool-property synchronization rules** (must be preserved as a UX contract, `opttoolproperties.htm`): default = **Separate** per tool; **Synchronous** mode synchronises *Color + LineWidth* across Pen, Text, Line, Arrow, Rectangle, Ellipse, Polygon, Dimension, Formula; *LineStyle* across Line/Arrow; *FillColor + Opacity* across Rectangle/Ellipse/Polygon; **Marker is never synchronised**.

**Gestures** (`optgestures.htm`): Pan, Pinch‑to‑zoom, Press‑and‑hold (context menu), Scratch‑out (erase strokes by scribbling) — each independently disableable.

**Persistence & save pipeline** (`optsavequality.htm`, `annmelt.htm`, `optpersistmode.htm`): annotations → transparent images at chosen DPI (default range 72–1200, "150 standard") → embedded in PDF; editable metadata persists until "melt"; three persistence modes.

### 5.3 Keyboard shortcuts (documented defaults)

| Scope | Shortcut → action |
|---|---|
| File | `Ctrl+O` open, `Ctrl+S` save, `Ctrl+P` print, `Ctrl+Shift+P` print without dialog, `Ctrl+Tab` / `Ctrl+Shift+Tab` / `Ctrl+PgUp` / `Ctrl+PgDn` next/prev document |
| Edit | `Ctrl+Z` undo, `Ctrl+X/C/V` cut/copy/paste, `Ctrl+Shift+V` paste w/o formatting, `Ctrl+D` duplicate on page, `Del` delete, `Ctrl+A` select all annotations on page, `Ctrl+F` find, `F3` find next / edit style properties, `Shift+F3` find previous |
| Nudge / size | `Ctrl+↑/↓/←/→` move selection, `Shift+→` / `Shift+←` grow/shrink (with `Alt` while editing text) |
| Text editing | `Ctrl+A/B/I/U`, `Ctrl+#` subscript, `Ctrl++` superscript, `Ctrl+8` decrease font, `Ctrl+V`/`Ctrl+Shift+V` paste, `Ctrl+M` fit text box, `Esc` end editing |
| Tool modifiers | `Shift` = auto-smooth / temp. snap / square / circle; `Ctrl` = draw from centre / keep aspect; `Esc` cancel polygon/measure |

Shortcuts are user-rebindable with duplicate detection and per-command reset (`optshortcuts.htm`) → new app needs a keymap with conflict resolution, not hardcoded accelerators.

### 5.4 Command-line contract (`cmdlineargs.htm`)

```
PDFAnnotator.exe [[<File>] [/print] | [/new[:"<format>[ Landscape]"]]] [/fullscreen]
```
`<format>` accepts the full paper list (A0‑A10, B0‑B10, ISOB0‑ISOB10, C0‑C7, DL, Letter, Legal, Statement, Tabloid, Ledger, Executive, Folio). This is the file-association and "print to PDF Annotator" entry point — must be reproduced for drop-in compatibility.

---

## 6. Asset Schema & Extraction Blueprint (how to consume all of it)

### 6.1 Conversion rules

| Source | Transform | Target |
|---|---|---|
| `.pat` presets | XML → normalized JSON (`TColor`→`#RRGGBB`+alpha, `1/100 mm`→`mm`, Title-case bools→bool, `Category`/`GroupID`→`family`/`groupId`) | `presets.json` (617 records) + `groups.json` (21) |
| `<Stamp>/InkData` | `bytes.fromhex()` → GIF89a → **PNG** (Pillow) + 48 px thumbnail | `stamps/<slug>_<pos>.png`, `stamps/index.json` |
| `Stamp/Description[@Language]` | collect EN + DE(+FR n/a) | `stamps/index.json#names` (localization-ready) |
| `.pap` | ZIP → extract PDFs (already print-ready) | `templates/Notes_METRIC.pdf`, `Notes_IMPERIAL.pdf` |
| `PAStyleTemplates.xml` | parse `Template/Page/Bounds/Lines/(Line|Grid)` → parametric spec | `paper.json` + SVG/PDF renderer (no raster assets needed) |
| `.pai` + `_48.bmp` (user) | raw GIF → PNG, thumbnail reuse | `user/stamps/<guid>.png` |
| Help `.chm` | already extracted to HTML (§4.5) | migration source for UI copy, shortcuts, settings labels |
| exe resources | **not extractable** (MPRESS) | icons/glyphs must be replaced by new design system |

Everything above is lossless except: arrowhead/linestyle shape ids (numeric, undocumented → map by visual comparison), and the exe-side icons (unavailable).

### 6.2 Proposed Phase 2 data-migration script plan

```
scripts/convert/
 01_extract_presets.py    # .pat → presets.json, groups.json  (assert: 21 groups, 617 presets,
                          #   49 pen, 26 marker, 30 text, 464 stamp, 48 graphical)
 02_extract_stamps.py     # hex → GIF → PNG + 48px thumb + index.json
                          #   assert: 464 files, all Pillow-loadable, 145 unique names,
                          #   no duplicate (name,size) collisions left unresolved
 03_extract_templates.py  # .pap → PDFs; PAStyleTemplates.xml → paper.json (+SVG renderer)
                          #   assert: 129 templates, sizes only in {A4, Letter} for shipped set,
                          #   every template renders a 1-page PDF at 300 dpi without error
 04_extract_user_assets.py# %LOCALAPPDATA%\...\10.0\Tools\*.pai → PNG (skip if absent)
 05_build_manifest.py     # emits migration-manifest.json: source sha256, counts, skips, warnings
```

**Verification gates (must pass before import):** source SHA‑256 pinned per file; counts equal to §4/§5 numbers; every PNG opens and has identical pixel dimensions to the source GIF; every generated paper PDF has correct page size/pitch; `presets.json` round-trips back to `.pat` attributes for a random 20-record sample (property-by-property diff). *(Tooling check already done in Phase 1: all 464 `InkData` payloads decode and load — the pipeline's riskiest step is proven.)*

**Import model in the new app:** `presets.json` → tool registry (family + style token); stamps → asset store keyed by slug with `grouped` flag and localization map; paper → parametric generator (no stored bitmaps); user `.pai` merged into the same asset store with `origin: "user"`. Keep `groupId`/`position` so the original toolbox ordering and Full‑Screen variants survive; expose `Category` as the toolbox tab.

**Deliberately out of scope (named, not silently dropped):** ASProtect licensing, PAD update/news feed, madExcept telemetry, MPRESS packaging, DevExpress skins (replace with design-system themes), the `.aa`/`.paa` annotation interchange (needs a Phase 3 format investigation if import of existing user annotation lists is required), and `PAGlobalConfig.cfg` settings (opaque).

---

## 7. Limitations, unknowns, and risk notes

| Item | Status |
|---|---|
| DFM/menus/actions/shortcut tables in the exe | **Unknown — compressed by MPRESS**, not absent. Needs unpacking or runtime resource dump (Phase 3, optional) |
| Exe icons/SVG glyphs (107 SVG + 45 PNG + 198 bitmaps + 288 cursors = 638 image resources) | Unreadable offline (packed). New design will replace them |
| RT_STRING (English UI text) | 505 blocks enumerated, all 0/505 file-backed → re-author copy from help set |
| `.lng` / `.ENG` | proprietary compressed containers → translations not text-extractable |
| `PAGlobalConfig.cfg` | hex-encoded/opaque → settings schema must be redesigned |
| Path/preset semantics of `ArrowHead` 3/5/10, `LineStyle` 5, `TextboxFrametype` 2/3 | numeric only; map visually |
| Polygon + Measure presets | no factory presets found in `.pat` (Measure is intentionally transient) — tool defaults must come from UI defaults, not files |
| Licence keys in `aspr_keys.ini` | placeholders (123456789 / AB123C…) — no real secret was read or reused |

**Two risks the architect should weigh now:** (1) if the new app keeps PDF‑XChange as its renderer, the `PXCV_*` API is procedural C and GDI-bound — a GPU viewport needs a different raster source (that is the real rewrite); (2) old documents' annotation editability depends on PA's private sidecar metadata; our raster→vector migration affects only *presets and stamps*, not already-annotated user PDFs, so a document-compatibility story is still open.

---

## 8. Reproduce

```powershell
cd "D:\Project\PDF Master"
python scripts\inspect_assets.py --json scripts\assets.json          # .pat/.pap/.xml schemas
python scripts\pe_scan.py "C:\Program Files\PDF Annotator\PDFAnnotator.exe" | Set-Content -Encoding utf8 scripts\pe_exe.json
python scripts\exe_resources.py                                      # resource inventory + VERSIONINFO
python scripts\pe_meta.py | Set-Content -Encoding utf8 scripts\pe_meta.json
hh.exe -decompile C:\Users\Aa\AppData\Local\Temp\opencode\chm\en C:\Users\Aa\AppData\Local\Temp\opencode\chm\en.chm
python scripts\parse_help.py                                         # 119 topics, 333 keywords
python scripts\help_digest.py                                        # 25 key topics, plain text
```
