"""Skeleton: all plausible 'tag + u32 len + data' constructs per payload."""
from __future__ import annotations
import sys, struct
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from inventory import pat_payloads, pai_payloads

G = bytes.fromhex("47467276e509084bb06b3c778bb88829")


def show(b, label):
    k = b.index(G)
    body = b[k + 16:]
    print(f"=== {label} canvas-prefix={b[:k].hex()} bodylen={len(body)}")
    for pos in range(len(body) - 6):
        ln = struct.unpack_from("<I", body, pos + 1)[0]
        if body[pos + 3] == 0 and body[pos + 4] == 0 and 0 < ln <= len(body) - pos - 5:
            tag = body[pos]
            ch = chr(tag) if 32 <= tag < 127 else "."
            print(f"   pos={pos:5d} tag={tag:02x}({ch}) len={ln:4d} data={body[pos + 5:pos + 5 + min(ln, 26)].hex()}")


if __name__ == "__main__":
    pat = pat_payloads()
    pai = pai_payloads()
    for i in (0, 1, 5, 114, 50):
        show(pat[i][1], f"pat{i}")
    for i in (0, 91):
        show(pai[i][1], f"pai{i}")
