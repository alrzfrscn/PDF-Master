"""Column-wise variation across all payloads aligned after the fixed header."""
from __future__ import annotations
import sys, collections
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from inventory import pat_payloads, pai_payloads


def leb(b, i):
    v = 0; s = 0
    while True:
        c = b[i]; i += 1
        v |= (c & 0x7F) << s
        if not c & 0x80: return v, i
        s += 7


def main():
    pat = pat_payloads()
    pai = pai_payloads()
    GUIDB = bytes.fromhex("47467276e509084bb06b3c778bb88829")
    heads = []
    bodies = []
    for tag, lst in (("pat", pat), ("pai", pai)):
        for i, (n, b) in enumerate(lst):
            k = b.index(GUIDB)
            heads.append((f"{tag}{i:04d}", b[:k]))
            bodies.append((f"{tag}{i:04d}", b[k + 16:]))
    print("header col 4:", collections.Counter(h[4] for _, h in heads).most_common())
    print("header lens:", collections.Counter(len(h) for _, h in heads).most_common(8))
    for off in range(0, 30):
        col = collections.Counter(h[off] for _, h in heads if len(h) > off)
        top = ", ".join(f"{v:02x}:{c}" for v, c in col.most_common(3))
        print(f"  hdr+{off:3d} distinct={len(col):4d}  {top}")
    print()
    print("body lens:", min(len(x[1]) for x in bodies), max(len(x[1]) for x in bodies))
    for off in range(0, 40):
        col = collections.Counter(b_[off] for _, b_ in bodies if len(b_) > off)
        top = ", ".join(f"{v:02x}:{c}" for v, c in col.most_common(3))
        print(f"  +{off:3d} distinct={len(col):4d}  {top}")


if __name__ == "__main__":
    main()
