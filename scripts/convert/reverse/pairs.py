"""Find near-identical payload pairs (same length, few differing bytes) -> field isolation."""
from __future__ import annotations
import sys, itertools, collections
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


def diffs(a, b):
    return [i for i in range(len(a)) if a[i] != b[i]]


if __name__ == "__main__":
    pat = pat_payloads()
    pai = pai_payloads()
    for tag, lst in (("pat", pat), ("pai", pai)):
        groups = collections.defaultdict(list)
        for i, (n, b) in enumerate(lst):
            w, j = leb(b, 5); h, j = leb(b, j)
            groups[(len(b), w, h)].append(i)
        best = []
        for k, ids in groups.items():
            if len(ids) < 2:
                continue
            for a, c in itertools.combinations(ids, 2):
                d = diffs(lst[a][1], lst[c][1])
                best.append((len(d), a, c, d))
        best.sort()
        print(f"== {tag}: {len(best)} pairs ==")
        for nd, a, c, d in best[:6]:
            print(f" {a}<->{c} ndiff={nd} len={len(lst[a][1])}")
            for p in d[:20]:
                print(f"    off {p:5d}  {lst[a][1][p]:02x} vs {lst[c][1][p]:02x}  ctx {lst[a][1][max(0,p-6):p+8].hex()}")
