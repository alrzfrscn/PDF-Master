"""05 - verify every migrated artefact and emit src/data/migration_manifest.json.

The manifest is the gate for the whole pipeline: source hashes, output counts, image integrity
and a property-by-property round-trip of a sample of presets back to the .pat source.
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from PIL import Image

from common import (DATA, FAMILY_COUNTS, PAP, PAT, PUBLIC, STYLES, TOOL_FAMILIES, dump_json,
                    load_groups, load_json, load_pat, normalize_props, sha256)

SAMPLE = 20


def preset_source_map() -> dict[str, dict]:
    """Rebuild the source record for every preset id, exactly as script 01 does."""
    root = load_pat()
    by_id = {g["id"]: g for g in load_groups(root)}
    out = {}
    ordinals: dict[tuple[str, str], int] = {}
    for section in root:
        if section.tag == "Groups":
            continue
        for el in section:
            family = TOOL_FAMILIES[el.tag]
            group = by_id[el.attrib["GroupID"]]
            ordinal = ordinals.get((family, group["slug"]), 0)
            ordinals[(family, group["slug"])] = ordinal + 1
            out[f"{family}-{group['slug']}-{ordinal}"] = {
                "attrs": el.attrib, "family": family, "group": group, "el": el,
                "typeCode": int(el.attrib["TypeCode"]) if "TypeCode" in el.attrib else None,
            }
    return out


def main() -> int:
    groups = load_json(DATA / "groups.json")
    presets = load_json(DATA / "presets.json")
    stamps = load_json(DATA / "stamps.json")
    paper = load_json(DATA / "paper_templates.json")
    user = load_json(DATA / "user_stamps.json")

    gates: list[dict] = []

    def gate(name: str, expected, actual) -> None:
        gates.append({"gate": name, "expected": expected, "actual": actual, "pass": expected == actual})

    family_counts = {f: sum(1 for p in presets["presets"] if p["family"] == f) for f in FAMILY_COUNTS}
    gate("groups", 21, groups["count"])
    gate("presets", 617, presets["count"])
    gate("presets by family", FAMILY_COUNTS, family_counts)
    gate("preset ids unique", 617, len({p["id"] for p in presets["presets"]}))
    gate("stamps", 464, stamps["count"])
    gate("stamp titles localized (en+de)", 464,
         sum(1 for s in stamps["stamps"] if s["title"].get("en") and s["title"].get("de")))
    gate("paper recipes", 129, paper["count"])
    gate("paper styles", {"blank": 1, "line": 48, "karo": 54, "mm": 8, "grid": 18}, paper["styles"])
    gate("paper page sizes", ["A4", "Letter"], sorted({t["page"]["size"] for t in paper["templates"]}))

    # --- images ---------------------------------------------------------------------------
    pngs = list((PUBLIC / "stamps").glob("*.png"))
    gate("stamp PNG files", stamps["count"] - stamps["artCoverage"].get("missing", 0), len(pngs))
    bad_images = []
    for stamp in stamps["stamps"]:
        if not stamp["imageUrl"]:
            continue
        path = PUBLIC.parent / stamp["imageUrl"].lstrip("/")
        try:
            with Image.open(path) as image:
                image.load()
                if image.mode != "RGBA" or image.size != (stamp["assetWidth"], stamp["assetHeight"]):
                    bad_images.append(stamp["id"])
        except Exception:
            bad_images.append(stamp["id"])
    gate("stamp PNG integrity", [], bad_images)

    user_pngs = list((PUBLIC / "user_stamps").glob("*.png"))
    gate("user stamp PNG files", user["count"], len(user_pngs))

    pdfs = sorted((PUBLIC / "templates").glob("*.pdf"))
    gate("note template PDFs", 2, len(pdfs))
    gate("note PDFs are PDFs", [], [p.name for p in pdfs if p.read_bytes()[:5] != b"%PDF-"])

    # --- preset round-trip against the packed source ---------------------------------------
    source_map = preset_source_map()
    rng = random.Random(1011)
    sample = rng.sample(presets["presets"], SAMPLE)
    drift = []
    for preset in sample:
        src = source_map[preset["id"]]
        props = normalize_props(src["attrs"])
        if src["family"] == "stamp":
            grouped = src["el"].find("Grouped")
            props["grouped"] = (grouped.text or "").strip().lower() == "true" if grouped is not None else False
        if props != preset["props"]:
            drift.append(preset["id"])
        if preset["groupId"] != src["group"]["id"] or preset["typeCode"] != src["typeCode"]:
            drift.append(preset["id"])
    gate(f"preset round-trip sample ({SAMPLE})", [], sorted(set(drift)))

    # --- manifest ---------------------------------------------------------------------------
    sources = []
    for path in (PAT, PAP, STYLES):
        sources.append({"name": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)})
    tools_xml = Path(user.get("source", "")) / "paStampTools.xml"
    if tools_xml.is_file():
        sources.append({"name": f"user/{tools_xml.name}", "bytes": tools_xml.stat().st_size, "sha256": sha256(tools_xml)})

    outputs = {
        "groups": "src/data/groups.json",
        "presets": "src/data/presets.json",
        "stamps": "src/data/stamps.json",
        "paperTemplates": "src/data/paper_templates.json",
        "userStamps": "src/data/user_stamps.json",
        "stampAssets": len(pngs),
        "userStampAssets": len(user_pngs),
        "pdfAssets": [p.name for p in pdfs],
    }

    warnings = []
    if stamps["artCoverage"].get("missing"):
        warnings.append(
            f"{stamps['artCoverage']['missing']} factory stamps carry no raster art and no matching "
            "thumbnail; their serialised vector ink is preserved in metadata for a later decoder."
        )
    warnings.append(
        f"{stamps['artCoverage'].get('app-thumbnail', 0)} stamps use the app's own 48 px rendered "
        "thumbnail because the factory GIF is a blank stub around serialised vector annotations."
    )
    warnings.append(
        f"{stamps['artCoverage'].get('generated-text', 0)} German text stamps were re-rendered "
        "typographically from their English twin's ink colour and size."
    )
    warnings.append("Pen/Marker/Text/Graphical presets carry no name in the source; titles come from attributes.")

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": {"install": str(PAT.parent), "files": sources},
        "counts": {
            "groups": groups["count"],
            "presets": presets["count"],
            "presetsByFamily": family_counts,
            "stamps": stamps["count"],
            "stampArt": stamps["artCoverage"],
            "paperTemplates": paper["count"],
            "userStamps": user["count"],
            "pdfTemplates": len(pdfs),
        },
        "outputs": outputs,
        "assertions": gates,
        "allPassed": all(g["pass"] for g in gates),
        "warnings": warnings,
    }
    dump_json(DATA / "migration_manifest.json", manifest)

    width = max(len(g["gate"]) for g in gates)
    for g in gates:
        print(f"{'PASS' if g['pass'] else 'FAIL'}  {g['gate']:<{width}}  {g['actual']!r}"
              + ("" if g["pass"] else f"  != {g['expected']!r}"))
    print(f"\nallPassed = {manifest['allPassed']}   presets={presets['count']} stamps={stamps['count']} "
          f"paper={paper['count']} user={user['count']}")
    return 0 if manifest["allPassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
