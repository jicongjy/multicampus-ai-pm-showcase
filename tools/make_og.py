#!/usr/bin/env python3
"""공유 미리보기 이미지(assets/og.png, 1200x630)를 데이터에서 만든다. 헤드리스 Chrome 필요.
홈 대시보드와 같은 구성: 큰 숫자, 일별 점 차트, 파란 면. 이름은 넣지 않는다.
사용: python3 tools/make_og.py
"""
import html, json, subprocess, tempfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ld = lambda n: json.loads((ROOT / "data" / n).read_text(encoding="utf-8"))
site = ld("works.json")
works, weeks = site["works"], site["weeks"]
notes, terms = ld("notes.json")["notes"], ld("terms.json")["terms"]

per_day = {}
for d in [w["date"] for w in works] + [n["date"] for n in notes] + [t["first"] for t in terms]:
    per_day[d] = per_day.get(d, 0) + 1
total = len(works) + len(notes) + len(terms)
start = date.fromisoformat(weeks[0]["start"])
end = max(date.fromisoformat(d) for d in per_day)
cur_start = max(w["start"] for w in weeks if w["start"] <= end.isoformat())
per = max(1, -(-max(per_day.values()) // 8))

cols = []
d = start
while d <= end:
    iso = d.isoformat()
    n = -(-per_day.get(iso, 0) // per)
    cls = "c" if iso >= cur_start else ""
    cols.append(f'<div class="col {cls}">' + "<i></i>" * n + "</div>")
    d += timedelta(days=1)

page = f"""<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
* {{ box-sizing: border-box; margin: 0; word-break: keep-all; }}
body {{ width: 1200px; height: 630px; font-family: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif; display: grid; grid-template-columns: 1fr 340px; background: #fff; color: #161616; overflow: hidden; }}
.l {{ padding: 54px 56px 48px; display: flex; flex-direction: column; }}
.b {{ font-size: 28px; font-weight: 600; letter-spacing: -.03em; display: flex; align-items: center; gap: 12px; }}
.b span {{ width: 18px; height: 18px; border-radius: 50%; background: #161616; display: inline-block; }}
.n {{ font-size: 200px; font-weight: 300; letter-spacing: -.07em; line-height: 1; margin-top: 16px; }}
.s {{ font-size: 26px; color: #767676; margin-top: 6px; }}
.chart {{ margin-top: auto; display: flex; align-items: flex-end; gap: 8px; height: 150px; border-bottom: 2px solid #161616; padding-bottom: 8px; }}
.col {{ display: flex; flex-direction: column-reverse; gap: 5px; flex: 1; align-items: center; }}
.col i {{ width: 15px; height: 15px; border-radius: 50%; background: #161616; display: block; }}
.col.c i {{ background: #1536E8; }}
.r {{ background: #1536E8; color: #fff; padding: 54px 40px; display: flex; flex-direction: column; justify-content: space-between; }}
.r h2 {{ font-size: 54px; font-weight: 300; letter-spacing: -.045em; line-height: 1.18; }}
.r p {{ font-size: 22px; color: rgba(255,255,255,.75); line-height: 1.5; }}
</style>
<div class="l"><div class="b"><span></span>AI PM Archive</div>
<div class="n">{total}</div>
<div class="s">결과물 {len(works)} · 노트 {len(notes)} · 용어 {len(terms)}</div>
<div class="chart">{''.join(cols)}</div></div>
<div class="r"><h2>AI 프로덕트 매니저 학습 기록</h2><p>만든 결과물, 쓴 노트, 배운 용어를 날짜별로 쌓아 둡니다.</p></div>
"""

with tempfile.TemporaryDirectory() as tmp:
    f = Path(tmp) / "og.html"
    f.write_text(page, encoding="utf-8")
    out = ROOT / "assets" / "og.png"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-sandbox",
                    "--force-device-scale-factor=1", "--window-size=1200,630", "--virtual-time-budget=8000",
                    f"--screenshot={out}", f.as_uri()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
    print(out, out.stat().st_size, "bytes")
