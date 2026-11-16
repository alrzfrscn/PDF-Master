"""01 - PADefaultToolData.pat -> src/data/groups.json + src/data/presets.json

Normalises Delphi TColor -> #rrggbb (+transparent), 1/100 mm -> mm, True/False -> bool.
Pen/Marker/Text/GraphicalTool presets carry no name in the source file, so titles are
derived from their normalised attributes. Stamps keep their EN/DE descriptions.
"""
from __future__ import annotations

import sys
from common import (DATA, FAMILY_COUNTS, LINE_STYLES, TOOL_FAMILIES, TYPE_CODES, dump_json,
                    load_groups, load_pat, normalize_props)


def preset_title(family: str, props: dict, type_code: int | None) -> str:
    if family in ("pen", "marker"):
        return f"{props['thicknessMm']:g} mm"
    if family == "text":
        return f"{props['fontName']} {props['fontSize']}"
    if family == "graphical":
        return f"{TYPE_CODES[type_code].capitalize()} {props.get('lineWidthMm', 0):g} mm"
    return ""


def main() -> int:
    root = load_pat()
    groups = load_groups(root)
    by_id = {g["id"]: g for g in groups}

    presets = []
    family_seen = {k: 0 for k in FAMILY_COUNTS}
    # Position is not unique (the "Stamps" group restarts at 0), so ids use a per-group ordinal.
    ordinals: dict[tuple[str, str], int] = {}
    for section in root:
        if section.tag == "Groups":
            continue
        for el in section:
            family = TOOL_FAMILIES[el.tag]
            family_seen[family] += 1
            attrs = el.attrib
            group = by_id[attrs["GroupID"]]
            type_code = int(attrs["TypeCode"]) if "TypeCode" in attrs else None
            props = normalize_props(attrs)
            description = {}
            if family == "stamp":
                for d in el.findall("Description"):
                    description[d.get("Language", "ENU").lower()] = (d.text or "").strip()
            title = description.get("en") or preset_title(family, props, type_code)
            ordinal_key = (family, group["slug"])
            ordinal = ordinals.get(ordinal_key, 0)
            ordinals[ordinal_key] = ordinal + 1
            preset = {
                "id": f"{family}-{group['slug']}-{ordinal}",
                "index": ordinal,
                "family": family,
                "groupId": group["id"],
                "groupSlug": group["slug"],
                "category": group["category"],
                "position": int(attrs["Position"]),
                "schemaVersion": int(attrs.get("ToolVersion") or 0),
                "typeCode": type_code,
                "typeName": TYPE_CODES[type_code] if type_code is not None else None,
                "title": title,
                "subtitle": group["captions"]["en"],
                "label": {"en": title, "de": description.get("de", title)},
                "props": props,
            }
            if props.get("lineStyle") is not None:
                preset["lineStyleName"] = LINE_STYLES.get(props["lineStyle"], "solid")
            presets.append(preset)

    assert len(groups) == 21, f"expected 21 groups, got {len(groups)}"
    assert len(presets) == 617, f"expected 617 presets, got {len(presets)}"
    assert family_seen == FAMILY_COUNTS, f"family drift: {family_seen}"
    ids = {p["id"] for p in presets}
    assert len(ids) == 617, f"duplicate preset ids: {617 - len(ids)}"

    groups_out = []
    for g in groups:
        own = [p for p in presets if p["groupId"] == g["id"]]
        groups_out.append(
            {**g, "toolCount": len(own),
             "families": {f: sum(1 for p in own if p["family"] == f) for f in FAMILY_COUNTS}}
        )

    dump_json(DATA / "groups.json", {"count": len(groups_out), "groups": groups_out})
    dump_json(DATA / "presets.json", {"count": len(presets), "presets": presets})
    print(f"groups.json      {len(groups_out)} groups")
    print(f"presets.json     {len(presets)} presets {family_seen}")
    print("stamps w/o name  ", sum(1 for p in presets if p["family"] == "stamp" and not p["title"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
