"""Extract readable data from PDFAnnotator.exe's .rsrc (read-only on target).

Writes report material to scripts/out/: resource inventory, VERSIONINFO strings,
RT_STRING table text, and selected SVG/PNG assets (kept in a temp folder).
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

from pe_scan import PE

EXE = Path(r"C:\Program Files\PDF Annotator\PDFAnnotator.exe")
OUT = Path(__file__).parent / "out"

NAMES = {
    1: "CURSOR", 2: "BITMAP", 3: "ICON", 4: "MENU", 5: "DIALOG", 6: "STRING",
    7: "FONTDIR", 8: "FONT", 9: "ACCELERATOR", 10: "RCDATA", 11: "MESSAGETABLE",
    12: "GROUP_CURSOR", 14: "GROUP_ICON", 16: "VERSION", 17: "DLGINCLUDE",
    19: "PLUGPLAY", 20: "VXD", 21: "ANICURSOR", 22: "ANIICON", 23: "HTML", 24: "MANIFEST",
}


def rt_string(blob: bytes):
    """RT_STRING block: 16 pascal-style UTF-16 strings, length-prefixed."""
    out, i = [], 0
    while i + 2 <= len(blob):
        n = struct.unpack_from("<H", blob, i)[0]
        i += 2
        out.append(blob[i : i + n * 2].decode("utf-16-le", "replace"))
        i += n * 2
    return out


def version_strings(blob: bytes):
    """VS_VERSIONINFO: pull wValue strings heuristically (key\0value\0 UTF-16)."""
    txt = blob.decode("utf-16-le", "replace")
    parts = [p for p in txt.split("\0") if p and all(31 < ord(c) < 127 or c.isalpha() for c in p)]
    return [p for p in parts if len(p) > 1 and not p.startswith("VS_")][:80]


def main():
    OUT.mkdir(exist_ok=True)
    pe = PE(EXE)
    tree, _ = pe.walk_resources()

    inv, strings, vers = {}, {}, {}
    for tname, items in tree.items():
        type_id = int(tname) if tname.isdigit() else None
        label = NAMES.get(type_id, tname)
        inv[label] = {"count": len(items), "names": [e["name"] for e in items][:120]}
        for e in items:
            for l in e["langs"]:
                if l["off"] is None:
                    continue
                blob = pe.data[l["off"] : l["off"] + l["size"]]
                if type_id == 6:
                    strings.setdefault(e["name"], rt_string(blob))
                elif type_id == 16:
                    vers = version_strings(blob)
                elif label in ("SVG", "PNG", "RCDATA") and len(blob) < 200_000 and e["name"] in ("DVCLAL", "PACKAGEINFO"):
                    pass
    # SVG + PNG assets: note names and sizes only (no bulk copy in phase 1)
    assets = {
        "SVG": [{"name": e["name"], "bytes": sum(l["size"] for l in e["langs"])} for e in tree.get("SVG", [])],
        "PNG": [{"name": e["name"], "bytes": sum(l["size"] for l in e["langs"])} for e in tree.get("PNG", [])],
        "DXSKINS": [e["name"] for e in tree.get("DXSKINS", [])],
        "DXNAVBARSKINS": [e["name"] for e in tree.get("DXNAVBARSKINS", [])],
        "MAD": [e["name"] for e in tree.get("MAD", [])],
        "AVI": [e["name"] for e in tree.get("AVI", [])],
        "RCDATA": [e["name"] for e in tree.get("RCDATA", [])][:40],
    }
    ui = sorted({s for blk in strings.values() for s in blk if len(s.strip()) > 1})
    result = {
        "resource_inventory": inv,
        "version_info": vers,
        "string_blocks": len(strings),
        "ui_strings_total": len(ui),
        "ui_strings": ui,
        "assets": assets,
    }
    (OUT / "exe_resources.json").write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    print("types:", json.dumps({k: v["count"] for k, v in inv.items()}))
    print("version_info:", json.dumps(vers, ensure_ascii=False)[:600])
    print("ui strings:", len(ui), "blocks:", len(strings))
    print("sample strings:", json.dumps(ui[:40], ensure_ascii=False))
    print("svg sample:", json.dumps(assets["SVG"][:15], ensure_ascii=False))
    print("rcd names:", json.dumps(assets["RCDATA"]))


if __name__ == "__main__":
    main()
