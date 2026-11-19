"""画面で使う文字だけを含むフォントを Google Fonts から取ってくる。

index.html と src/*.js に書かれた文字 + 英数字記号を集め、
Google Fonts の text= 指定で必要な文字だけのサブセットを src/fonts/ に保存する。
文言を変えたら npm run fonts を実行し直すこと。

フォントはどちらも SIL Open Font License。
"""
import re
import string
import subprocess
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

FONTS = [
    ("Mochiy Pop One", 400, "mochiy-pop-one.woff2"),
    ("Zen Maru Gothic", 500, "zen-maru-gothic-500.woff2"),
    ("Zen Maru Gothic", 900, "zen-maru-gothic-900.woff2"),
]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

chars = set(string.ascii_letters + string.digits + string.punctuation + " ")
chars |= set("ー〜…・「」『』！？（）　、。＋★☆◀▶←→↑")
for path in [ROOT / "index.html", *sorted((ROOT / "src").glob("*.js"))]:
    text = path.read_text(encoding="utf-8")
    chars |= {c for c in text if ord(c) > 0x2000}
text = "".join(sorted(chars))
print(f"{len(text)} chars")

def fetch(url):
    return subprocess.run(["curl", "-sSfL", "-m", "60", "-A", UA, url], check=True, capture_output=True).stdout


for family, weight, filename in FONTS:
    q = urllib.parse.urlencode({"family": f"{family}:wght@{weight}", "text": text, "display": "swap"})
    css = fetch(f"https://fonts.googleapis.com/css2?{q}").decode()
    url = re.search(r"url\((https://[^)]+)\)", css).group(1)
    data = fetch(url)
    (OUT / filename).write_bytes(data)
    print(f"{filename}: {len(data) // 1024} KB")
