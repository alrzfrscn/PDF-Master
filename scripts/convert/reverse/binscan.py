"""Search the app binary for the constant blob signatures (read-only)."""
from __future__ import annotations
import sys, re
from pathlib import Path

EXE = Path(r"C:\Program Files\PDF Annotator\PDFAnnotator.exe")


def main():
    d = EXE.read_bytes()
    print("exe", len(d))
    sigs = {
        "guidA": bytes.fromhex("0632273aebf48e4e863b0e1ffe2dbbbf"),
        "guidB": bytes.fromhex("47467276e509084bb06b3c778bb88829"),
        "head": bytes.fromhex("1c01011d"),
        "head5": bytes.fromhex("1c01011d02"),
        "tail": bytes.fromhex("2ac0"),
    }
    for k, s in sigs.items():
        idx = [m.start() for m in re.finditer(re.escape(s), d)]
        print(k, len(idx), [hex(i) for i in idx[:8]])

    # candidates: GUID A found -> nearby strings
    for k in ("guidA", "guidB"):
        s = sigs[k]
        for i in [m.start() for m in re.finditer(re.escape(s), d)][:6]:
            win = d[max(0, i - 300):i + 300]
            strs = [x.decode("latin-1") for x in re.findall(rb"[\x20-\x7e]{5,}", win)]
            print(k, hex(i), strs[:14])


if __name__ == "__main__":
    main()
