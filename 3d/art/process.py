"""Codex が生成した art/*.png から、アプリで使うサイズ・形式の画像を作る。

    python3 art/process.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art"
ICONS = ROOT / "public" / "icons"
IMG = ROOT / "public" / "img"
SKY = ROOT / "src" / "img"  # CSS から参照するので src 側に置く
ICONS.mkdir(parents=True, exist_ok=True)
IMG.mkdir(parents=True, exist_ok=True)
SKY.mkdir(parents=True, exist_ok=True)

icon = Image.open(ART / "icon.png").convert("RGB")
bg = icon.getpixel((8, 8))  # 背景色 (左上の空の色)

for size in (512, 192):
    icon.resize((size, size), Image.LANCZOS).save(ICONS / f"icon-{size}.png", optimize=True)
icon.resize((180, 180), Image.LANCZOS).save(ICONS / "apple-touch-icon.png", optimize=True)
icon.resize((64, 64), Image.LANCZOS).save(ICONS / "favicon-64.png", optimize=True)

# マスカブル: 円形に切り抜かれても欠けないよう 78% に縮めて余白を足す
canvas = Image.new("RGB", (512, 512), bg)
inner = icon.resize((400, 400), Image.LANCZOS)
canvas.paste(inner, (56, 56))
canvas.save(ICONS / "icon-maskable-512.png", optimize=True)

for name in ("sky_day", "sky_night"):
    Image.open(ART / f"{name}.png").convert("RGB").resize((768, 1152), Image.LANCZOS).save(
        SKY / f"{name}.jpg", quality=82, optimize=True, progressive=True)

# 画面に出すカニのイラスト (透過 WebP、表示 150px の 2 倍)
for name in ("crab_happy", "crab_dizzy"):
    im = Image.open(ART / f"{name}.png").convert("RGBA")
    im = im.crop(im.getbbox())
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq.resize((300, 300), Image.LANCZOS).save(SKY / f"{name}.webp", quality=88, method=6)

Image.open(ART / "ogp.png").convert("RGB").resize((1200, 800), Image.LANCZOS).save(
    IMG / "ogp.jpg", quality=82, optimize=True, progressive=True)

print("bg", "#%02x%02x%02x" % bg)
for p in sorted([*ICONS.iterdir(), *IMG.iterdir(), *SKY.iterdir()]):
    print(f"{p.relative_to(ROOT)}  {p.stat().st_size // 1024} KB")
