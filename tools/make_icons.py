#!/usr/bin/env python3
"""파비콘 세트를 만든다: favicon.svg, favicon.ico, apple-touch-icon.png, icon-512.png.
흰 바탕에 검은 점이 쌓인 모양. 사용: python3 tools/make_icons.py (Pillow 필요)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
COLS = [1, 2, 3, 4]          # 열마다 쌓이는 점 개수
LAST_BLUE = "#161616"        # 모두 검정


def svg():
    dots = []
    for i, n in enumerate(COLS):
        for k in range(n):
            fill = LAST_BLUE if i == len(COLS) - 1 else "#161616"
            dots.append(f'<circle cx="{14 + i * 12}" cy="{50 - k * 12}" r="5" fill="{fill}"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            '<rect width="64" height="64" rx="14" fill="#fff"/>'
            + "".join(dots) + "</svg>\n")


def png(size):
    k = 8  # 부드럽게 보이도록 크게 그린 뒤 줄인다
    S = size * k
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = S / 64
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=14 * u, fill="#FFFFFF")
    for i, n in enumerate(COLS):
        color = LAST_BLUE if i == len(COLS) - 1 else "#161616"
        for j in range(n):
            cx, cy, r = (14 + i * 12) * u, (50 - j * 12) * u, 5 * u
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    return im.resize((size, size), Image.LANCZOS)


def flat_png(size):
    """애플 아이콘은 모서리를 직접 둥글리지 않고 정사각형 흰 바탕으로 만든다."""
    big = png(size * 2)
    bg = Image.new("RGB", big.size, "#FFFFFF")
    d = ImageDraw.Draw(bg)
    S = big.size[0]
    u = S / 64
    for i, n in enumerate(COLS):
        color = LAST_BLUE if i == len(COLS) - 1 else "#161616"
        for j in range(n):
            cx, cy, r = (14 + i * 12) * u, (50 - j * 12) * u, 5 * u
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    return bg.resize((size, size), Image.LANCZOS)


def main():
    (ROOT / "favicon.svg").write_text(svg(), encoding="utf-8")
    png(256).save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    flat_png(180).save(ROOT / "apple-touch-icon.png")
    png(512).save(ROOT / "icon-512.png")
    print("favicon.svg, favicon.ico, apple-touch-icon.png, icon-512.png")


if __name__ == "__main__":
    main()
