"""Read-only PE reconnaissance for the PDF Annotator install.

Prints: headers, sections + entropy, import summary, resource tree (tolerant),
packer/compiler signatures, and whether Delphi DFM (TPF0) blobs exist.
No target code is executed and nothing under Program Files is written.
"""
from __future__ import annotations

import collections
import json
import math
import re
import struct
import sys
from pathlib import Path

INSTALL = Path(r"C:\Program Files\PDF Annotator")


def entropy(b: bytes) -> float:
    if not b:
        return 0.0
    c = collections.Counter(b)
    n = len(b)
    return -sum(v / n * math.log2(v / n) for v in c.values())


class PE:
    def __init__(self, path: Path):
        self.path = path
        self.data = path.read_bytes()
        d = self.data
        self.e_lfanew = struct.unpack_from("<I", d, 0x3C)[0]
        assert d[self.e_lfanew : self.e_lfanew + 4] == b"PE\0\0", "not PE"
        coff = self.e_lfanew + 4
        (self.machine, self.nsec, self.timestamp, _, _, self.opt_size, self.characteristics) = struct.unpack_from(
            "<HHIIIHH", d, coff
        )
        opt = coff + 20
        self.magic = struct.unpack_from("<H", d, opt)[0]
        self.pe32plus = self.magic == 0x20B
        self.entry_rva = struct.unpack_from("<I", d, opt + 16)[0]
        self.image_base = struct.unpack_from("<Q" if self.pe32plus else "<I", d, opt + 24)[0]
        self.subsystem = struct.unpack_from("<H", d, opt + 68)[0]
        dd = opt + (112 if self.pe32plus else 96)
        self.dirs = [struct.unpack_from("<II", d, dd + 8 * i) for i in range(16)]
        self.sections = []
        s = opt + self.opt_size
        for i in range(self.nsec):
            name, vsize, vaddr, rsize, rptr = struct.unpack_from("<8sIIII", d, s + 40 * i)
            raw = d[rptr : rptr + rsize]
            self.sections.append(
                {
                    "name": name.rstrip(b"\0").decode("latin1"),
                    "vaddr": vaddr,
                    "vsize": vsize,
                    "raw_size": rsize,
                    "raw_ptr": rptr,
                    "entropy": round(entropy(raw), 2),
                    "md5ish": __import__("hashlib").sha256(raw).hexdigest()[:12],
                }
            )
        self.tls = self.dirs[9]
        self.resource_dir = self.dirs[2]
        self.imports = {}
        self.exports = []

    def off(self, rva: int):
        for s in self.sections:
            start, end = s["vaddr"], s["vaddr"] + max(s["vsize"], s["raw_size"])
            if start <= rva < end:
                delta = rva - start
                if delta < s["raw_size"]:
                    return s["raw_ptr"] + delta
        return None

    def read_rva(self, rva: int, size: int):
        o = self.off(rva)
        return self.data[o : o + size] if o is not None else None

    def read_imports(self):
        rva, size = self.dirs[1]
        d = self.data
        if not rva:
            return {}
        out = {}
        base = self.off(rva)
        if base is None:
            return {}
        i = 0
        while True:
            desc = d[base + 20 * i : base + 20 * i + 20]
            if len(desc) < 20:
                break
            ilt, _, _, name_rva, iat = struct.unpack("<IIIII", desc)
            if not name_rva:
                break
            n = self.read_rva(name_rva, 256) or b""
            name = n.split(b"\0")[0].decode("latin1", "replace")
            funcs = []
            t = self.off(ilt or iat)
            if t is not None:
                step = 8 if self.pe32plus else 4
                fmt = "<Q" if self.pe32plus else "<I"
                for k in range(4000):
                    v = struct.unpack_from(fmt, d, t + k * step)[0]
                    if v == 0:
                        break
                    if v & (1 << (step * 8 - 1)):
                        funcs.append("#%d" % (v & 0xFFFF))
                    else:
                        fn = self.read_rva((v & 0x7FFFFFFF) + 2, 200) or b""
                        funcs.append(fn.split(b"\0")[0].decode("latin1", "replace"))
            out[name] = funcs
            i += 1
        return out

    def walk_resources(self):
        """Tolerant resource enumeration: types -> names -> languages -> data."""
        rva, size = self.resource_dir
        if not rva:
            return {}
        base_off = self.off(rva)
        if base_off is None:
            return {}
        d = self.data
        tree = {}
        warnings = []

        def parse_dir(off):
            if off + 16 > len(d):
                return None
            named, ids = struct.unpack_from("<HH", d, off + 12)
            entries = []
            for i in range(named + ids):
                eo = off + 16 + 8 * i
                if eo + 8 > len(d):
                    break
                name, target = struct.unpack_from("<II", d, eo)
                entries.append((name, target))
            return entries

        def name_of(entry_name, off):
            if entry_name & 0x80000000:
                so = base_off + (entry_name & 0x7FFFFFFF)
                n = struct.unpack_from("<H", d, so)[0]
                return d[so + 2 : so + 2 + n * 2].decode("utf-16-le", "replace")
            return str(entry_name)

        top = parse_dir(base_off)
        if top is None:
            return {}
        for tname, ttarget in top:
            type_name = name_of(tname, base_off)
            tdir = base_off + (ttarget & 0x7FFFFFFF) if ttarget & 0x80000000 else None
            store = tree.setdefault(type_name, [])
            if tdir is None:
                continue
            for nname, ntarget in parse_dir(tdir) or []:
                item = {"name": name_of(nname, base_off), "langs": []}
                if ntarget & 0x80000000:
                    ndir = base_off + (ntarget & 0x7FFFFFFF)
                    for lname, ltarget in parse_dir(ndir) or []:
                        if ltarget & 0x80000000:
                            continue
                        do = base_off + ltarget
                        if do + 16 > len(d):
                            continue
                        drva, dsize = struct.unpack_from("<II", d, do)
                        item["langs"].append(
                            {"lang": name_of(lname, base_off), "rva": drva, "size": dsize,
                             "off": self.off(drva)}
                        )
                else:
                    warnings.append(f"{type_name}/{item['name']}: data entry without language level")
                store.append(item)
        return tree, warnings


