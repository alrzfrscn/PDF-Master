"""Map payload: record markers, periodic (bit-packed) runs, float runs."""
from __future__ import annotations
import sys, re
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from inventory import pat_payloads, pai_payloads


def decode_period(buf):
    """Return (period, width_bits, value) if buf is k equal w-bit codes."""
    n = len(buf)
    for w in range(1, 17):
        total_bits = n * 8
        if total_bits % w:
            continue
        cnt = total_bits // w
        if cnt < 3:
            continue
        acc = int.from_bytes(buf, "big")
        vals = [(acc >> (total_bits - w * (i + 1))) & ((1 << w) - 1) for i in range(cnt)]
        if len(set(vals)) == 1:
            return w, vals[0]
    return None


def runs(b, minbytes=12):
    out = []
    i = 0
    while i < len(b) - 8:
        best = None
        for period in range(1, 17):
            if i + period * 3 > len(b):
                break
            pat = b[i:i + period]
            j = i
            while j + period <= len(b) and b[j:j + period] == pat:
                j += period
            if j - i >= max(minbytes, 3 * period) and (best is None or j - i > best[1] - i):
                best = (i, j, period)
        if best:
            out.append(best)
            i = best[1]
        else:
            i += 1
    return out


def markers(b):
    return [m.start() for m in re.finditer(re.escape(bytes.fromhex("012ac0")), b)]


if __name__ == "__main__":
    pat = pat_payloads()
    pai = pai_payloads()
    for tag, idx in (("pat", 0), ("pai", 0), ("pai", 91), ("pat", 50)):
        b = (pat if tag == "pat" else pai)[idx][1]
        print(f"=== {tag}{idx} len={len(b)} markers={markers(b)}")
        for s, e, p in runs(b):
            d = decode_period(b[s:e])
            print(f"  periodic {s}-{e} ({e-s}B) period={p} bits={d[0] if d else '?'} val={d[1] if d else '?'}")
    print()
    print("=== pat0 head 240 bytes, 16/line with float view ===")
    import struct
    b = pat[0][1]
    for off in range(0, 240, 16):
        ch = b[off:off + 16]
        fl = []
        for k in range(0, 16, 4):
            v = struct.unpack("<f", ch[k:k + 4])[0]
            fl.append(f"{v:10.3g}" if abs(v) < 1e7 else "     big")
        print(f"{off:5d} {' '.join(f'{x:02x}' for x in ch)}  | {' '.join(fl)}")
