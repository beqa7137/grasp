"""Draws the app icon and splash screens into the Capacitor native projects.

Every image is rendered at the exact size of the template file it replaces, so the Xcode and
Gradle projects need no other changes. Requires Pillow: `python3 -m pip install pillow`, then
`python3 apps/app/scripts/generate-native-assets.py` from the repo root.
"""

from pathlib import Path

from PIL import Image, ImageDraw

APP = Path(__file__).resolve().parent.parent
BACKGROUND = (11, 13, 18)
EDGE = (139, 147, 168)
NODES = [((0.2, 0.26), (157, 140, 255)), ((0.8, 0.26), (76, 201, 240)), ((0.5, 0.78), (61, 220, 151))]
SUPERSAMPLE = 4


def glyph(draw: ImageDraw.ImageDraw, box: tuple[float, float, float]) -> None:
    """Three connected nodes inside a square box (left, top, size), in pixels of the supersampled canvas."""
    left, top, size = box
    point = lambda p: (left + p[0] * size, top + p[1] * size)
    radius = 0.13 * size
    for i, (a, _) in enumerate(NODES):
        b = NODES[(i + 1) % len(NODES)][0]
        draw.line([point(a), point(b)], fill=EDGE, width=max(1, round(0.055 * size)))
    for center, color in NODES:
        x, y = point(center)
        ring = radius + 0.035 * size
        draw.ellipse([x - ring, y - ring, x + ring, y + ring], fill=BACKGROUND)
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color)


def render(width: int, height: int, glyph_share: float, shape: str = "full", transparent: bool = False) -> Image.Image:
    w, h = width * SUPERSAMPLE, height * SUPERSAMPLE
    image = Image.new("RGBA", (w, h), (0, 0, 0, 0) if transparent else BACKGROUND + (255,))
    draw = ImageDraw.Draw(image)
    if shape == "rounded":
        image.paste((0, 0, 0, 0), [0, 0, w, h])
        draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=0.22 * w, fill=BACKGROUND)
    elif shape == "circle":
        image.paste((0, 0, 0, 0), [0, 0, w, h])
        draw.ellipse([0, 0, w - 1, h - 1], fill=BACKGROUND)
    size = glyph_share * min(w, h)
    glyph(draw, ((w - size) / 2, (h - size) / 2, size))
    return image.resize((width, height), Image.LANCZOS)


def replace(path: Path, **options) -> None:
    with Image.open(path) as current:
        width, height, mode = current.width, current.height, current.mode
    image = render(width, height, **options)
    (image if mode == "RGBA" else image.convert("RGB")).save(path)
    print(f"{path.relative_to(APP)} ({width}×{height})")


def main() -> None:
    res = APP / "android/app/src/main/res"
    for icon in sorted(res.glob("mipmap-*/ic_launcher.png")):
        replace(icon, glyph_share=0.6, shape="rounded")
    for icon in sorted(res.glob("mipmap-*/ic_launcher_round.png")):
        replace(icon, glyph_share=0.56, shape="circle")
    # Adaptive icons: the launcher masks a 108dp layer to at most its central 72dp.
    for icon in sorted(res.glob("mipmap-*/ic_launcher_foreground.png")):
        replace(icon, glyph_share=0.46, transparent=True)
    for splash in sorted(res.glob("drawable*/splash.png")):
        replace(splash, glyph_share=0.22)

    assets = APP / "ios/App/App/Assets.xcassets"
    replace(assets / "AppIcon.appiconset/AppIcon-512@2x.png", glyph_share=0.62)
    for splash in sorted((assets / "Splash.imageset").glob("*.png")):
        replace(splash, glyph_share=0.16)

    background = res / "values/ic_launcher_background.xml"
    background.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '    <color name="ic_launcher_background">#0B0D12</color>\n</resources>\n'
    )


if __name__ == "__main__":
    main()
