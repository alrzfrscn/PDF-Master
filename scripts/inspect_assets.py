"""Phase 1 recon: read-only inspection of PDF Annotator data assets.

Usage: python scripts/inspect_assets.py [--json out.json]
Never dumps multi-MB payloads; only schemas, counts and truncated samples.
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

INSTALL = Path(r"C:\Program Files\PDF Annotator")
PAT = INSTALL / "PADefaultToolData.pat"
PAP = INSTALL / "PADefaultTemplates.pap"
STYLES = INSTALL / "PAStyleTemplates.xml"
PADFILE = INSTALL / "pad_file.xml"


def sniff(b: bytes) -> str:
    if b[:4] == b"GIF8":
        return "gif"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if b[:2] == b"\xff\xd8":
        return "jpeg"
    if b[:4] == b"RIFF":
        return "riff/wav"
    if b[:5] == b"<?xml":
        return "xml"
    if re.fullmatch(rb"[0-9A-Fa-f]+", b[:64] or b"x"):
        return "hex-latin1"
    return "other"


def attr_profile(elems, tag):
    """Distinct attribute names + small value domains for one element type."""
    names = collections.Counter()
    values = collections.defaultdict(collections.Counter)
    for e in elems:
        for k, v in e.attrib.items():
            names[k] += 1
            if k not in ("GroupID", "Description"):
                values[k][v] += 1
    domains = {
        k: dict(c.most_common(12))
        for k, c in values.items()
        if len(c) <= 40
    }
    return {"count": len(elems), "attributes": dict(names.most_common()), "value_domains": domains}


def inspect_pat():
    raw = PAT.read_bytes()
    root = ET.fromstring(raw.decode("utf-8-sig"))

    groups = []
    for g in root.find("Groups").findall("Group"):
        caps = {}
        for c in g.findall("GroupCaption"):
            caps[c.get("Language", "ENU")] = (c.text or "").strip()
        groups.append(
            {
                "id": g.get("GroupID"),
                "category": g.get("Category"),
                "position": g.get("Position"),
                "tool_version": g.get("ToolVersion"),
                "captions": caps,
            }
        )
    cat_names = collections.Counter(g["category"] for g in groups)

    sections = {}
    for sec in root:
        if sec.tag == "Groups":
            continue
        sections[sec.tag] = [c for c in sec]

    ink = sections.get("InkTools", [])
    tool_types = collections.Counter(e.tag for e in ink)

    stamps = sections.get("StampTools", [])
    stamp_records = []
    for st in stamps:
        ink_data = st.findtext("InkData") or ""
        payload = bytes.fromhex(ink_data) if len(ink_data) > 16 and re.fullmatch(r"[0-9A-Fa-f]+", ink_data[:16]) else b""
        descs = {}
        for d in st.findall("Description"):
            descs[d.get("Language", "ENU")] = (d.text or "").strip()
        stamp_records.append(
            {
                "position": st.get("Position"),
                "category": st.get("Category"),
                "group": st.get("GroupID"),
                "grouped": (st.findtext("Grouped") or "").strip(),
                "payload_kind": sniff(payload) if payload else "hex-or-unknown",
                "ink_bytes": len(payload),
                "ink_chars": len(ink_data),
                "descriptions": descs,
            }
        )
    kind_stats = collections.Counter(r["payload_kind"] for r in stamp_records)
    sizes = sorted(r["ink_bytes"] for r in stamp_records)

    def sample(records, pick, n=3):
        out = []
        for r in pick:
            s = dict(r)
            token = "<parsed>" if r["ink_bytes"] else ""
            out.append((s, token))
        return out

    gifs = [r for r in stamp_records if r["payload_kind"] == "gif"]
    vectors = [r for r in stamp_records if r["payload_kind"] == "hex-latin1"]
    sample_gif = sorted(gifs, key=lambda r: r["ink_bytes"])[:2]
    sample_vec = sorted(vectors, key=lambda r: r["ink_bytes"])[:2]

    # Raw first 220 chars of InkData for the samples, to show the exact schema.
    def raw_ink(pos, group):
        for st in stamps:
            if st.get("Position") == pos and st.get("GroupID") == group:
                return (st.findtext("InkData") or "")[:220]
        return ""

    samples = []
    for r in sample_gif + sample_vec:
        s = dict(r)
        s["ink_head"] = raw_ink(r["position"], r["group"])
        samples.append(s)

    go = sections.get("GOTools", [])
    return {
        "file": str(PAT),
        "bytes": len(raw),
        "encoding": "UTF-8 BOM",
        "format": "XML",
        "root": root.tag,
        "groups": groups,
        "groups_by_category": dict(cat_names),
        "group_caption_languages": sorted({k for g in groups for k in g["captions"]}),
        "sections": {k: len(v) for k, v in sections.items()},
        "ink_tool_types": dict(tool_types),
        "profiles": {
            "Pen": attr_profile([e for e in ink if e.tag == "Pen"], "Pen"),
            "Marker": attr_profile([e for e in ink if e.tag == "Marker"], "Marker"),
            "Text": attr_profile(sections.get("TextTools", []), "Text"),
            "GraphicalTool": attr_profile(go, "GraphicalTool"),
            "Stamp": {
                "count": len(stamps),
                "payload_kinds": dict(kind_stats),
                "ink_bytes_min": sizes[0],
                "ink_bytes_median": sizes[len(sizes) // 2],
                "ink_bytes_max": sizes[-1],
                "grouped_values": dict(collections.Counter(r["grouped"] for r in stamp_records)),
                "unique_descriptions_en": len({r["descriptions"].get("ENU") for r in stamp_records}),
                "description_sample": [r["descriptions"] for r in stamp_records[:14]],
            },
        },
        "stamp_samples": samples,
        "graphical_typecodes": dict(
            collections.Counter(e.get("TypeCode") for e in go)
        ),
    }


def inspect_pap():
    zf = zipfile.ZipFile(PAP)
    infos = zf.infolist()
    ext = collections.Counter(Path(i.filename).suffix.lower() or "<none>" for i in infos)
    tops = collections.Counter(i.filename.split("/")[0] for i in infos)
    dirs = collections.Counter(
        "/".join(i.filename.split("/")[:-1]) for i in infos if "/" in i.filename
    )
    entries = [
        {
            "name": i.filename,
            "size": i.file_size,
            "packed": i.compress_size,
            "method": i.compress_type,
        }
        for i in infos
    ]
    # verify every PDF member really is a PDF (read only the header)
    pdf_sig = collections.Counter()
    for i in infos:
        if i.filename.lower().endswith(".pdf"):
            with zf.open(i) as fh:
                pdf_sig[fh.read(8)[:5]] += 1
    return {
        "file": str(PAP),
        "bytes": PAP.stat().st_size,
        "format": "ZIP archive (PK\\x03\\x04, deflate)",
        "entries": len(infos),
        "extensions": dict(ext),
        "top_level": dict(tops),
        "directories": dict(dirs),
        "pdf_signatures": {k.decode("latin1"): v for k, v in pdf_sig.items()},
        "listing": entries,
    }


def inspect_styles():
    root = ET.fromstring(STYLES.read_text(encoding="utf-8-sig"))
    templates = root.findall("Template")
    styles = collections.Counter(t.get("Style", "") for t in templates)
    sizes = collections.Counter()
    line_cfgs = collections.Counter()
    bounds = 0
    metric = collections.Counter(t.get("IsMetric") for t in templates)
    for t in templates:
        for p in t.findall("Page"):
            sizes[p.get("Size")] += 1
            if p.find("Bounds") is not None:
                bounds += 1
        for lines in t.findall("Lines"):
            for ln in lines.findall("Line"):
                line_cfgs[
                    (lines.get("Width"), lines.get("Color"), ln.get("DeltaX"), ln.get("DeltaY"))
                ] += 1
    return {
        "file": str(STYLES),
        "bytes": STYLES.stat().st_size,
        "root": root.tag,
        "templates": len(templates),
        "styles": dict(styles),
        "page_sizes": dict(sizes),
        "with_bounds": bounds,
        "is_metric": {str(k): v for k, v in metric.items()},
        "line_grids": [
            {"width": k[0], "color": k[1], "dx": k[2], "dy": k[3], "templates": v}
            for k, v in line_cfgs.most_common()
        ],
        "template_attributes": sorted({a for t in templates for a in t.attrib}),
    }


def inspect_pad_file():
    root = ET.fromstring(PADFILE.read_text(encoding="utf-8"))
    info = {}
    for e in root.iter():
        if e is not root and len(e) == 0 and (e.text or "").strip():
            info["/".join((e.tag,))] = e.text.strip()
    sections = [c.tag for c in root]
    leaves = collections.Counter(e.tag for e in root.iter() if len(e) == 0)
    keep = {k: v for k, v in info.items() if any(
        t in k.upper() for t in ("VERSION", "PRODUCT", "COMPANY", "FILE", "DATE", "NAME", "PROGRAM")
    )}
    return {
        "file": str(PADFILE),
        "root": root.tag,
        "sections": sections,
        "leaf_tags": dict(leaves.most_common(40)),
        "version_like": dict(sorted(keep.items())[:40]),
    }


def main():
    out = {
        "tool_data": inspect_pat(),
        "templates": inspect_pap(),
        "style_templates": inspect_styles(),
        "pad_file": inspect_pad_file(),
    }
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    a = ap.parse_args()
    if a.json:
        Path(a.json).write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(out, indent=1, ensure_ascii=False)[:20000])


if __name__ == "__main__":
    main()
