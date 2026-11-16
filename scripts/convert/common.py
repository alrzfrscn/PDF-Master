"""Shared helpers for the PDF Annotator -> web app asset migration.

Source files are only read. Everything is written under src/data and public/assets.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(os.environ.get("PA_INSTALL", r"C:\Program Files\PDF Annotator"))
PAT = SRC / "PADefaultToolData.pat"
PAP = SRC / "PADefaultTemplates.pap"
STYLES = SRC / "PAStyleTemplates.xml"
DATA = ROOT / "src" / "data"
PUBLIC = ROOT / "public" / "assets"

# Delphi TColor: clNone is stored as $1FFFFFFF, system colours set the high bit.
CL_NONE = 0x1FFFFFFF

TOOL_FAMILIES = {"Pen": "pen", "Marker": "marker", "Text": "text", "Stamp": "stamp", "GraphicalTool": "graphical"}
FAMILY_COUNTS = {"pen": 49, "marker": 26, "text": 30, "stamp": 464, "graphical": 48}

LINE_STYLES = {0: "solid", 1: "dash", 2: "dot", 3: "dash-dot", 5: "curly"}
TYPE_CODES = {0: "line", 1: "arrow", 2: "rectangle", 3: "ellipse", 6: "dimension"}


def tcolor(value: str | int) -> dict:
    """Delphi TColor (0x00BBGGRR) -> {hex:'#rrggbb', transparent:bool}."""
    v = int(value)
    if v == CL_NONE:
        return {"hex": None, "transparent": True}
    if v & 0x80000000 or (v >> 24):
        # Win32 system palette index; opaque black is the safe visible default.
        return {"hex": "#000000", "transparent": False, "system": True}
    return {"hex": f"#{v & 0xFF:02x}{(v >> 8) & 0xFF:02x}{(v >> 16) & 0xFF:02x}", "transparent": False}


def hundredths_mm(value: str | int) -> float:
    return round(int(value) / 100, 2)


def as_bool(value: str) -> bool:
    return str(value).strip().lower() in ("true", "1")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def dump_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_pat() -> ET.Element:
    return ET.fromstring(PAT.read_bytes().decode("utf-8-sig"))


def load_groups(root: ET.Element) -> list[dict]:
    groups = []
    for g in root.find("Groups").findall("Group"):
        caps = {c.get("Language", "ENU"): (c.text or "").strip() for c in g.findall("GroupCaption")}
        groups.append(
            {
                "id": g.get("GroupID"),
                "category": int(g.get("Category")),
                "position": int(g.get("Position")),
                "captions": {"en": caps.get("ENU", ""), "de": caps.get("DEU") or caps.get("ENU", "")},
                "schemaVersion": int(g.get("ToolVersion") or 0),
            }
        )
    groups.sort(key=lambda g: (g["category"], g["position"]))
    for g in groups:
        g["slug"] = f"g{g['category']}-{g['position']}"
    return groups


COLOR_ATTRS = {"Color": "color", "BackColor": "backColor", "Fontcolor": "fontColor",
               "TextboxColor": "textboxColor", "TextboxFrameColor": "textboxFrameColor"}
LENGTH_ATTRS = {"Thickness": "thicknessMm", "LineWidth": "lineWidthMm"}
BOOL_ATTRS = {"Sensitivity": "pressureSensitive", "Snapping": "snapping", "InkOnText": "inkOnText",
              "StyleBold": "bold", "StyleItalic": "italic", "StyleUnderline": "underline",
              "StyleStrikeOut": "strikeOut", "Grouped": "grouped"}
INT_ATTRS = {"DPI": "dpi", "Fontsize": "fontSize", "TextboxFrametype": "textboxFrameType",
             "InkTransparency": "inkTransparency", "LineStyle": "lineStyle", "ArrowHead": "arrowHead",
             "ArrowTail": "arrowTail", "CalibratedDistance": "calibratedDistance",
             "MeasuredDistance": "measuredDistance", "InkOnTextLineMode": "inkOnTextLineMode"}
STR_ATTRS = {"Fontname": "fontName", "CalibratedUnit": "calibratedUnit", "MeasuredUnit": "measuredUnit"}
SKIP_ATTRS = {"GroupID", "Category", "Position", "ToolVersion", "TypeCode", "Language"}


def normalize_props(attrs: dict) -> dict:
    """Explicit attribute mapping; unknown attributes are a schema break, not a silent drop."""
    props: dict = {}
    for key, raw in attrs.items():
        if key in COLOR_ATTRS:
            props[COLOR_ATTRS[key]] = tcolor(raw)
        elif key in LENGTH_ATTRS:
            props[LENGTH_ATTRS[key]] = hundredths_mm(raw)
        elif key in BOOL_ATTRS:
            props[BOOL_ATTRS[key]] = as_bool(raw)
        elif key in INT_ATTRS:
            props[INT_ATTRS[key]] = int(raw)
        elif key in STR_ATTRS:
            props[STR_ATTRS[key]] = raw.strip()
        elif key in SKIP_ATTRS:
            continue
        else:
            raise KeyError(f"unmapped tool attribute: {key}")
    return props
