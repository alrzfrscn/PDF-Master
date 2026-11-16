"""Tabulate every factory stamp: description, canvas, payload len, GIF pixels, bbox, colors."""
from __future__ import annotations
import sys, io, collections, json
from pathlib import Path
from PIL import Image
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from common import load_pat
from probe import gif_payload


def leb(b, i):
    v = 0; s = 0
    while True:
        c = b[i]; i += 1
        v |= (c & 0x7F) << s
        if not c & 0x80: return v, i
        s += 7


def rows():
    root = load_pat()
    for i, s in enumerate(root.iter("Stamp")):
        el = s.find("InkData")
        if el is None or not el.text:
            continue
        raw = bytes.fromhex(el.text.strip())
        pay = gif_payload(raw)
        w, j = leb(pay, 5); h, j = leb(pay, j)
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        px = im.load()
        x0, y0, x1, y1 = 10 ** 9, 10 ** 9, -1, -1
        colors = collections.Counter()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a:
                    colors[(r, g, b)] += 1
                    x0 = min(x0, x); y0 = min(y0, y)
                    x1 = max(x1, x); y1 = max(y1, y)
        desc = (s.findtext("Description") or "").strip()
        yield dict(i=i, desc=desc, cat=s.get("Category"), canvas=(w, h), n=len(pay),
                   gif=(im.width, im.height), ink=(x1 - x0 + 1, y1 - y0 + 1) if colors else None,
                   colors=colors.most_common(3), raw=raw, payload=pay)


if __name__ == "__main__":
    rs = list(rows())
    Path(HERE / "table.json").write_text(json.dumps(
        [{k: v for k, v in r.items() if k not in ("raw", "payload")} for r in rs], indent=1, default=str))
    withink = [r for r in rs if r["ink"]]
    print(f"{len(rs)} stamps, {len(withink)} with visible GIF pixels")
    print("categories:", collections.Counter(r["cat"] for r in rs))
    print("with-ink categories:", collections.Counter(r["cat"] for r in withink))
    for r in withink[:70]:
        print(f'{r["i"]:4d} cat{r["cat"]} {r["desc"][:34]:34s} canvas={r["canvas"]} gif={r["gif"]} ink={r["ink"]} n={r["n"]} colors={r["colors"]}')
