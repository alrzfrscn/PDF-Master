"""Proper VS_VERSIONINFO reader for the install's binaries + section/export summary."""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from pe_scan import PE  # noqa: E402

INSTALL = Path(r"C:\Program Files\PDF Annotator")
TARGETS = ["PDFAnnotator.exe", "PDFXEditSimple.x64.dll", "ielib64.dll", "paHelper.exe",
           "paHelper32.exe", "goa.exe", "unins000.exe"]


def _align4(n: int) -> int:
    return (n + 3) & ~3


def parse_version(blob: bytes, depth=0, out=None):
    """Walk VS_VERSIONINFO: wLength, wValueLength, wType, szKey, padding, children."""
    if out is None:
        out = {}
    if len(blob) < 6:
        return out
    length, vlen, _type = struct.unpack_from("<HHH", blob, 0)
    if length == 0 or length > len(blob):
        length = len(blob)
    key_end = blob.find(b"\0\0", 6)
    key = blob[6:key_end].decode("utf-16-le", "replace") if key_end > 6 else ""
    rest = blob[_align4(key_end + 2) : length]
    if _type == 1 and vlen:                      # text value
        text = rest[: vlen * 2].decode("utf-16-le", "replace").split("\0")[0]
        out[key] = text
    elif key and _type == 0:
        while rest:
            sub_len = struct.unpack_from("<H", rest, 0)[0] if len(rest) >= 2 else 0
            if sub_len == 0 or sub_len > len(rest):
                break
            sub = rest[:sub_len]
            child = {}
            parse_version(sub, depth + 1, child)
            inner = {k: v for k, v in child.items() if k not in ("",)}
            if inner:
                out.setdefault(key, {}).update(inner) if isinstance(out.get(key), dict) else out.setdefault(key, inner)
            rest = rest[_align4(sub_len) :]
    return out


def versions(path: Path):
    pe = PE(path)
    pe.imports = pe.read_imports()
    tree, _ = pe.walk_resources()
    found = {}
    for e in tree.get("16", []):
        for l in e["langs"]:
            if l["off"] is None:
                continue
            blob = pe.data[l["off"] : l["off"] + l["size"]]
            if struct.unpack_from("<I", blob, 0)[0] == 0xFEEF04BD:
                ms, ls = struct.unpack_from("<II", blob, 8)
                found["FileVersion"] = f"{ms>>16}.{ms&0xFFFF}.{ls>>16}.{ls&0xFFFF}"
            text = blob.decode("utf-16-le", "replace")
            known = ("CompanyName", "FileDescription", "FileVersion", "InternalName",
                     "OriginalFilename", "ProductName", "ProductVersion", "LegalCopyright",
                     "Comments", "LegalTrademarks")
            for k in known:
                i = text.find(k + "\0")
                if i >= 0:
                    j = text.find("\0", i + len(k) + 1)
                    val = text[i + len(k) + 1 : j] if j > 0 else ""
                    if val and len(val) < 200:
                        found.setdefault(k, val)
    return pe, found


def exports(path: Path):
    pe = PE(path)
    rva, size = pe.dirs[0]
    if not rva:
        return []
    off = pe.off(rva)
    if off is None:
        return []
    (_, _, _, _, namerva, _, _, nnames, _, aof, _) = struct.unpack_from("<IIHHIIIIIII", pe.data, off)
    names = []
    base = pe.off(namerva)
    if base:
        for i in range(nnames):
            nrva = struct.unpack_from("<I", pe.data, base + 4 * i)[0]
            o = pe.off(nrva)
            if o:
                names.append(pe.data[o : pe.data.find(b"\0", o)].decode("latin1"))
    return names


if __name__ == "__main__":
    rows = []
    for name in TARGETS:
        p = INSTALL / name
        if not p.exists():
            continue
        pe, ver = versions(p)
        exps = exports(p)
        rows.append(
            {
                "file": name,
                "bytes": p.stat().st_size,
                "sections": [s["name"] for s in pe.sections],
                "entropies": [s["entropy"] for s in pe.sections],
                "imports": sorted(pe.imports),
                "version": ver,
                "exports_count": len(exps),
                "exports_sample": exps[:6],
            }
        )
    print(json.dumps(rows, indent=1, ensure_ascii=False))
