"""Export Windows and browser icons from the approved EasyPOS logo image.

Run with: python scripts/build-app-icons.py
Requires Pillow.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "images"
SOURCE = IMAGES / "easypos-logo-concept.png"

logo = Image.open(SOURCE).convert("RGBA")
opaque = logo.getchannel("A").point(lambda alpha: 255 if alpha > 8 else 0)
bounds = opaque.getbbox()
if bounds is None:
    raise ValueError(f"No visible logo in {SOURCE}")
logo = logo.crop(bounds)

size = 1024
icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
ImageDraw.Draw(tile).rounded_rectangle((24, 24, size - 25, size - 25), radius=194, fill="white")
icon.alpha_composite(tile)

mark = ImageOps.contain(logo, (850, 850), Image.Resampling.LANCZOS)
icon.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))

icon.save(IMAGES / "icon.ico", format="ICO", sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
icon.resize((256, 256), Image.Resampling.LANCZOS).save(IMAGES / "favicon.png")
