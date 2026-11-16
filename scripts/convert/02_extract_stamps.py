"""02 - stamps -> public/assets/stamps/<id>.png + src/data/stamps.json

Source art comes from, in order:
  1. the stamp's own GIF pixels (66 proofreading marks really are rasters),
  2. the app-rendered 48 px thumbnail of the same stamp from the user's tool folder
     (matched on name + ink canvas size; 401 of 464) — the GIF is a blank stub because the
     factory icon stamps are stored as serialised vector annotations,
  3. a typographic render for the 18 German text stamps whose English twin is present,
  4. nothing: 3 stamps stay image-less and are flagged "missing" for the UI to label.

Every PNG keeps transparency and the artwork's own aspect ratio.
"""
from __future__ import annotations

import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from common import DATA, PUBLIC, dump_json, load_json, load_pat

STAMP_DIR = PUBLIC / "stamps"
FONT_PATH = Path(r"C:\Windows\Fonts\arialbd.ttf")
FALLBACK_COLOR = (17, 17, 17, 255)


def has_pixels(image: Image.Image) -> bool:
    return any(pixel[3] > 0 for _, pixel in image.getcolors(image.width * image.height) or [])


def crop_art(image: Image.Image) -> Image.Image:
    box = image.getbbox()
    return image.crop(box) if box else image


def ink_color(image: Image.Image) -> tuple[int, int, int, int]:
    """The stamp's ink: the most saturated frequent opaque colour (anti-aliased halo is pale)."""
    counts = image.convert("RGBA").getcolors(image.width * image.height) or []
    best, best_score = FALLBACK_COLOR, -1
    for count, (r, g, b, a) in counts:
        if a > 128 and not (r > 235 and g > 235 and b > 235):
            score = (max(r, g, b) - min(r, g, b)) * count
            if score > best_score:
                best, best_score = (r, g, b, a), score
    return best


def generate_text_art(text: str, size: tuple[int, int], color) -> Image.Image:
    """Draw a text stamp (bordered box + bold label) at the source ink size."""
    width, height = size
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    stroke = max(2, round(height * 0.055))
    draw.rectangle((stroke // 2, stroke // 2, width - 1 - stroke // 2, height - 1 - stroke // 2),
                   outline=color, width=stroke)
    font_size = max(6, round(height * 0.62))
    while font_size > 5:
        font = ImageFont.truetype(str(FONT_PATH), font_size)
        box = draw.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= width * 0.86 and box[3] - box[1] <= height * 0.62:
            break
        font_size -= 1
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(((width - (box[2] - box[0])) / 2 - box[0], (height - (box[3] - box[1])) / 2 - box[1]),
              text, font=font, fill=color)
    return image


def open_thumb(url: str) -> Image.Image:
    with Image.open(PUBLIC.parent / url.lstrip("/")) as thumb:
        return thumb.convert("RGBA")


def main() -> int:
    presets = load_json(DATA / "presets.json")["presets"]
    stamp_presets = [p for p in presets if p["family"] == "stamp"]
    assert len(stamp_presets) == 464, f"expected 464 stamp presets, got {len(stamp_presets)}"

    root = load_pat()
    payloads = [
        el.findtext("InkData") or ""
        for section in root
        if section.tag == "StampTools"
        for el in section.findall("Stamp")
    ]
    assert len(payloads) == 464

    user = load_json(DATA / "user_stamps.json")
    reference = {(u["name"], u["inkWidth"], u["inkHeight"]): u for u in user["stamps"]}
    reference_by_name: dict[str, dict] = {}
    for u in user["stamps"]:
        reference_by_name.setdefault(u["name"], u)

    # The "Stamps" group lists 18 German labels first, then their English twins at +18.
    stamp_group = [p for p in stamp_presets if p["groupSlug"] == "g3-8"]
    twin_for = {p["id"]: stamp_group[p["index"] + 18] for p in stamp_group if p["index"] < 18}

    STAMP_DIR.mkdir(parents=True, exist_ok=True)
    for stale in STAMP_DIR.glob("*.png"):
        stale.unlink()

    stamps = []
    coverage: dict[str, int] = {}
    for preset, hex_payload in zip(stamp_presets, payloads):
        gif_bytes = bytes.fromhex(hex_payload)
        assert gif_bytes[:4] == b"GIF8", f"{preset['id']}: not a GIF payload"
        with Image.open(BytesIO(gif_bytes)) as gif:
            gif.load()
            raster = gif.convert("RGBA")
        width, height = raster.size

        art: Image.Image | None = None
        source = "missing"
        if has_pixels(raster):
            art, source = raster, "gif-raster"
        else:
            match = reference.get((preset["label"]["en"], width, height))
            if match:
                art, source = crop_art(open_thumb(match["imageUrl"])), "app-thumbnail"

        # The "Stamps" group lists 18 German labels first, then their English twins at +18.
        if art is None and preset["id"] in twin_for:
            twin = reference_by_name.get(twin_for[preset["id"]]["label"]["en"])
            if twin:
                art = generate_text_art(preset["label"]["en"], (width, height),
                                        ink_color(crop_art(open_thumb(twin["imageUrl"]))))
                source = "generated-text"

        target = STAMP_DIR / f"{preset['id']}.png"
        if art is not None:
            art.save(target, "PNG", optimize=True)
        coverage[source] = coverage.get(source, 0) + 1
        stamps.append(
            {
                "id": preset["id"],
                "groupId": preset["groupId"],
                "groupSlug": preset["groupSlug"],
                "category": preset["category"],
                "position": preset["position"],
                "grouped": bool(preset["props"].get("grouped")),
                "width": width,
                "height": height,
                "assetWidth": art.width if art is not None else 0,
                "assetHeight": art.height if art is not None else 0,
                "vectorInkBytes": None if art is not None else len(hex_payload) // 2,
                "artSource": source,
                "imageUrl": f"/assets/stamps/{target.name}" if art is not None else None,
                "title": preset["label"],
            }
        )

    pngs = list(STAMP_DIR.glob("*.png"))
    assert len(pngs) == 464 - coverage.get("missing", 0), f"{len(pngs)} PNGs for 464 stamps"
    for stamp in stamps:
        if stamp["imageUrl"] is None:
            continue
        with Image.open(STAMP_DIR / f"{stamp['id']}.png") as check:
            check.load()
            assert check.size == (stamp["assetWidth"], stamp["assetHeight"]), f"{stamp['id']}: pixel drift"
            assert check.mode == "RGBA"

    dump_json(DATA / "stamps.json",
              {"count": len(stamps), "artCoverage": coverage, "rasterVisible": 66,
               "referenceThumbnails": len(reference), "stamps": stamps})
    print(f"stamps.json      {len(stamps)} stamps, {len(pngs)} PNG")
    print(f"art coverage     {coverage}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