SIGS = [
    (b"UPX0", "UPX packer"),
    (b"UPX1", "UPX packer"),
    (b"ASPack", "ASPack packer"),
    (b".aspack", "ASPack section"),
    (b".adata", "ASPack data section"),
    (b"ASProtect", "ASProtect protector"),
    (b"Enigma", "Enigma protector"),
    (b"Themida", "Themida protector"),
    (b"VMProtect", "VMProtect"),
    (b"TPF0", "Delphi form (binary DFM)"),
    (b"Borland", "Delphi/C++Builder marker"),
    (b"Embarcadero", "Delphi/C++Builder marker"),
    (b"DELPHI", "Delphi marker"),
    (b"Ghostscript", "Ghostscript"),
    (b"PDF-XChange", "PDF-XChange"),
    (b"Tracker Software", "PDF-XChange vendor"),
]


def scan_binary(path: Path):
    pe = PE(path)
    pe.imports = pe.read_imports()
    res = pe.walk_resources()
    tree, warnings = (res if isinstance(res, tuple) else ({}, []))
    hits = {}
    for sig, label in SIGS:
        c = pe.data.count(sig)
        if c:
            hits[f"{label} :: {sig.decode('latin1', 'replace')}"] = c
    # short printable strings that look like product/compiler markers
    vers = re.findall(rb"(?:ProductVersion|FileVersion|OriginalFilename|CompanyName|LegalCopyright)\0", pe.data)
    out = {
        "name": path.name,
        "bytes": len(pe.data),
        "machine": hex(pe.machine),
        "pe32plus": pe.pe32plus,
        "image_base": hex(pe.image_base),
        "subsystem": pe.subsystem,
        "coff_timestamp": pe.timestamp,
        "sections": pe.sections,
        "imports": {k: len(v) for k, v in pe.imports.items()},
        "import_details": {k: v[:12] for k, v in pe.imports.items() if k.lower().split(".")[0] in
                          ("gdi32", "user32", "ole32", "msftedit", "riched20", "winspool", "shlwapi")},
        "resource_types": {k: len(v) for k, v in sorted(tree.items())} if tree else {},
        "resource_warnings": warnings[:5],
        "signature_hits": hits,
        "versioninfo_keywords": [v.decode() for v in dict.fromkeys(vers)],
    }
    if tree:
        out["dvf"] = [
            {"type": t, "names": [e["name"] for e in items][:30]}
            for t, items in tree.items()
            if t in ("RCDATA", "ICON", "BITMAP", "CURSOR", "STRING", "VERSION", "GROUP_ICON", "GROUP_CURSOR", "MANIFEST")
        ]
    # TPF0 blobs: which resource entries start with it, and how many free-floating
    if tree:
        forms = []
        for e in tree.get("RCDATA", []):
            for l in e["langs"]:
                if l["off"] is None:
                    continue
                head = pe.data[l["off"] : l["off"] + 4]
                if head == b"TPF0":
                    forms.append({"name": e["name"], "size": l["size"]})
        out["dfm_forms"] = forms
        out["dfm_form_count"] = len(forms)
    return out


if __name__ == "__main__":
    targets = sys.argv[1:] or [str(p) for p in INSTALL.glob("*.exe")] + [str(INSTALL / "PDFXEditSimple.x64.dll"), str(INSTALL / "ielib64.dll")]
    result = [scan_binary(Path(t)) for t in targets]
    print(json.dumps(result, indent=1)[:int(sys.argv[0] and 60000)])
