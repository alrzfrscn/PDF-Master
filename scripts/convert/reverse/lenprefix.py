"""Test u32-length-prefix hypothesis for tag 0x57 (and neighbours)."""
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
            yield f"{tag}{i:04d}", b[:k], b[k + 16:]


if __name__ == "__main__":
    stats = collections.Counter()
    ok = bad = 0
    examples = []
    for name, hdr, b in bodies():
        for p in range(len(b) - 5):
            if b[p] != 0x57:
                continue
            ln = struct.unpack_from("<I", b, p + 1)[0]
            fits = 5 + ln <= len(b) and 0 < ln < 100000
            stats[(b[p + 1], fits)] += 1
            if fits:
                ok += 1
                if len(examples) < 8:
                    examples.append((name, p, ln, b[p + 5:p + 5 + min(ln, 30)].hex(), len(b)))
            else:
                bad += 1
    print("57 followed by plausible u32:", ok, "implausible:", bad)
    for e in examples:
        print("  ", e)
    print("low byte of len histogram:", collections.Counter(k[0] for k in stats).most_common(10))
