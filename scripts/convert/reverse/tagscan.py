"""Find which byte values behave like 'tag + u32 length' (high 3 bytes zero)."""
from __future__ import annotations
import sys, struct, collections
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from inventory import pat_payloads, pai_payloads

GUIDB = bytes.fromhex("47467276e509084bb06b3c778bb88829")


def bodies():
    for tag, lst in (("pat", pat_payloads()), ("pai", pai_payloads())):
        for i, (n, b) in enumerate(lst):
            k = b.index(GUIDB)
            yield f"{tag}{i:04d}", b[k + 16:]


if __name__ == "__main__":
    cnt = collections.Counter()
    hit = collections.Counter()
    for name, b in bodies():
        for p in range(len(b) - 5):
            v = b[p]
            cnt[v] += 1
            ln = struct.unpack_from("<I", b, p + 1)[0]
            if 0 < ln <= len(b) - p - 5 and b[p + 3] == 0 and b[p + 4] == 0:
                hit[v] += 1
    ranked = sorted(((hit[v] / cnt[v], v, hit[v], cnt[v]) for v in cnt if cnt[v] > 300), reverse=True)
    for r, v, h, c in ranked[:14]:
        print(f"  0x{v:02x} ({chr(v) if 32 <= v < 127 else '.'}) frac={r:.3f} hits={h} of {c}")
