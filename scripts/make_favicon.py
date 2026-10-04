"""Strip near-black background from logo1 and write favicon assets."""
from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parents[1] / "logo1.png"
OUT_DIR = Path(__file__).resolve().parents[1] / "assets"
THRESH = 28


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r < THRESH and g < THRESH and b < THRESH:
                px[x, y] = (r, g, b, 0)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    emblem = OUT_DIR / "logo-emblem.png"
    im.save(emblem, optimize=True)
    im.save(OUT_DIR / "favicon.png", optimize=True)
    im.resize((32, 32), Image.Resampling.LANCZOS).save(
        OUT_DIR / "favicon-32.png", optimize=True
    )
    touch = im.copy()
    touch.thumbnail((180, 180), Image.Resampling.LANCZOS)
    touch.save(OUT_DIR / "apple-touch-icon.png", optimize=True)
    im.resize((32, 32), Image.Resampling.LANCZOS).save(
        OUT_DIR / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32)],
    )
    print("wrote", emblem, OUT_DIR / "favicon.ico")


if __name__ == "__main__":
    main()
