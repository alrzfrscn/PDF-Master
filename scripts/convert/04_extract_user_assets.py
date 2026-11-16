"""04 - user stamps: %LOCALAPPDATA%\\PDF Annotator\\10.0\\Tools\\*.pai -> public/assets/user_stamps/

The .pai ink is the same vector-serialised comment payload as factory stamps, so the visible
preview is the app's own 48x48 thumbnail ({guid}_48.bmp). Names come from paStampTools.xml.
Nothing here is fatal: a missing folder just yields zero user stamps.
"""
from __future__ import annotations

import os
import sys
from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image

from common import DATA, PUBLIC, dump_json, load_json, sha256

TOOLS = Path(os.environ.get("LOCALAPPDATA", "")) / "PDF Annotator" / "10.0" / "Tools"
OUT = PUBLIC / "user_stamps"


def ink_canvas(payload: bytes) -> tuple[int, int] | None:
    if payload[:4] != b"GIF8":
        return None
    return int.from_bytes(payload[6:8], "little"), int.from_bytes(payload[8:10], "little")


def main() -> int:
    manifest = {"present": False, "count": 0, "groups": [], "stamps": []}
    if not TOOLS.is_dir():
        dump_json(DATA / "user_stamps.json", manifest)
        print("user_stamps.json  0 (folder missing)")
        return 0

    names: dict[str, dict] = {}
    xml_path = TOOLS / "paStampTools.xml"
    if xml_path.is_file():
        root = ET.fromstring(xml_path.read_bytes().decode("utf-8-sig"))
        for el in root.findall("Stamp"):
            guid = (el.get("ID") or "").strip("{}").lower()
            name = (el.findtext("Description") or "").strip()
            names[guid] = {
                "name": name,
                "groupId": el.get("GroupID"),
                "position": int(el.get("Position") or 0),
                "grouped": (el.findtext("Grouped") or "").strip().lower() == "true",
            }

    groups = load_json(DATA / "groups.json")["groups"]
    by_group = {g["id"]: g for g in groups}

    OUT.mkdir(parents=True, exist_ok=True)
    stamps = []
    group_counts: dict[str, int] = {}
    for pai in sorted(TOOLS.glob("*.pai")):
        guid = pai.stem.strip("{}").lower()
        thumb = pai.with_name(pai.stem + "_48.bmp")
        if not thumb.is_file():
            continue
        with Image.open(thumb) as image:
            preview = image.convert("RGBA")
        target = OUT / f"{guid}.png"
        preview.save(target, "PNG", optimize=True)
        meta = names.get(guid, {})
        group = by_group.get(meta.get("groupId") or "")
        stamp = {
            "id": f"user-{guid}",
            "guid": guid,
            "groupId": meta.get("groupId"),
            "groupSlug": group["slug"] if group else None,
            "groupName": group["captions"]["en"] if group else "Your stamps",
            "position": meta.get("position", 0),
            "grouped": meta.get("grouped", True),
            "name": meta.get("name") or f"Stamp {pai.stem[:8]}",
            "width": preview.width,
            "height": preview.height,
            "inkWidth": (ink_canvas(pai.read_bytes()) or (0, 0))[0],
            "inkHeight": (ink_canvas(pai.read_bytes()) or (0, 0))[1],
            "source": "user",
            "previewSource": "48px app thumbnail",
            "bytes": target.stat().st_size,
            "sha256": sha256(target),
            "imageUrl": f"/assets/user_stamps/{target.name}",
        }
        stamps.append(stamp)
        group_counts[stamp["groupName"]] = group_counts.get(stamp["groupName"], 0) + 1
        group_counts.setdefault(stamp["groupName"], 0)

    manifest = {
        "present": True,
        "count": len(stamps),
        "groups": [{"name": k, "count": v} for k, v in sorted(group_counts.items(), key=lambda kv: -kv[1])],
        "stamps": stamps,
        "source": str(TOOLS),
    }
    dump_json(DATA / "user_stamps.json", manifest)
    print(f"user_stamps.json  {len(stamps)} user stamps from {TOOLS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
