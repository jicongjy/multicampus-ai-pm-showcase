#!/usr/bin/env python3
"""링크 모음의 아이콘(파비콘)을 내려받아 assets/links/에 저장하고 data/links.json에 icon 경로를 적는다.

사용: python3 tools/fetch_link_icons.py
이미 icon이 있고 파일도 있는 항목은 건너뛴다. 새 링크를 추가한 뒤 실행하면 된다.
"""
import json, re, sys, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINKS = ROOT / "data" / "links.json"
OUT = ROOT / "assets" / "links"
UA = {"User-Agent": "Mozilla/5.0"}


def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as r:
        data = r.read()
        if data[:2] == b"\x1f\x8b":
            import gzip
            data = gzip.decompress(data)
        return (data, r.headers.get("Content-Type", "")) if binary else data.decode("utf-8", "ignore")


def candidates(page):
    html = get(page)
    found = []
    for tag in re.findall(r"<link[^>]+>", html, re.I):
        rel = re.search(r'rel="([^"]*)"', tag, re.I)
        href = re.search(r'href="([^"]*)"', tag, re.I)
        if not rel or not href or "icon" not in rel.group(1).lower():
            continue
        if re.search(r"media=", tag, re.I):
            continue
        size = re.search(r'sizes="(\d+)x', tag)
        w = int(size.group(1)) if size else (180 if "apple" in rel.group(1).lower() else 32)
        found.append((w, urllib.parse.urljoin(page, href.group(1))))
    found.sort(key=lambda x: -x[0])
    urls = [u for _, u in found]
    parts = urllib.parse.urlparse(page)
    urls.append(f"{parts.scheme}://{parts.netloc}/favicon.ico")
    urls.append("https://www.google.com/s2/favicons?domain=" + parts.netloc + "&sz=128")
    return urls


def ext_of(url, ctype, data=b""):
    if data[:8] == b"\x89PNG\r\n\x1a\n": return "png"
    if data[:4] == b"\x00\x00\x01\x00": return "ico"
    if data[:3] == b"\xff\xd8\xff": return "jpg"
    if data[:5] == b"<?xml" or data[:4] == b"<svg": return "svg"
    ctype = ctype.lower()
    if "svg" in ctype or url.endswith(".svg"): return "svg"
    if "png" in ctype or url.endswith(".png"): return "png"
    if "icon" in ctype or url.endswith(".ico"): return "ico"
    if "jpeg" in ctype or "jpg" in ctype: return "jpg"
    return None


def main():
    d = json.loads(LINKS.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for l in d["links"]:
        if l.get("icon") and (ROOT / l["icon"]).exists():
            continue
        saved = None
        try:
            urls = candidates(l["url"])
        except Exception as e:
            print("!", l["id"], "페이지를 열지 못함", e)
            urls = []
        for u in urls:
            try:
                data, ctype = get(u, True)
                ext = ext_of(u, ctype, data)
                if not ext or len(data) < 80 or len(data) > 400_000:
                    continue
                path = OUT / f"{l['id']}.{ext}"
                path.write_bytes(data)
                saved = f"assets/links/{path.name}"
                print("ok", l["id"], u)
                break
            except Exception:
                continue
        if saved:
            l["icon"] = saved
        else:
            print("!", l["id"], "아이콘을 찾지 못함")
    LINKS.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
