"""Generates the Tauri bundle icons from the same mark as public/icon.svg."""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
MASTER = 1024
STOPS = [(0.0, (0x4A, 0xA8, 0xFF)), (0.45, (0x0A, 0x84, 0xFF)), (1.0, (0x5E, 0x5C, 0xE6))]


def gradient(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            for index in range(len(STOPS) - 1):
                start, first = STOPS[index]
                end, second = STOPS[index + 1]
                if start <= t <= end:
                    f = (t - start) / (end - start)
                    pixels[x, y] = tuple(round(first[c] + (second[c] - first[c]) * f) for c in range(3)) + (255,)
                    break
    return image


def sparkle(draw: ImageDraw.ImageDraw, cx: float, cy: float, reach: float, waist: float, fill):
    draw.polygon(
        [
            (cx, cy - reach),
            (cx + waist, cy - waist),
            (cx + reach, cy),
            (cx + waist, cy + waist),
            (cx, cy + reach),
            (cx - waist, cy + waist),
            (cx - reach, cy),
            (cx - waist, cy - waist),
        ],
        fill=fill,
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    base = gradient(MASTER)

    mask = Image.new("L", (MASTER, MASTER), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, MASTER - 1, MASTER - 1], radius=round(MASTER * 0.226), fill=255)
    icon = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    icon.paste(base, (0, 0), mask)

    draw = ImageDraw.Draw(icon)
    sparkle(draw, MASTER * 0.5, MASTER * 0.445, MASTER * 0.235, MASTER * 0.06, (255, 255, 255, 245))
    sparkle(draw, MASTER * 0.70, MASTER * 0.745, MASTER * 0.115, MASTER * 0.028, (255, 255, 255, 180))

    sizes = {"32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256, "icon.png": 512, "Square150x150Logo.png": 150}
    for name, size in sizes.items():
        icon.resize((size, size), Image.LANCZOS).save(OUT / name)

    icon.save(OUT / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    try:
        icon.save(OUT / "icon.icns", sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512)])
    except ValueError:
        pass


if __name__ == "__main__":
    main()
