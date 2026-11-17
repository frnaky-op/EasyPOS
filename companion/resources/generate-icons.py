"""Generate native launcher icons from the EasyPOS artwork (requires Pillow)."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Image.open(ROOT / "resources" / "icon.png").convert("RGBA")
RES = ROOT / "android" / "app" / "src" / "main" / "res"
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def resized(size):
    return SOURCE.resize((size, size), Image.Resampling.LANCZOS)


for density, size in SIZES.items():
    destination = RES / f"mipmap-{density}"
    resized(size).save(destination / "ic_launcher.png")

    round_icon = resized(size)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    round_icon.putalpha(mask)
    round_icon.save(destination / "ic_launcher_round.png")

    # Android adaptive icons use a 108dp canvas with a 66dp safe zone.
    foreground_size = round(size * 108 / 48)
    artwork_size = round(foreground_size * 0.66)
    foreground = Image.new("RGBA", (foreground_size, foreground_size), (0, 0, 0, 0))
    artwork = SOURCE.resize((artwork_size, artwork_size), Image.Resampling.LANCZOS)
    offset = (foreground_size - artwork_size) // 2
    foreground.alpha_composite(artwork, (offset, offset))
    foreground.save(destination / "ic_launcher_foreground.png")

SOURCE.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS).save(
    ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png"
)


def splash(size):
    canvas = Image.new("RGB", size, "white")
    logo_size = round(min(size) * 0.35)
    logo = SOURCE.convert("RGB").resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    canvas.paste(logo, ((size[0] - logo_size) // 2, (size[1] - logo_size) // 2))
    return canvas


for destination in RES.glob("drawable*/splash.png"):
    size = Image.open(destination).size
    splash(size).save(destination)

ios_splash = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "Splash.imageset"
for destination in ios_splash.glob("splash*.png"):
    size = Image.open(destination).size
    splash(size).save(destination)
