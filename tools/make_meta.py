#!/usr/bin/env python3
"""결과물 파일 크기를 data/works.json의 kb에 채운다. 카드의 파일 정보 줄에 쓴다. 사용법: python3 tools/make_meta.py"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
path = ROOT / "data" / "works.json"
data = json.loads(path.read_text(encoding="utf-8"))

for w in data["works"]:
    f = w.get("file") or ""
    p = ROOT / f
    w.pop("outline", None); w.pop("kb", None)
    if not f or not p.is_file():
        continue
    w["kb"] = round(p.stat().st_size / 1024)

path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
for w in data["works"]:
    print(w["id"], w.get("kb"))
