"""Compact text digest of selected help topics + resource file-backing check."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from pe_scan import PE  # noqa: E402

HELP = Path(r"C:\Users\Aa\AppData\Local\Temp\opencode\chm\en")
EXE = Path(r"C:\Program Files\PDF Annotator\PDFAnnotator.exe")
WANT = [
    "toolspenmarker", "toolstext", "toolslinearrow", "toolsrectangleellipse", "toolspolygon",
    "toolsstamps", "toolserasedelete", "toolsselectedit", "toolsmeasure", "toolssnapshot",
    "toolsinsertimage", "toolsformula", "toolboxfavorites", "opttoolproperties", "optgestures",
    "viewauxlines", "keyboardshortcuts", "cmdlineargs", "limitationsknownproblems", "optshortcuts",
    "annmelt", "annexportimport", "optperformance", "optsavequality", "optpersistmode",
]


def digest(name: str) -> str:
    p = HELP / f"{name}.htm"
    if not p.exists():
        return f"[missing {name}]"
    s = p.read_text(encoding="latin1", errors="replace")
    s = re.sub(r"<script.*?</script>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<style.*?</style>", " ", s, flags=re.S | re.I)
    rows = []
    for m in re.finditer(r"<(h1|h2|h3|li|td|th|p)[^>]*>(.*?)</\1>", s, re.S | re.I):
        txt = re.sub(r"<[^>]+>", "", m.group(2))
        txt = re.sub(r"\s+", " ", txt).strip()
        if txt and txt not in rows:
            rows.append(f"{'#' if m.group(1).lower().startswith('h') else '-'} {txt}")
    return "\n".join(rows[:70])


def main():
    out = ["# HELP TOPIC DIGEST\n"]
    for name in WANT:
        out.append(f"\n## {name}\n{digest(name)}\n")
    digest_path = Path(__file__).parent / "out" / "help_digest.md"
    digest_path.write_text("\n".join(out), encoding="utf-8")
    print("topics:", len(WANT), "->", digest_path, digest_path.stat().st_size, "bytes")

    pe = PE(EXE)
    tree, _ = pe.walk_resources()
    backed = {}
    for tname, items in tree.items():
        ok = sum(1 for e in items for l in e["langs"] if l["off"] is not None)
        tot = sum(1 for e in items for l in e["langs"])
        backed[tname] = f"{ok}/{tot}"
    print("file-backed resource data (readable offline):", json.dumps(backed))


if __name__ == "__main__":
    main()
