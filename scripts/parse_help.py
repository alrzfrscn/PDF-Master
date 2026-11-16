"""Parse the decompiled English help set into a feature map.

Input: a decompiled CHM folder (produced by `hh.exe -decompile`).
Output: scripts/out/help_topics.json with TOC tree, index keywords, topic titles,
and section headings, used to build the Phase 1 feature matrix.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

HELP = Path(r"C:\Users\Aa\AppData\Local\Temp\opencode\chm\en")
OUT = Path(__file__).parent / "out"


def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_hhc(path: Path):
    s = path.read_text(encoding="latin1", errors="replace")
    items = re.findall(r'<param name="(Name|Local)" value="([^"]*)"', s)
    pairs = []
    for i in range(len(items) - 1):
        if items[i][0] == "Name" and items[i + 1][0] == "Local":
            pairs.append({"title": items[i][1], "local": items[i + 1][1]})
    return pairs


def parse_hhk(path: Path):
    s = path.read_text(encoding="latin1", errors="replace")
    names = re.findall(r'<param name="Name" value="([^"]*)"', s)
    return list(dict.fromkeys(names))


def topic(path: Path):
    s = path.read_text(encoding="latin1", errors="replace")
    title = re.search(r"<title>(.*?)</title>", s, re.S | re.I)
    h1 = re.findall(r"<h1[^>]*>(.*?)</h1>", s, re.S | re.I)
    h2 = re.findall(r"<h2[^>]*>(.*?)</h2>", s, re.S | re.I)
    h3 = re.findall(r"<h3[^>]*>(.*?)</h3>", s, re.S | re.I)
    body = strip_tags(s)
    return {
        "file": path.name,
        "title": strip_tags(title.group(1)) if title else "",
        "h1": [strip_tags(x) for x in h1][:3],
        "h2": [strip_tags(x) for x in h2][:12],
        "h3": [strip_tags(x) for x in h3][:20],
        "words": len(body.split()),
    }


def main():
    OUT.mkdir(exist_ok=True)
    hhc = next(HELP.glob("*.hhc"))
    hhk = next(HELP.glob("*.hhk"))
    topics = [topic(p) for p in sorted(HELP.glob("*.htm"))]
    data = {
        "toc": parse_hhc(hhc),
        "index_keywords": parse_hhk(hhk),
        "topics": topics,
        "topic_count": len(topics),
    }
    (OUT / "help_topics.json").write_text(
        json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8"
    )
    for t in data["toc"]:
        print(f"{t['title']}  ->  {t['local']}")
    print("--- index keywords:", len(data["index_keywords"]))
    print("--- topics:", data["topic_count"])


if __name__ == "__main__":
    main()
