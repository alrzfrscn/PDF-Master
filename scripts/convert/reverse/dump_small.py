"""Dump shortest payloads fully; group by identical header; find common tails."""
from __future__ import annotations
import sys, collections
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from inventory import pat_payloads, pai_payloads


def dump(b, per=32):
    for i in range(0, len(b), per):
        chunk = b[i:i + per]
        print(f"  {i:5d}  {' '.join(f'{x:02x}' for x in chunk)}")


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
    print("=== 6 shortest pat ===")
    for i, (n, b) in sorted(enumerate(pat), key=lambda t: len(t[1][1]))[:6]:
        w, j = leb(b, 5); h, j = leb(b, j)
        print(f"pat{i:04d} len={len(b)} canvas={w}x{h} {n}")
        dump(b)
    print()
    print("=== 4 shortest pai ===")
    for i, (n, b) in sorted(enumerate(pai), key=lambda t: len(t[1][1]))[:4]:
        w, j = leb(b, 5); h, j = leb(b, j)
        print(f"pai{i:04d} len={len(b)} canvas={w}x{h} {n}")
        dump(b)
