"""Generate the share card and app icons in web/public from the logo in web/public/favicon.svg.

The PNGs are committed because crawlers and chat apps fetch them directly; this script is
their only source. Re-run it after changing the logo, the brand color or the tagline:

    python3 scripts/brand/make_social_images.py

Needs Pillow and the repo's node_modules (for the Host Grotesk / Instrument Sans fonts).
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "web" / "public"
FONTS = ROOT / "node_modules" / "@fontsource-variable"

BRAND = "#501A93"        # --color-brand (light)
BRAND_LIGHT = "#D6AEF9"  # --color-brand (dark)
INK = "#16191F"
INK_2 = "#454C58"
PAPER = "#FFFFFF"

TAGLINE = "UX research platform"
SUBLINE = "Prototype tests, card sorting, tree testing, surveys\nand shareable reports, self-hosted."

SS = 4  # supersampling factor for smooth edges


def logo_subpaths() -> tuple[list[list[tuple[float, float]]], tuple[float, float, float, float]]:
    """Flatten the favicon path (M/L/C/H/V/Z, absolute) into polygons. Returns (subpaths, viewBox)."""
    svg = (PUBLIC / "favicon.svg").read_text()
    vb = tuple(float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split())
    d = re.search(r'<path[^>]* d="([^"]+)"', svg).group(1)
    tokens = re.findall(r"[MLCHVZ]|-?\d*\.?\d+", d)
    subpaths, cur, i, x, y, cmd = [], [], 0, 0.0, 0.0, None
    while i < len(tokens):
        t = tokens[i]
        if t in "MLCHVZ":
            cmd = t
            i += 1
            if cmd == "Z":
                subpaths.append(cur)
                cur = []
            continue
        n = lambda k: float(tokens[i + k])  # noqa: E731
        if cmd == "M":
            x, y = n(0), n(1)
            cur = [(x, y)]
            i += 2
            cmd = "L"  # implicit lineto after moveto (not used by this logo, but harmless)
        elif cmd == "L":
            x, y = n(0), n(1)
            cur.append((x, y))
            i += 2
        elif cmd == "H":
            x = n(0)
            cur.append((x, y))
            i += 1
        elif cmd == "V":
            y = n(0)
            cur.append((x, y))
            i += 1
        elif cmd == "C":
            x1, y1, x2, y2, x3, y3 = (n(k) for k in range(6))
            for s in range(1, 25):
                u = s / 24
                a, b, c, e = (1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u**2, u**3
                cur.append((a * x + b * x1 + c * x2 + e * x3, a * y + b * y1 + c * y2 + e * y3))
            x, y = x3, y3
            i += 6
        else:
            sys.exit(f"Unsupported path command {cmd!r} in favicon.svg")
    if cur:
        subpaths.append(cur)
    return subpaths, vb


def draw_logo(img: Image.Image, box: tuple[int, int, int], color: str, hole: str) -> None:
    """Draw the logo at (left, top) with the given height. The second subpath is the hole."""
    left, top, height = box
    subpaths, (_, _, vw, vh) = logo_subpaths()
    k = height / vh
    draw = ImageDraw.Draw(img)
    for idx, sp in enumerate(subpaths):
        pts = [(left + px * k, top + py * k) for px, py in sp]
        draw.polygon(pts, fill=color if idx == 0 else hole)


def font(family: str, size: int, weight: int) -> ImageFont.FreeTypeFont:
    path = FONTS / family / "files" / f"{family}-latin-wght-normal.woff2"
    f = ImageFont.truetype(str(path), size)
    f.set_variation_by_axes([weight])
    return f


def share_card() -> None:
    w, h = 1200, 630
    img = Image.new("RGB", (w * SS, h * SS), PAPER)
    d = ImageDraw.Draw(img)
    # Brand band on the right with the logo knocked out in the light brand color.
    band = 420
    d.rectangle([(w - band) * SS, 0, w * SS, h * SS], fill=BRAND)
    logo_h = 300
    _, (_, _, vw, vh) = logo_subpaths()
    logo_w = vw * logo_h / vh
    draw_logo(img, (int((w - band / 2 - logo_w / 2) * SS), int((h - logo_h) / 2 * SS), logo_h * SS), BRAND_LIGHT, BRAND)
    # Text block on the left.
    x = 72 * SS
    d.text((x, 150 * SS), "redekorate", font=font("host-grotesk", 96 * SS, 700), fill=BRAND)
    d.text((x, 270 * SS), TAGLINE, font=font("host-grotesk", 48 * SS, 600), fill=INK)
    d.multiline_text((x, 360 * SS), SUBLINE, font=font("instrument-sans", 28 * SS, 450), fill=INK_2, spacing=12 * SS)
    img.resize((w, h), Image.LANCZOS).save(PUBLIC / "og-image.png", optimize=True)


def icon(size: int, name: str, padding: float) -> None:
    img = Image.new("RGB", (size * SS, size * SS), BRAND)
    logo_h = size * (1 - 2 * padding)
    _, (_, _, vw, vh) = logo_subpaths()
    logo_w = vw * logo_h / vh
    draw_logo(img, (int((size - logo_w) / 2 * SS), int((size - logo_h) / 2 * SS), int(logo_h * SS)), PAPER, BRAND)
    img.resize((size, size), Image.LANCZOS).save(PUBLIC / name, optimize=True)


if __name__ == "__main__":
    share_card()
    icon(180, "apple-touch-icon.png", 0.2)
    icon(192, "icon-192.png", 0.2)
    icon(512, "icon-512.png", 0.25)  # extra padding so it survives the maskable safe zone
    print("Wrote og-image.png, apple-touch-icon.png, icon-192.png, icon-512.png to web/public")
