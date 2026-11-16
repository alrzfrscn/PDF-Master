"""Structure probe: aligned hexdump of chosen payloads + varint decoding attempts."""
from __future__ import annotations
import sys, json
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from inventory import pat_payloads, pai_payloads


def hx(b, n=96, start=0):
    b = b[start:start + n]
    return " ".join(f"{x:02x}" for x in b)


def leb(b, i):
    v = 0; s = 0
    while True:
        c = b[i]; i += 1
        v |= (c & 0x7F) << s
        if not c & 0x80: return v, i
        s += 7


if __name__ == "__main__":
    pat = pat_payloads()
    pai = pai_payloads()
    print("== pat, first 12, first 40 bytes ==")
    for i, (n, b) in enumerate(pat[:12]):
        print(f"{i:4d} {len(b):6d} {hx(b,40)}")
    print("== pai, first 12 ==")
    for i, (n, b) in enumerate(pai[:12]):
        print(f"{i:4d} {len(b):6d} {hx(b,40)}")
    print()
    print("== varint after 5-byte header, and canvas guess ==")
    for name, lst in (("pat", pat), ("pai", pai)):
        ok = 0; tot = 0
        for i, (n, b) in enumerate(lst):
            if b[:5] != bytes.fromhex("1c01011d02"):
                continue
            tot += 1
            w, j = leb(b, 5); h, j = leb(b, j)
            tail = b[j:j + 3]
            if tail[:1] == b"\x01":
                ok += 1
            if i < 6 or tot < 4:
                print(f"  {name}{i}: w={w} h={h} next={tail.hex()}")
        print(name, "candidates", tot, "with 0x01 after:", ok)
