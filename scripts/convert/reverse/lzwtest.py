"""Test: known magics, and LZW (GIF-style var code size) decompression at all bit offsets."""
from __future__ import annotations
import sys, zlib, bz2, lzma
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from inventory import pat_payloads, pai_payloads

MAGICS = {
    "bmp": b"BM", "png": b"\x89PNG", "gif": b"GIF8", "jpeg": b"\xff\xd8\xff",
    "zlib": b"\x78\x9c", "zip": b"PK\x03\x04", "emf": b"\x01\x00\x00\x00",
    "lzma": b"\x5d\x00\x00", "rar": b"Rar!", "cab": b"MSCF", "tiff": b"II*\x00",
    "wmf": b"\xd7\xcd\xc6\x9a", "pfx": b"wRBX",
}


class Bits:
    def __init__(self, b, off=0, lsb=True):
        self.b = b; self.p = off; self.lsb = lsb

    def get(self, n):
        v = 0
        if self.lsb:
            for k in range(n):
                byte = self.b[self.p >> 3]
                bit = (byte >> (self.p & 7)) & 1
                v |= bit << k
                self.p += 1
        else:
            for _ in range(n):
                byte = self.b[self.p >> 3]
                bit = (byte >> (7 - (self.p & 7))) & 1
                v = (v << 1) | bit
                self.p += 1
        return v


def lzw(data, off, mincode, lsb=True):
    bits = Bits(data, off, lsb)
    clear = 1 << mincode
    end = clear + 1
    size = mincode + 1
    table = [bytes([i]) for i in range(clear)] + [b"", b""]
    out = bytearray()
    prev = None
    nbits = len(data) * 8 - off
    while bits.p + size <= len(data) * 8:
        code = bits.get(size)
        if code == clear:
            table = [bytes([i]) for i in range(clear)] + [b"", b""]
            size = mincode + 1
            prev = None
            continue
        if code == end:
            break
        if prev is None:
            if code >= len(table):
                return None
            out += table[code]
            prev = table[code]
            continue
        if code < len(table):
            entry = table[code]
            table.append(prev + entry[:1])
        elif code == len(table):
            entry = prev + prev[:1]
            table.append(entry)
        else:
            return None
        out += entry
        prev = entry
        if len(table) >= (1 << size) and size < 12:
            size += 1
        if len(out) > 4_000_000:
            return None
    return bytes(out)


def looks(b):
    if b is None or len(b) < 16:
        return False
    f1 = sum(1 for x in b if x in (0x00, 0x80, 0x3f, 0xbf))
    return f1 / len(b) > 0.15


if __name__ == "__main__":
    pat = pat_payloads()
    pai = pai_payloads()
    mag = {k: 0 for k in MAGICS}
    for tag, lst in (("pat", pat), ("pai", pai)):
        for i, (n, b) in enumerate(lst):
            for k, m in MAGICS.items():
                if m in b:
                    mag[k] += 1
    print("magic hits:", mag)

    hits = 0
    for tag, lst in (("pat", pat), ("pai", pai)):
        for i, (n, b) in enumerate(lst[:60]):
            for off in range(0, 40):
                for mc in (2, 3, 5, 7, 8):
                    for lsb in (True, False):
                        if off + 24 > len(b) * 8:
                            continue
                        o = lzw(b, off, mc, lsb)
                        if looks(o):
                            hits += 1
                            print(f"HIT {tag}{i} off={off} min={mc} lsb={lsb} len={len(o)} head={o[:24].hex()}")
                            if hits > 10: raise SystemExit
    print("lzw hits:", hits)
