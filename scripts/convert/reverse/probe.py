"""Probe: extract ink payloads from .pai / .pat and show structure. Read-only on sources."""
from __future__ import annotations
import sys, os, glob, struct, json
from pathlib import Path

TOOLS = Path(os.environ["LOCALAPPDATA"]) / "PDF Annotator" / "10.0" / "Tools"
PAT = Path(r"C:\Program Files\PDF Annotator\PADefaultToolData.pat")


def gif_payload(data: bytes) -> bytes:
    """Return comment-extension payload (after 0x00 + leb128 len)."""
    assert data[:6] in (b"GIF89a", b"GIF87a"), data[:6]
    p = 13
    packed = data[10]
    if packed & 0x80:
        p += 3 * (2 ** ((packed & 7) + 1))
    # walk blocks
    while p < len(data):
        b = data[p]
        if b == 0x3B:
            break
        if b == 0x21:
            label = data[p + 1]
            p += 2
            if label == 0xFE:
                out = bytearray()
                while data[p]:
                    n = data[p]; out += data[p + 1:p + 1 + n]; p += 1 + n
                p += 1
                # out = 0x00 + leb128 + payload
                assert out[0] == 0
                i = 1
                shift = 0; ln = 0
                while True:
                    byte = out[i]; i += 1
                    ln |= (byte & 0x7F) << shift
                    if not byte & 0x80: break
                    shift += 7
                return bytes(out[i:i + ln])
            if label == 0xF9:
                p += 1 + data[p]
                p += 1
            else:
                while data[p]:
                    p += 1 + data[p]
                p += 1
        elif b == 0x2C:
            p += 1
            packed = data[p + 8]
            p += 9
            if packed & 0x80:
                p += 3 * (2 ** ((packed & 7) + 1))
            p += 1  # min code size
            while data[p]:
                p += 1 + data[p]
            p += 1
        else:
            raise ValueError(f"unexpected block {b:#x} at {p}")
    raise ValueError("no comment")


def pat_stamps():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from common import load_pat
    root = load_pat()
    out = []
    for s in root.iter("Stamp"):
        el = s.find("InkData")
        if el is None or not el.text:
            continue
        out.append((s.get("Name") or s.get("Description") or "?", bytes.fromhex(el.text.strip())))
    return out


if __name__ == "__main__":
    print("PAT", PAT.exists())
    st = pat_stamps()
    print("stamps with InkData:", len(st))
    d = st[0][1]
    print("first:", st[0][0], len(d), d[:16].hex())
    pays = [gif_payload(d) for _, d in st]
    print("payload lens:", min(map(len, pays)), max(map(len, pays)))
    print("all end 2ac0:", all(p.endswith(b"\x2a\xc0") for p in pays))
    print("distinct prefixes:", {p[:16].hex() for p in pays}.__len__())
    for p in pays[:2]:
        print(len(p), p.hex())
