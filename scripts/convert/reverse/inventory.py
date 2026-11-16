"""Inventory: all ink payloads, their sizes, names, ASCII runs, byte histograms."""
from __future__ import annotations
import sys, os, re, json, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import load_pat
from probe import gif_payload, TOOLS

OUT = Path(__file__).resolve().parent / "payloads"
OUT.mkdir(exist_ok=True)


def pat_payloads():
    root = load_pat()
    res = []
    for s in root.iter("Stamp"):
        el = s.find("InkData")
        if el is None or not el.text:
            continue
        name = None
        for k in ("Name", "Description", "Caption", "Id"):
            if s.get(k):
                name = s.get(k)
                break
        res.append((name, gif_payload(bytes.fromhex(el.text.strip()))))
    return res


def pai_payloads():
    out = []
    for f in sorted(TOOLS.glob("*.pai")):
        try:
            out.append((f.stem, gif_payload(f.read_bytes())))
        except Exception as e:
            out.append((f.stem, b""))
            print("ERR", f.name, e)
    return out


if __name__ == "__main__":
    p = pat_payloads()
    u = pai_payloads()
    print("pat", len(p), "pai", len(u))
    for tag, lst in (("pat", p), ("pai", u)):
        for i, (name, pay) in enumerate(lst):
            (OUT / f"{tag}{i:04d}.bin").write_bytes(pay)
        (OUT / f"{tag}_index.json").write_text(json.dumps(
            [{"i": i, "name": n, "len": len(b), "hex": b.hex() if len(b) < 400 else None}
             for i, (n, b) in enumerate(lst)], indent=1))
    print("sample names:", [n for n, _ in p[:5]], [n for n, _ in u[:3]])

    # ascii runs
    hits = 0
    for tag, lst in (("pat", p), ("pai", u)):
        for i, (name, b) in enumerate(lst):
            for m in re.finditer(rb"[\x20-\x7e]{5,}", b):
                hits += 1
                if hits < 40:
                    print(f"{tag}{i:04d} {name!r} off={m.start()} {m.group()[:80]!r}")
    print("ascii runs:", hits)

    # stats
    allb = b"".join(x for _, x in p)
    print("len min/med/max", min(len(x) for _, x in p), sorted(len(x) for _, x in p)[len(p) // 2], max(len(x) for _, x in p))
    print("tail:", collections.Counter(x[-4:].hex() for _, x in p).most_common(5))
    print("head16:", collections.Counter(x[:9].hex() for _, x in p).most_common(10))
    print("byte freq top:", collections.Counter(allb).most_common(12))
