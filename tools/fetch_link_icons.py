#!/usr/bin/env python3
"""링크 모음의 아이콘(파비콘)을 내려받아 assets/links/에 저장하고 data/links.json에 icon 경로를 적는다.

사용: python3 tools/fetch_link_icons.py
이미 icon이 있고 파일도 있는 항목은 건너뛴다. 새 링크를 추가한 뒤 실행하면 된다.
"""
import ipaddress, json, re, socket, sys, urllib.request, urllib.parse, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINKS = ROOT / "data" / "links.json"
OUT = ROOT / "assets" / "links"
UA = {"User-Agent": "Mozilla/5.0"}


MAX_BYTES = 400_000


def check_url(url):
    """http, https만 허용하고, 내 컴퓨터나 사내망 주소는 막는다."""
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ValueError("허용하지 않는 주소: " + url)
    for info in socket.getaddrinfo(p.hostname, None):
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise ValueError("내부 주소는 가져오지 않음: " + url)


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = urllib.request.build_opener(urllib.request.HTTPHandler, urllib.request.HTTPSHandler, SafeRedirect)


def get(url, binary=False):
    check_url(url)
    req = urllib.request.Request(url, headers=UA)
    with OPENER.open(req, timeout=15) as r:
        data = r.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("파일이 너무 큼")
        if data[:2] == b"\x1f\x8b":
            dec = zlib.decompressobj(31)
            data = dec.decompress(data, MAX_BYTES + 1)
            if len(data) > MAX_BYTES or dec.unconsumed_tail:
                raise ValueError("압축을 풀면 너무 큼")
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


def ext_of(data):
    """PNG, ICO, JPEG만 받는다. 파일 첫 바이트로만 판단한다(SVG는 스크립트가 들어갈 수 있어 받지 않음)."""
    if data[:8] == b"\x89PNG\r\n\x1a\n": return "png"
    if data[:4] == b"\x00\x00\x01\x00": return "ico"
    if data[:3] == b"\xff\xd8\xff": return "jpg"
    return None


def main():
    d = json.loads(LINKS.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for l in d["links"]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", str(l.get("id", ""))):
            print("!", l.get("id"), "id는 영문, 숫자, - , _ 만 쓸 수 있어 건너뜀")
            continue
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
                ext = ext_of(data)
                if not ext or len(data) < 80:
                    continue
                path = OUT / f"{l['id']}.{ext}"
                if OUT.resolve() not in path.resolve().parents:
                    continue
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
