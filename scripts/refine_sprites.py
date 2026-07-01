"""
Refine the cat sprite and logo sprite:
- cat-sprite.png: there are leftover floral patches in TR/BR corners. The black cat
  has very dark pixels. Re-extract using a stricter darkness threshold, then
  morphologically close small holes, then drop small connected components (the
  leftover floral blobs are disconnected from the cat body).
- logo-square.png: drop the ghost halo by alpha thresholding, then re-tight crop.
"""

from PIL import Image, ImageFilter
import numpy as np
import os
from scipy import ndimage

PUBLIC = "/home/z/my-project/public"


def extract_cat_strict():
    print("Refining cat sprite...")
    cat = Image.open(os.path.join(PUBLIC, "cat.png")).convert("RGBA")
    arr = np.array(cat).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    brightness = (r + g + b) / 3

    # The black cat: brightness < 80 (very dark)
    # Plus pink paw pads / tongue: high R, mid G/B
    is_dark = brightness < 80
    is_pink = (r > 180) & (g > 100) & (g < 200) & (b < 200) & (b > 80)
    mask = (is_dark | is_pink).astype(np.uint8) * 255

    # Morphological close: dilate then erode to fill small holes inside cat
    mask_bool = mask > 0
    # Close (dilate then erode) with iterations=3
    mask_bool = ndimage.binary_dilation(mask_bool, iterations=3)
    mask_bool = ndimage.binary_erosion(mask_bool, iterations=3)
    # Then erode slightly to clean edges
    mask_bool = ndimage.binary_erosion(mask_bool, iterations=1)
    mask_bool = ndimage.binary_dilation(mask_bool, iterations=1)

    # Label connected components, keep only the largest one (the cat)
    labeled, num = ndimage.label(mask_bool)
    if num > 1:
        sizes = ndimage.sum(mask_bool, labeled, range(1, num + 1))
        largest = np.argmax(sizes) + 1
        mask_bool = labeled == largest

    alpha = (mask_bool.astype(np.uint8)) * 255
    alpha_img = Image.fromarray(alpha, "L")
    # Slight blur for softer edges
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=1.2))

    out = cat.copy()
    out.putalpha(alpha_img)

    # Tight crop
    bbox = out.split()[-1].getbbox()
    if bbox:
        l, t, r2, b2 = bbox
        l = max(0, l - 6); t = max(0, t - 6)
        r2 = min(out.width, r2 + 6); b2 = min(out.height, b2 + 6)
        out = out.crop((l, t, r2, b2))

    out.save(os.path.join(PUBLIC, "cat-sprite.png"))
    print(f"  -> cat-sprite.png  {out.size}")


def refine_logo():
    print("Refining logo sprite...")
    logo = Image.open(os.path.join(PUBLIC, "logo-square.png")).convert("RGBA")
    arr = np.array(logo)
    alpha = arr[..., 3]

    # Drop ghost pixels: any alpha < 200 -> 0
    new_alpha = np.where(alpha >= 200, 255, 0).astype(np.uint8)
    arr[..., 3] = new_alpha
    out = Image.fromarray(arr, "RGBA")

    # Tight crop
    bbox = out.split()[-1].getbbox()
    if bbox:
        l, t, r, b = bbox
        l = max(0, l - 4); t = max(0, t - 4)
        r = min(out.width, r + 4); b = min(out.height, b + 4)
        out = out.crop((l, t, r, b))

    out.save(os.path.join(PUBLIC, "logo-square.png"))
    print(f"  -> logo-square.png  {out.size}")

    # Re-make the badge with the cleaned logo
    from process_sprites import make_circular_badge
    # The badge function from process_sprites.py
    size = 128
    square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ratio = size / max(out.width, out.height)
    new_w = int(out.width * ratio * 0.85)
    new_h = int(out.height * ratio * 0.85)
    img_resized = out.resize((new_w, new_h), Image.LANCZOS)
    offset = ((size - new_w) // 2, (size - new_h) // 2)
    square.paste(img_resized, offset, img_resized)
    mask = Image.new("L", (size, size), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    badge = Image.new("RGBA", (size, size), (0, 102, 51, 255))
    badge.paste(square, (0, 0), mask)
    badge = badge.filter(ImageFilter.GaussianBlur(radius=0.4))
    badge.save(os.path.join(PUBLIC, "logo-badge.png"))
    print(f"  -> logo-badge.png  {badge.size}")


if __name__ == "__main__":
    extract_cat_strict()
    refine_logo()
    print("Done.")
