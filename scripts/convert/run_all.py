"""Run the whole migration in dependency order: 01 -> 03 -> 04 -> 02 -> 05.

02 needs the user thumbnails from 04, so the numbering is not the run order.
Usage: python scripts/convert/run_all.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = ["01_extract_presets.py", "03_extract_templates.py", "04_extract_user_assets.py",
         "02_extract_stamps.py", "05_build_manifest.py"]

for step in STEPS:
    print(f"\n=== {step}")
    result = subprocess.run([sys.executable, str(HERE / step)], cwd=HERE.parents[1])
    if result.returncode != 0:
        sys.exit(result.returncode)
print("\nmigration complete")
