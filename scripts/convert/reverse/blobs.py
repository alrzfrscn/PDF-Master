"""Tabulate first 0x57 blob per payload; group identical blobs."""
from __future__ import annotations
import sys, struct, collections
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from inventory import pat_payloads, pai_payloads

G = bytes.fromhex("47467276e509084bb06b3c778bb88829")


def first_blob(b):
    k = b.index(G)
    body = b[k + 16:]
    for pos in range(len(body) - 6):
        if body[pos] == 0x57:
            ln = struct.unpack_from("<I", body, pos + 1)[0]
            if body[pos + 3] == 0 and body[pos + 4] == 0 and 0 < ln <= len(body) - pos - 5:
                return pos, body[pos + 5:pos + 5 + ln]
    return None, None


if __name__ == "__main__":
    pat = pat_payloads()
    pai = pai_payloads()
    groups = collections.Counter()
    for tag, lst in (("pat", pat), ("pai", pai)):
        for i, (n, b) in enumerate(lst):
            pos, blob = first_blob(b)
            groups[(pos, blob.hex() if blob else None)] += 1
    for (pos, blob), c in groups.most_common(30):
        print(f"  x{c:4d} pos={pos} {blob}")
