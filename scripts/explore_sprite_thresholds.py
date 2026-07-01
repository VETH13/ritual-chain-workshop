"""
Sprite Threshold Explorer
=========================
Generates multiple variants of mouse/cat/logo sprites with different threshold
parameters, then composites them into a single contact sheet PNG for easy
comparison. After eyeballing, edit the (PRESETS) lists below to keep the best
variant — re-run process_sprites.py / refine_sprites.py with the winning numbers.

Usage:
    python scripts/explore_sprite_thresholds.py

Output:
    /home/z/my-project/public/_explorer/mouse_variants.png
    /home/z/my-project/public/_explorer/cat_variants.png
    /home/z/my-project/public/_explorer/logo_variants.png
"""

from PIL import Image, ImageFilter, ImageDraw, ImageFont
import numpy as np
from scipy import ndimage
import os

PUBLIC = "/home/z/my-project/public"
OUT = os.path.join(PUBLIC, "_explorer")
os.makedirs(OUT, exist_ok=True)


# ---------- Reusable extraction functions ----------
def chroma_key_white(img, threshold=235, feather=1):
    img = img.convert("RGBA")
    arr = np.array(img).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    is_white = (r >= threshold) & (g >= threshold) & (b >= threshold)
    alpha = np.where(is_white, 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(radius=feather))
    out = img.copy()
    out.putalpha(alpha_img)
    return out


def chroma_key_color(img, target_rgb, tolerance=60):
    img = img.convert("RGBA")
    arr = np.array(img).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    tr, tg, tb = target_rgb
    dist = np.sqrt((r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2)
    mask = dist < tolerance
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(radius=1))
    out = img.copy()
    out.putalpha(alpha_img)
    return out


def extract_cat_strict(img, dark_threshold=80, close_iters=3, keep_pink=True):
    img = img.convert("RGBA")
    arr = np.array(img).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    brightness = (r + g + b) / 3
    is_dark = brightness < dark_threshold
    is_pink = (
        (r > 180) & (g > 100) & (g < 200) & (b < 200) & (b > 80)
    ) if keep_pink else np.zeros_like(brightness, dtype=bool)
    mask = (is_dark | is_pink).astype(np.uint8) * 255
    mask_bool = mask > 0
    # Close
    mask_bool = ndimage.binary_dilation(mask_bool, iterations=close_iters)
    mask_bool = ndimage.binary_erosion(mask_bool, iterations=close_iters)
    mask_bool = ndimage.binary_erosion(mask_bool, iterations=1)
    mask_bool = ndimage.binary_dilation(mask_bool, iterations=1)
    # Keep largest connected component
    labeled, num = ndimage.label(mask_bool)
    if num > 1:
        sizes = ndimage.sum(mask_bool, labeled, range(1, num + 1))
        largest = np.argmax(sizes) + 1
        mask_bool = labeled == largest
    alpha = (mask_bool.astype(np.uint8)) * 255
    alpha_img = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(radius=1.2))
    out = img.copy()
    out.putalpha(alpha_img)
    return out


def tight_crop_alpha(img, pad=4):
    img = img.convert("RGBA")
    bbox = img.split()[-1].getbbox()
    if bbox is None:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(img.width, r + pad); b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


