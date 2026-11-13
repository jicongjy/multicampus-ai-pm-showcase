#!/usr/bin/env python3
"""파비콘 세트를 만든다: favicon.svg(밝음/어둠 자동), favicon.ico, favicon-dark.ico, apple-touch-icon.png, icon-512.png.
배경 없이 점이 쌓인 모양. 애플 아이콘만 흰 바탕(iOS가 투명을 지원하지 않음). 사용: python3 tools/make_icons.py (Pillow 필요)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
COLS = [1, 2, 3, 4]          # 열마다 쌓이는 점 개수
LAST_BLUE = "#161616"        # 모두 검정


def svg():
    """배경 없이 점만. 밝은 화면에서는 검정, 어두운 화면에서는 흰색으로 바뀐다."""
    dots = []
    for i, n in enumerate(COLS):
        for k in range(n):
            dots.append(f'<circle cx="{14 + i * 12}" cy="{50 - k * 12}" r="5"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            '<style>circle{fill:#161616}@media (prefers-color-scheme:dark){circle{fill:#fff}}</style>'
            + "".join(dots) + "</svg>\n")


def png(size, color="#161616"):
    """투명 배경에 점만 그린다."""
    k = 8  # 부드럽게 보이도록 크게 그린 뒤 줄인다
    S = size * k
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = S / 64
    for i, n in enumerate(COLS):
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
    png(256, "#FFFFFF").save(ROOT / "favicon-dark.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    flat_png(180).save(ROOT / "apple-touch-icon.png")
    png(512).save(ROOT / "icon-512.png")
    print("favicon.svg, favicon.ico, favicon-dark.ico, apple-touch-icon.png, icon-512.png")


if __name__ == "__main__":
    main()
