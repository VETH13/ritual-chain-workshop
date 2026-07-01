"""
Process the three uploaded images into clean game sprites:

1. mouse.jpg (400x400, white bg + stray emoji) -> mouse-sprite.png (transparent bg)
2. cat.png (534x522, busy flower bg, black cat) -> cat-sprite.png (transparent bg, isolated cat)
3. logo-ritual.jpg (green bg, white knot) -> logo-square.png (transparent bg) and logo-badge.png (circular badge)

Strategy:
- Mouse: chroma-key near-white pixels (with tolerance). Crop emoji out first.
- Cat: black cat has very dark pixels. Threshold on darkness to extract silhouette.
       Then close holes with morphology to get a clean sprite.
- Logo: chroma-key green background, keep white knot.
"""

from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import os

UPLOAD = "/home/z/my-project/public"
OUT = "/home/z/my-project/public"

os.makedirs(OUT, exist_ok=True)


def chroma_key_white(img: Image.Image, threshold: int = 235, feather: int = 1) -> Image.Image:
    """Remove near-white background, keep everything else."""
    img = img.convert("RGBA")
    arr = np.array(img).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    # Distance from white
    brightness = (r + g + b) / 3
    # White if all channels >= threshold
    is_white = (r >= threshold) & (g >= threshold) & (b >= threshold)
    # Alpha: 0 where white, 255 elsewhere, with soft edge
    alpha = np.where(is_white, 0, 255).astype(np.uint8)
    # Feather edges: blur the alpha mask slightly
    alpha_img = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(radius=feather))
    out = img.copy()
    out.putalpha(alpha_img)
    return out


def chroma_key_color(img: Image.Image, target_rgb, tolerance: int = 60) -> Image.Image:
    """Remove pixels close to target_rgb color."""
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


def extract_dark_subject(img: Image.Image, dark_threshold: int = 70) -> Image.Image:
    """Extract dark subjects (like a black cat) from a colorful background.
    Returns RGBA with subject kept, background removed.
    """
    img = img.convert("RGBA")
    arr = np.array(img).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    brightness = (r + g + b) / 3
    # Keep pixels that are dark (the cat) OR very saturated pink/pale (tongue/paws)
    # Black cat: brightness < dark_threshold
    is_dark = brightness < dark_threshold
    # Also keep very saturated colors that might be part of cat (pink tongue, etc.)
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    saturation = (max_c - min_c) / (max_c + 1)
    # Pink-ish pixels (high R, mid G, low B)
    is_pink = (r > 180) & (g > 100) & (g < 200) & (b < 180) & (b > 100)
    mask = is_dark | is_pink
    alpha = np.where(mask, 255, 0).astype(np.uint8)
    alpha_img = Image.fromarray(alpha, "L")
    # Morphological close to fill holes
    from PIL import ImageFilter as IF
    # Dilate then erode (close)
    for _ in range(2):
        alpha_img = alpha_img.filter(IF.MinFilter(3))
    for _ in range(2):
        alpha_img = alpha_img.filter(IF.MaxFilter(3))
    # Slight blur for softer edges
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=1.5))
    out = img.copy()
    out.putalpha(alpha_img)
    return out


def tight_crop_alpha(img: Image.Image, pad: int = 4) -> Image.Image:
    """Crop to the bounding box of non-transparent pixels."""
    img = img.convert("RGBA")
    bbox = img.split()[-1].getbbox()
    if bbox is None:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(img.width, r + pad)
    b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


def make_circular_badge(img: Image.Image, size: int = 128, bg_color=(0, 102, 51, 255)) -> Image.Image:
    """Make a circular badge with the image centered."""
    img = img.convert("RGBA")
    # Resize to square keeping aspect, padding with transparent
    square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ratio = size / max(img.width, img.height)
    new_w = int(img.width * ratio * 0.85)
    new_h = int(img.height * ratio * 0.85)
    img_resized = img.resize((new_w, new_h), Image.LANCZOS)
    offset = ((size - new_w) // 2, (size - new_h) // 2)
    square.paste(img_resized, offset, img_resized)

    # Create circular mask
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    # Compose onto background
    badge = Image.new("RGBA", (size, size), bg_color)
    badge.paste(square, (0, 0), mask)
    # Anti-aliased edge
    badge = badge.filter(ImageFilter.GaussianBlur(radius=0.4))
    return badge


def main():
    # 1. Mouse sprite
    print("Processing mouse...")
    mouse = Image.open(os.path.join(UPLOAD, "mouse.jpg"))
    # Crop out the stray emoji in bottom-left (crop to top-right 80% then re-pad)
    w, h = mouse.size
    # The emoji is bottom-left corner. Crop it out.
    mouse_cropped = mouse.crop((int(w * 0.10), 0, w, h))
    mouse_alpha = chroma_key_white(mouse_cropped, threshold=232, feather=1)
    mouse_alpha = tight_crop_alpha(mouse_alpha, pad=6)
    # Resize to a reasonable sprite size (keep aspect)
    mouse_alpha.save(os.path.join(OUT, "mouse-sprite.png"))
    print(f"  -> mouse-sprite.png  {mouse_alpha.size}")

    # 2. Cat sprite — extract black cat from floral background
    print("Processing cat...")
    cat = Image.open(os.path.join(UPLOAD, "cat.png"))
    cat_alpha = extract_dark_subject(cat, dark_threshold=80)
    cat_alpha = tight_crop_alpha(cat_alpha, pad=6)
    cat_alpha.save(os.path.join(OUT, "cat-sprite.png"))
    print(f"  -> cat-sprite.png  {cat_alpha.size}")

    # 3. Logo — green bg with white knot, remove green
    print("Processing logo...")
    logo = Image.open(os.path.join(UPLOAD, "logo-ritual.jpg"))
    logo_alpha = chroma_key_color(logo, target_rgb=(0, 102, 51), tolerance=80)
    logo_alpha = tight_crop_alpha(logo_alpha, pad=4)
    logo_alpha.save(os.path.join(OUT, "logo-square.png"))
    print(f"  -> logo-square.png  {logo_alpha.size}")
    # Also make a circular badge version
    badge = make_circular_badge(logo_alpha, size=128, bg_color=(0, 102, 51, 255))
    badge.save(os.path.join(OUT, "logo-badge.png"))
    print(f"  -> logo-badge.png  {badge.size}")

    # 4. Also make circular badges for mouse and cat (for use in header / branding)
    mouse_badge = make_circular_badge(mouse_alpha, size=128, bg_color=(0, 0, 0, 0))
    mouse_badge.save(os.path.join(OUT, "mouse-badge.png"))
    cat_badge = make_circular_badge(cat_alpha, size=128, bg_color=(0, 0, 0, 0))
    cat_badge.save(os.path.join(OUT, "cat-badge.png"))
    print(f"  -> mouse-badge.png  cat-badge.png")

    print("Done.")


if __name__ == "__main__":
    main()
