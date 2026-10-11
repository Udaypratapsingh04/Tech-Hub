"""One-off helper: converts the original product photos into small, web-ready WebP files.

Usage (only needed if you add new photos from the original asset folders):
    python scripts/optimize_images.py "path/to/original/assets/images"

Product photos are trimmed of empty margins and resized to max 900px on the
longest side; hero scenes are produced at two widths for responsive loading.
"""
import sys
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "img"

# product slug -> original file (relative to the "images" folder)
PRODUCTS = {
    "alienware-m15-r6": "Gaming laptops/DELL Inspiron G15 5520.png",
    "asus-rog-strix-scar-15": "Gaming laptops/Asus ROG Strix G16.png",
    "acer-predator-helios-neo-16": "Gaming laptops/Acer Predator helios neo 16.png",
    "hp-victus-16": "Gaming laptops/HP Victus 16.png",
    "asus-tuf-gaming-a15": "Gaming laptops/Asus TUF Gaming A15.png",
    "samsung-galaxy-book": "Students laptops/Samsung Galaxy Book 4.png",
    "dell-inspiron-14": "Students laptops/DELL Inspiron 5430.png",
    "hp-pavilion-x360": "Students laptops/HP ENVY X 360.png",
    "acer-aspire-5": "Students laptops/Acer Aspire 5.png",
    "asus-zenbook-s-13": "Students laptops/ASUS Zenbook S 13.png",
    "apple-macbook-pro-16-m2-pro": "Creators laptop/apple mac.png",
    "lenovo-legion-pro-7i": "Creators laptop/Lenovo Legion Pro 7i.png",
    "lenovo-yoga-slim-7": "Creators laptop/Lenovo Yoga Slim 7 Intel Core Ultra 7.png",
    "asus-amd-ryzen-7": "Creators laptop/ASUS AMD Ryzen 5.png",
    "apple-macbook-m4": "image.png",
    "google-pixelbook-go": "Chromebook/Pixelbook Go.png",
    "hp-chromebook-x360": "Chromebook/HP_Chromebook_x360.png",
    "acer-chromebook-spin-713": "Chromebook/Acer Spin 713.png",
    "lenovo-chromebook-flex-5": "Chromebook/Lenovo Flex 5.png",
    "asus-chromebook-flip-c434": "Chromebook/ASUS Flip C434.png",
    "apple-airpods-max": "headphone/Apple Airpod Max.png",
    "bose-quietcomfort-ultra": "headphone/Bose QuiteComfort Ultra.png",
    "hyperx-cloud-alpha-s": "headphone/HyperX Cloud Alpha S 4P5L3AA.png",
    "jbl-quantum-910-bluetooth": "headphone/JBL Quantum 910 Bluetooth.png",
    "mechanical-keyboard-1": "keyboard/g515-wired-keyboard-black-gallery-1-us.png",
    "wireless-keyboard": "keyboard/keyboard2.jpg",
    "mechanical-keyboard-2": "keyboard/keyboard3.jpg",
    "apple-wireless-keyboard": "keyboard/apple keyboard.jpg",
    "apple-magic-mouse": "mouse/Apple Magic Rechargeable Wireless Optical Mouse.png",
    "hp-z3700-wireless-mouse": "mouse/HP Z3700 Wireless Optical Mouse.png",
    "logitech-g102-prodigy": "mouse/Logitech G102 Prodigy Wired Optical Gaming Mouse.png",
    "logitech-mx-master-3s": "mouse/Logitech MX Master 3S Rechargeable Wireless.png",
    "cosmic-byte-quantum-gamepad": "Game pad/game pad.png",
    "fusion-pro-wireless-gamepad": "Game pad/game pad 2.png",
    "cosmic-byte-ares-wired-gamepad": "Game pad/game pad 3.png",
    "evofox-elite-x-wireless-gamepad": "Game pad/game pad 4.png",
}
SCENES = {"students": "Slider/slide1.jpg", "gaming": "Slider/slide2.jpg", "creators": "Slider/slide3.jpg"}


def trim_transparent(im: Image.Image) -> Image.Image:
    """Crop empty transparent margins so every product fills its tile consistently."""
    if im.mode == "RGBA":
        box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        if box:
            im = im.crop(box)
    return im


def main(src_root: str) -> None:
    src = Path(src_root)
    (OUT / "products").mkdir(parents=True, exist_ok=True)
    (OUT / "scenes").mkdir(parents=True, exist_ok=True)
    for slug, rel in PRODUCTS.items():
        im = Image.open(src / rel).convert("RGBA")
        im = trim_transparent(im)
        im.thumbnail((900, 900), Image.LANCZOS)
        im.save(OUT / "products" / f"{slug}.webp", "WEBP", quality=84, method=6)
    for name, rel in SCENES.items():
        im = Image.open(src / rel).convert("RGB")
        for width in (1920, 960):
            h = round(im.height * width / im.width)
            im.resize((width, h), Image.LANCZOS).save(
                OUT / "scenes" / f"{name}-{width}.webp", "WEBP", quality=78, method=6
            )
    print("done")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "images")
