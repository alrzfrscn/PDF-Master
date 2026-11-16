"""03 - PADefaultTemplates.pap -> public/assets/templates/*.pdf
        PAStyleTemplates.xml   -> src/data/paper_templates.json (129 parametric recipes)
"""
from __future__ import annotations

import shutil
import sys
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

from common import DATA, PAP, PUBLIC, STYLES, dump_json, sha256

TEMPLATE_DIR = PUBLIC / "templates"

# Only the two sizes the shipped recipe set uses. Landscape is the "… Landscape" suffix.
PAGE_MM = {"A4": (210.0, 297.0), "Letter": (215.9, 279.4)}
STYLE_LABEL = {"": "Blank", "blank": "Blank", "line": "Ruled", "karo": "Squared", "mm": "Millimeter", "grid": "Grid"}
STYLE_GROUP = {"": "blank", "blank": "blank", "line": "ruled", "karo": "squared", "mm": "millimeter", "grid": "grid"}
COLOR_NAMES = {"#aaaaaa": "Grey", "#0000ff": "Blue", "#eec494": "Tan"}
IMPERIAL_PITCHES = {1.5875, 2.54, 3.175, 5.08, 6.35, 12.7, 25.4, 2.8222, 7.62}


def parse_color(raw: str) -> str:
    """PAStyleTemplates colours are HTML '#RRGGBB' with a '$' prefix."""
    value = raw.strip().lstrip("$").lower()
    assert len(value) == 6 and all(c in "0123456789abcdef" for c in value), f"bad colour {raw!r}"
    return f"#{value}"


def fmt(value: float) -> str:
    return f"{value:g}"


def main() -> int:
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(PAP) as zf:
        names = sorted(zf.namelist())
        assert names == ["Notes_IMPERIAL.pdf", "Notes_METRIC.pdf"], names
        pdfs = []
        for name in names:
            data = zf.read(name)
            assert data[:5] == b"%PDF-", f"{name}: not a PDF"
            target = TEMPLATE_DIR / name
            target.write_bytes(data)
            pdfs.append({"name": name, "bytes": len(data), "sha256": sha256(target),
                         "url": f"/assets/templates/{name}", "sourcePackedBytes": zf.getinfo(name).compress_size})

    root = ET.fromstring(STYLES.read_text(encoding="utf-8-sig"))
    templates = []
    for index, el in enumerate(root.findall("Template")):
        page_el = el.find("Page")
        size_raw = page_el.get("Size")
        landscape = size_raw.endswith(" Landscape")
        size = size_raw.replace(" Landscape", "")
        assert size in PAGE_MM, f"unsupported page size {size_raw}"
        w_mm, h_mm = PAGE_MM[size]
        if landscape:
            w_mm, h_mm = h_mm, w_mm

        bounds_el = page_el.find("Bounds")
        bounds = None
        if bounds_el is not None:
            bounds = {k.lower(): float(bounds_el.get(k)) for k in ("Left", "Top", "Right", "Bottom")}

        lines_el = el.find("Lines")
        grid = None
        if lines_el is not None:
            line_el = lines_el.find("Line")
            grid_el = lines_el.find("Grid")
            node = line_el if line_el is not None else grid_el
            grid = {
                "kind": "line" if line_el is not None else "grid",
                "widthMm": float(lines_el.get("Width")),
                "color": parse_color(lines_el.get("Color")),
                "deltaXMm": float(node.get("DeltaX")) if node.get("DeltaX") else None,
                "deltaYMm": float(node.get("DeltaY")) if node.get("DeltaY") else None,
                "deltaMm": float(node.get("Delta")) if node.get("Delta") else None,
                "highlightMinor": int(node.get("HighlightMinor")) if node.get("HighlightMinor") else None,
                "highlightMajor": int(node.get("HighlightMajor")) if node.get("HighlightMajor") else None,
            }

        style = el.get("Style") or ""
        is_metric_attr = el.get("IsMetric")
        # 9 recipes omit IsMetric; their pitch tells the unit.
        pitches = [v for v in (grid or {}).values() if isinstance(v, float)]
        is_metric = (is_metric_attr or "").lower() == "true" if is_metric_attr else not any(
            round(p, 4) in IMPERIAL_PITCHES for p in pitches
        )

        pitch = (grid or {}).get("deltaYMm") or (grid or {}).get("deltaMm") or (grid or {}).get("deltaXMm")
        color_name = COLOR_NAMES.get((grid or {}).get("color", ""), None)
        name = f"{size_raw} {STYLE_LABEL[style]}"
        if pitch:
            name += f" {fmt(round(pitch, 4))} mm"
        detail = " · ".join(
            part for part in (
                color_name or (grid or {}).get("color"),
                "margin" if bounds else "no margin",
            ) if part
        )
        templates.append(
            {
                "id": f"paper-{index:03d}",
                "index": index,
                "style": style or "blank",
                "styleLabel": STYLE_LABEL[style],
                "group": STYLE_GROUP[style],
                "isMetric": is_metric,
                "units": "metric" if is_metric else "imperial",
                "description": (el.get("Description") or "").strip(),
                "page": {"size": size, "landscape": landscape, "widthMm": w_mm, "heightMm": h_mm, "count": int(page_el.get("Cnt"))},
                "bounds": bounds,
                "grid": grid,
                "name": name,
                "detail": detail,
            }
        )

    assert len(templates) == 129, f"expected 129 templates, got {len(templates)}"
    counts = {}
    for t in templates:
        counts[t["style"]] = counts.get(t["style"], 0) + 1
    assert counts == {"karo": 54, "line": 48, "grid": 18, "mm": 8, "blank": 1}, counts
    sizes = {t["page"]["size"] for t in templates}
    assert sizes == {"A4", "Letter"}, sizes

    dump_json(DATA / "paper_templates.json",
              {"count": len(templates), "pageSizesMm": PAGE_MM, "styles": counts, "templates": templates,
               "pdfTemplates": pdfs})
    print(f"paper_templates  {len(templates)} recipes {counts}")
    print(f"pdf templates    {[p['name'] for p in pdfs]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