# ---------- Contact sheet builder ----------
def make_contact_sheet(
    title: str,
    variants: list[tuple[str, Image.Image]],
    cell_size: int = 200,
    cols: int = 3,
    bg_color=(24, 28, 40),
    label_color=(255, 255, 255),
):
    """Stack labeled variant tiles in a grid."""
    rows = (len(variants) + cols - 1) // cols
    label_h = 28
    cell_w = cell_size
    cell_h = cell_size + label_h
    pad = 12
    title_h = 40
    sheet_w = cols * cell_w + (cols + 1) * pad
    sheet_h = title_h + rows * cell_h + (rows + 1) * pad
    sheet = Image.new("RGB", (sheet_w, sheet_h), bg_color)
    draw = ImageDraw.Draw(sheet)
    # Title
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18
        )
        font_small = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11
        )
    except Exception:
        font = ImageFont.load_default()
        font_small = ImageFont.load_default()
    draw.text((pad, 10), title, fill=label_color, font=font)
    # Tiles
    for i, (label, img) in enumerate(variants):
        r, c = i // cols, i % cols
        x = pad + c * (cell_w + pad)
        y = title_h + pad + r * (cell_h + pad)
        # Checkerboard bg
        cb = Image.new("RGBA", (cell_w, cell_size), (0, 0, 0, 0))
        cd = ImageDraw.Draw(cb)
        sq = 16
        for yy in range(0, cell_size, sq):
            for xx in range(0, cell_w, sq):
                if (xx // sq + yy // sq) % 2 == 0:
                    cd.rectangle([xx, yy, xx + sq, yy + sq], fill=(60, 70, 90, 255))
                else:
                    cd.rectangle([xx, yy, xx + sq, yy + sq], fill=(40, 48, 64, 255))
        # Paste sprite centered
        sprite = img.convert("RGBA")
        ratio = min(cell_w / sprite.width, cell_size / sprite.height) * 0.85
        nw = int(sprite.width * ratio)
        nh = int(sprite.height * ratio)
        sprite_resized = sprite.resize((nw, nh), Image.LANCZOS)
        cb.paste(
            sprite_resized,
            ((cell_w - nw) // 2, (cell_size - nh) // 2),
            sprite_resized,
        )
        sheet.paste(cb, (x, y))
        # Label
        draw.text((x + 4, y + cell_size + 4), label, fill=label_color, font=font_small)
    return sheet


# ---------- Variant generators ----------
def mouse_variants():
    """Try different white-key thresholds for the mouse sprite."""
    mouse = Image.open(os.path.join(PUBLIC, "mouse.jpg"))
    w, h = mouse.size
    # Crop out the stray emoji first (bottom-left)
    mouse_cropped = mouse.crop((int(w * 0.10), 0, w, h))
    presets = [
        ("thresh=215 (aggressive)", 215, 1),
        ("thresh=225", 225, 1),
        ("thresh=232 (current)", 232, 1),
        ("thresh=240 (gentle)", 240, 1),
        ("thresh=248 (very gentle)", 248, 1),
        ("thresh=232 feather=2", 232, 2),
    ]
    variants = []
    for label, thr, feat in presets:
        img = chroma_key_white(mouse_cropped, threshold=thr, feather=feat)
        img = tight_crop_alpha(img, pad=6)
        variants.append((label, img))
    return variants


def cat_variants():
    """Try different darkness thresholds + close iterations for the cat sprite."""
    cat = Image.open(os.path.join(PUBLIC, "cat.png"))
    presets = [
        ("dark=60 close=2", 60, 2, True),
        ("dark=70 close=3", 70, 3, True),
        ("dark=80 close=3 (current)", 80, 3, True),
        ("dark=90 close=3", 90, 3, True),
        ("dark=100 close=4", 100, 4, True),
        ("dark=80 close=3 no_pink", 80, 3, False),
    ]
    variants = []
    for label, dark, close, pink in presets:
        img = extract_cat_strict(cat, dark_threshold=dark, close_iters=close, keep_pink=pink)
        img = tight_crop_alpha(img, pad=6)
        variants.append((label, img))
    return variants


def logo_variants():
    """Try different tolerance values for green-keying the logo."""
    logo = Image.open(os.path.join(PUBLIC, "logo-ritual.jpg"))
    presets = [
        ("tol=40", (0, 102, 51), 40),
        ("tol=60", (0, 102, 51), 60),
        ("tol=80 (current)", (0, 102, 51), 80),
        ("tol=100", (0, 102, 51), 100),
        ("tol=120", (0, 102, 51), 120),
        ("tol=80 + thresh=180", (0, 102, 51), 80),
    ]
    variants = []
    for label, tgt, tol in presets:
        img = chroma_key_color(logo, target_rgb=tgt, tolerance=tol)
        if "thresh" in label:
            arr = np.array(img)
            alpha = arr[..., 3]
            new_alpha = np.where(alpha >= 180, 255, 0).astype(np.uint8)
            arr[..., 3] = new_alpha
            img = Image.fromarray(arr, "RGBA")
        img = tight_crop_alpha(img, pad=4)
        variants.append((label, img))
    return variants


def main():
    print("Generating mouse variants...")
    mv = mouse_variants()
    make_contact_sheet("Mouse Sprite — White-Key Threshold Variants", mv).save(
        os.path.join(OUT, "mouse_variants.png")
    )
    print("Generating cat variants...")
    cv = cat_variants()
    make_contact_sheet("Cat Sprite — Darkness Threshold Variants", cv).save(
        os.path.join(OUT, "cat_variants.png")
    )
    print("Generating logo variants...")
    lv = logo_variants()
    make_contact_sheet("Logo Sprite — Green-Key Tolerance Variants", lv).save(
        os.path.join(OUT, "logo_variants.png")
    )
    print(f"Done. Open these in a browser to compare:")
    print(f"  /_explorer/mouse_variants.png")
    print(f"  /_explorer/cat_variants.png")
    print(f"  /_explorer/logo_variants.png")
    print()
    print("To use a variant, edit scripts/refine_sprites.py with the chosen numbers,")
    print("then re-run:  python scripts/refine_sprites.py")


if __name__ == "__main__":
    main()
