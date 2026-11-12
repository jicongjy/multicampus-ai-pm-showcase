#!/usr/bin/env python3
"""비공개 노트 저장소에서 '공개: 예'로 표시한 노트만 골라 사이트용으로 정리해 내보낸다.

사용법
  python3 tools/export_notes.py <노트 저장소 경로> [--dry-run]

동작
  1. notes/ 아래 마크다운 중 앞부분 12줄 안에 '공개: 예' 줄이 있는 노트만 고른다.
  2. '내 실습', '내가 만든 것', '배운 점', '한계' 같은 내 작업과 생각 구역만 남긴다. 수업 내용을 옮긴 구역은 뺀다.
  3. 회고, 출처, 메모, 과제, 링크, 강사, 교안, 슬랙 구역과 그 단어가 들어간 줄도 뺀다. 빠진 것은 화면에 모두 보여 주니 확인한다.
  4. 이메일, 전화번호, 키, 앱스 스크립트 주소 패턴이 남아 있으면 그 노트는 내보내지 않는다.
  5. notes/아이디.html 조각과 data/notes.json을 만든다.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLAG = re.compile(r"^\s*공개\s*[:：]\s*예\s*$")
DROP_HEADING = re.compile(r"교안|슬랙|회고|출처|메모|과제|링크|다음에|강사|피드백|정리자|참고")
KEEP_HEADING = re.compile(r"내 실습|직접 실습|직접 해|별도 실습|실습 기록|실습 결과|내가|제가|만든|산출물|배운 점|느낀 점|해 보고 싶|겪은 문제|개선|결정")
DROP_LINE = re.compile(r"교안|슬랙|강사|셀렉트웨이|비공개|미기입|내부|학습 저장소|multicampus-ai-product-manager")
SENSITIVE = [
    ("이메일", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("전화번호", re.compile(r"01[016789][- ]?\d{3,4}[- ]?\d{4}")),
    ("API 키", re.compile(r"AIza[0-9A-Za-z_\-]{20,}|sk-[A-Za-z0-9_\-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("앱스 스크립트 주소", re.compile(r"script\.google\.com/macros")),
]
DATE = re.compile(r"(20\d{2})-(\d{2})-(\d{2})")
YYMMDD = re.compile(r"\b(\d{2})(\d{2})(\d{2})\b")


def heading(line):
    m = re.match(r"^(#{1,6})\s+(.*)$", line)
    return (len(m.group(1)), m.group(2).strip()) if m else None


def clean(lines, report):
    """내가 만든 것과 내 생각 구역만 남긴다. 수업 내용을 옮긴 구역은 저작권 때문에 뺀다."""
    pre, secs, fence = [], [], False
    cur = None
    for line in lines:
        if line.strip().startswith("```"):
            fence = not fence
        h = None if fence else heading(line)
        if h:
            cur = {"level": h[0], "text": h[1], "lines": [line]}
            secs.append(cur)
        elif cur is None:
            pre.append(line)
        else:
            cur["lines"].append(line)

    out, stack = list(pre), []
    for sec in secs:
        while stack and stack[-1]["level"] >= sec["level"]:
            stack.pop()
        stack.append(sec)
        path = [x["text"] for x in stack]
        if any(DROP_HEADING.search(t) for t in path):
            report.append("구역 제거: " + sec["text"])
            continue
        if not any(KEEP_HEADING.search(t) for t in path):
            report.append("구역 제외(수업 내용): " + sec["text"])
            continue
        report.append("구역 유지: " + sec["text"])
        out.extend(sec["lines"])

    kept = []
    for line in out:
        if DROP_LINE.search(line):
            report.append("줄 제거: " + line.strip()[:70])
            continue
        kept.append(line)
    return drop_empty_headings(kept)


def drop_empty_headings(lines):
    """내용이 모두 빠져 제목만 남은 구역은 제목도 뺀다."""
    keep = []
    for i, line in enumerate(lines):
        h = heading(line)
        if h:
            nxt = next((l for l in lines[i + 1:] if l.strip()), None)
            nh = heading(nxt) if nxt else None
            if nxt is None or (nh and nh[0] <= h[0]):
                continue
        keep.append(line)
    return keep


def inline(text):
    t = html.escape(text, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![*\w])\*([^*\s][^*]*)\*(?![*\w])", r"<em>\1</em>", t)

    def link(m):
        label, url = m.group(1), html.unescape(m.group(2))
        if re.match(r"^https?://", url):
            return '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (html.escape(url, quote=True), label)
        return label

    t = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, t)
    return t


def render(lines):
    out, i = [], 0
    para, ul, ol = [], [], []

    def flush():
        nonlocal para, ul, ol
        if para:
            out.append("<p>%s</p>" % inline(" ".join(para)))
            para = []
        if ul:
            out.append("<ul>%s</ul>" % "".join("<li>%s</li>" % inline(x) for x in ul))
            ul = []
        if ol:
            out.append("<ol>%s</ol>" % "".join("<li>%s</li>" % inline(x) for x in ol))
            ol = []

    while i < len(lines):
        line = lines[i].rstrip()
        s = line.strip()
        if s.startswith("```"):
            flush()
            i += 1
            code = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(code), quote=False))
            i += 1
            continue
        if not s:
            flush()
            i += 1
            continue
        h = heading(line)
        if h:
            flush()
            level = min(max(h[0], 2), 4)
            out.append("<h%d>%s</h%d>" % (level, inline(h[1]), level))
            i += 1
            continue
        if re.match(r"^[-*_]{3,}$", s):
            flush()
            out.append("<hr>")
            i += 1
            continue
        if s.startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|?\s*$", lines[i + 1]) and "-" in lines[i + 1]:
            flush()
            cells = lambda r: [c.strip() for c in r.strip().strip("|").split("|")]
            head = cells(line)
            i += 2
            body = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                body.append(cells(lines[i]))
                i += 1
            t = "<div class=\"tbl\"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>" % (
                "".join("<th>%s</th>" % inline(c) for c in head),
                "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r) for r in body),
            )
            out.append(t)
            continue
        if s.startswith(">"):
            flush()
            q = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                q.append(lines[i].strip().lstrip(">").strip())
                i += 1
            out.append("<blockquote>%s</blockquote>" % inline(" ".join(x for x in q if x)))
            continue
        m = re.match(r"^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$", line)
        if m:
            if para or ol:
                flush()
            ul.append(m.group(1))
            i += 1
            continue
        m = re.match(r"^\s*\d+[.)]\s+(.*)$", line)
        if m:
            if para or ul:
                flush()
            ol.append(m.group(1))
            i += 1
            continue
        if re.match(r"^\s*!\[", line):
            i += 1
            continue
        if ul or ol:
            flush()
        para.append(s)
        i += 1
    flush()
    return "\n".join(out)


def meta(path, lines):
    head = "\n".join(lines[:12])
    m = DATE.search(head)
    if m:
        date = "-".join(m.groups())
    else:
        m = YYMMDD.search(lines[0] if lines else "")
        date = "20%s-%s-%s" % m.groups() if m else ""
    wk = path.parent.name if path.parent.name.startswith("week-") else ""
    title = heading(lines[0])[1] if lines and heading(lines[0]) else path.stem
    return date, wk, title


def summary_of(lines):
    for idx, line in enumerate(lines):
        h = heading(line)
        if h and "요약" in h[1]:
            buf = []
            for nxt in lines[idx + 1:]:
                if heading(nxt):
                    break
                if nxt.strip():
                    buf.append(nxt.strip())
                elif buf:
                    break
            text = re.sub(r"[*`]", "", " ".join(buf))
            return text if len(text) <= 140 else text[:138].rstrip() + "…"
    return ""


def first_text(lines):
    """요약 구역이 없을 때 남은 본문의 첫 문장을 요약으로 쓴다."""
    idx = next((i for i, l in enumerate(lines) if heading(l)), 0)
    for line in lines[idx:]:
        t = line.strip()
        if not t or heading(line) or t.startswith(("```", "|", ">", "---")):
            continue
        t = re.sub(r"^[-*+]\s+|^\d+[.)]\s+", "", t)
        t = re.sub(r"[*`]|\[([^\]]+)\]\([^)]*\)", lambda m: m.group(1) or "", t).strip()
        if len(t) >= 12 and "http" not in t and not re.match(r"^[^:：]{1,14}[:：]\s*\S{0,20}$", t):
            return t if len(t) <= 90 else t[:88].rstrip() + "…"
    return ""


def headings_of(lines):
    out = []
    for line in lines:
        h = heading(line)
        if h and h[0] in (2, 3):
            t = re.sub(r"[*`]", "", re.sub(r"^\d+[.)]\s*", "", h[1])).strip()
            if t and t not in out:
                out.append(t)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        print(__doc__)
        return 1
    repo = Path(args[0]).expanduser().resolve()
    files = sorted((repo / "notes").rglob("*.md"))
    entries, blocked = [], 0
    for path in files:
        lines = path.read_text(encoding="utf-8").splitlines()
        if not any(FLAG.match(l) for l in lines[:12]):
            continue
        lines = [l for l in lines if not FLAG.match(l)]
        date, wk, title = meta(path, lines)
        report = []
        body_lines = clean(lines[1:] if heading(lines[0]) else lines, report)
        text = "\n".join(body_lines)
        hits = [(n, p.search(text) or p.search(title)) for n, p in SENSITIVE]
        hits = [n for n, m in hits if m]
        rel = path.relative_to(repo)
        print("\n== %s" % rel)
        for r in report:
            print("  - " + r)
        if hits:
            blocked += 1
            print("  ! 내보내지 않음. 남아 있는 민감 패턴: " + ", ".join(hits))
            continue
        nid = "n-%s-%s" % (wk.replace("week-0", "w") if wk else "x", path.stem)
        summary = summary_of(body_lines) or first_text(body_lines)
        heads = headings_of(body_lines)
        chars = len(re.sub(r"\s+", "", text))
        entries.append({
            "id": nid, "title": re.sub(r"^\d{6}\s+", "", title), "week": wk, "date": date,
            "summary": summary, "html": "notes/%s.html" % nid,
            "headings": heads[:5], "sections": len(heads), "mins": max(1, round(chars / 500)),
        })
        if not dry:
            out = ROOT / "notes" / ("%s.html" % nid)
            out.parent.mkdir(exist_ok=True)
            out.write_text(render(body_lines) + "\n", encoding="utf-8")
        print("  + 내보냄: %s" % nid)
    entries.sort(key=lambda e: (e["date"], e["id"]), reverse=True)
    if not dry:
        (ROOT / "data" / "notes.json").write_text(json.dumps({"notes": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        keep = {e["id"] + ".html" for e in entries}
        for old in (ROOT / "notes").glob("n-*.html"):
            if old.name not in keep:
                old.unlink()
    print("\n공개 표시 %d개 중 %d개 내보냄, %d개 막힘%s" % (len(entries) + blocked, len(entries), blocked, " (미리보기)" if dry else ""))
    return 1 if blocked else 0


if __name__ == "__main__":
    sys.exit(main())
