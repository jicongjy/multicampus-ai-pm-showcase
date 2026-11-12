#!/usr/bin/env python3
"""Generate thumbnails for every work in data/works.json (headless Chrome, sips)."""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = os.path.join(ROOT, "assets", "thumbs")
os.makedirs(OUT, exist_ok=True)

works = json.load(open(os.path.join(ROOT, "data", "works.json"), encoding="utf-8"))["works"]
tmp = tempfile.mkdtemp()


def shoot(url, dest_png):
    subprocess.run([
        CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-sandbox",
        "--force-device-scale-factor=1", "--window-size=1280,800",
        "--virtual-time-budget=6000", f"--screenshot={dest_png}", url,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)


def to_jpg(src, dest):
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "78", "-Z", "900", src, "--out", dest],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


only = set(sys.argv[1:])
for w in works:
    wid, f = w["id"], w.get("file", "")
    if only and wid not in only:
        continue
    png = os.path.join(tmp, wid + ".png")
    dest = os.path.join(OUT, wid + ".jpg")
    try:
        if f.endswith(".html"):
            shoot("file://" + os.path.join(ROOT, f).replace(" ", "%20"), png)
        elif f.endswith(".pdf"):
            subprocess.run(["sips", "-s", "format", "png", os.path.join(ROOT, f), "--out", png],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        elif f.endswith(".png"):
            png = os.path.join(ROOT, f)
        elif w.get("links"):
            shoot(w["links"][0]["url"], png)
        else:
            print("skip", wid); continue
        if not os.path.exists(png):
            print("FAIL", wid); continue
        to_jpg(png, dest)
        print("ok", wid, os.path.getsize(dest) // 1024, "KB")
    except Exception as e:
        print("FAIL", wid, e)
