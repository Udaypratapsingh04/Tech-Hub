"""Initial catalog, consolidated from the product pages of the original static site.

This file is only used to seed an empty database. After that, products are managed
through the admin dashboard (or the /api/admin/products endpoints).
"""

# category -> subcategory slug, label used in the UI
CATEGORIES = [
    {"category": "laptops", "subcategory": "gaming", "label": "Gaming laptops", "short": "Gaming"},
    {"category": "laptops", "subcategory": "students", "label": "Student laptops", "short": "Students"},
    {"category": "laptops", "subcategory": "creators", "label": "Creator laptops", "short": "Creators"},
    {"category": "laptops", "subcategory": "chromebooks", "label": "Chromebooks", "short": "Chromebooks"},
    {"category": "accessories", "subcategory": "headphones", "label": "Headphones", "short": "Headphones"},
    {"category": "accessories", "subcategory": "keyboards", "label": "Keyboards", "short": "Keyboards"},
    {"category": "accessories", "subcategory": "mice", "label": "Mice", "short": "Mice"},
    {"category": "accessories", "subcategory": "gamepads", "label": "Gamepads", "short": "Gamepads"},
]

IMG = "/assets/img/products/{}.webp"


def _laptop(slug, name, brand, sub, price, specs, desc="", new=False, featured=False, stock=12):
    return {
        "slug": slug, "name": name, "brand": brand, "category": "laptops", "subcategory": sub,
        "price": price, "image": IMG.format(slug), "description": desc, "specs": specs,
        "stock": stock, "is_new": new, "is_featured": featured,
    }


def _accessory(slug, name, brand, sub, price, specs=None, featured=False, stock=40):
    return {
        "slug": slug, "name": name, "brand": brand, "category": "accessories", "subcategory": sub,
        "price": price, "image": IMG.format(slug), "description": "", "specs": specs or {},
        "stock": stock, "is_new": False, "is_featured": featured,
    }


_GAMER = ("is a powerful laptop with an incredible display and graphics capabilities for serious gamers. "
          "It's built to run the most demanding AAA games smoothly.")

PRODUCTS = [
    # ------------------------------------------------------------------ gaming
    _laptop("alienware-m15-r6", "Alienware m15 R6", "Alienware", "gaming", 179999,
            {"Display": '15.6" Full HD 165Hz', "Processor": "Intel Core i7-11800H",
             "Graphics": "NVIDIA GeForce RTX 3070", "RAM": "16GB DDR4", "Storage": "1TB SSD"},
            "With top-tier performance and stunning graphics, the Alienware m15 R6 is perfect for gamers who "
            "demand the best experience in gaming, from high refresh rates to powerful GPU support."),
    _laptop("asus-rog-strix-scar-15", "Asus ROG Strix Scar 15", "ASUS", "gaming", 229900,
            {"Display": '15.6" QHD 165Hz', "Processor": "Intel Core i9-12900H",
             "Graphics": "NVIDIA GeForce RTX 3080", "RAM": "32GB DDR4", "Storage": "1TB SSD"},
            "The Asus ROG Strix Scar 15 " + _GAMER, new=True, featured=True),
    _laptop("acer-predator-helios-neo-16", "Acer Predator Helios Neo 16", "Acer", "gaming", 229900,
            {"Display": '15.6" QHD 165Hz', "Processor": "Intel Core i9-12900H",
             "Graphics": "NVIDIA GeForce RTX 3090", "RAM": "32GB DDR4", "Storage": "1TB SSD"},
            "The Acer Predator Helios Neo 16 " + _GAMER, new=True),
    _laptop("hp-victus-16", "HP Victus 16", "HP", "gaming", 99900,
            {"Display": '15.6" FHD 165Hz', "Processor": "Intel Core i7-12750H",
             "Graphics": "NVIDIA GeForce RTX 3080", "RAM": "32GB DDR4", "Storage": "1TB SSD"},
            "The HP Victus 16 " + _GAMER, new=True),
    _laptop("asus-tuf-gaming-a15", "Asus TUF Gaming A15", "ASUS", "gaming", 99900,
            {"Display": '15.6" FHD 165Hz', "Processor": "Intel Core i7-12750H",
             "Graphics": "NVIDIA GeForce RTX 3060", "RAM": "32GB DDR4", "Storage": "1TB SSD"},
            "The Asus TUF Gaming A15 " + _GAMER),
    # ---------------------------------------------------------------- students
    _laptop("samsung-galaxy-book", "Samsung Galaxy Book", "Samsung", "students", 99999,
            {"Display": '13.6" Retina Display', "Processor": "Intel i7",
             "RAM": "8GB Unified Memory", "Storage": "256GB SSD"},
            "Ultra-light and offers incredible performance for everyday tasks.", new=True),
    _laptop("dell-inspiron-14", "Dell Inspiron 14", "Dell", "students", 99999,
            {"Display": '14" Full HD', "Processor": "Intel Core i5-1135G7",
             "RAM": "8GB DDR4", "Storage": "512GB SSD"},
            "Great budget option with solid performance and reliable battery life.", new=True),
    _laptop("hp-pavilion-x360", "HP Pavilion x360", "HP", "students", 99999,
            {"Display": '14" Full HD Touchscreen', "Processor": "Intel Core i7-1175G4",
             "RAM": "16GB DDR4", "Storage": "512GB SSD"},
            "2-in-1 design allowing use in laptop or tablet mode. Budget-friendly with solid performance."),
    _laptop("acer-aspire-5", "Acer Aspire 5", "Acer", "students", 65999,
            {"Display": '14" Full HD', "Processor": "Intel Core i5-1135G7",
             "RAM": "8GB DDR4", "Storage": "512GB SSD"},
            "Great budget option with solid performance and reliable battery life.", new=True),
    _laptop("asus-zenbook-s-13", "ASUS Zenbook S 13", "ASUS", "students", 65999,
            {"Display": '14" Full HD Touchscreen', "Processor": "Intel Core i3-1115G4",
             "RAM": "8GB DDR4", "Storage": "256GB SSD"},
            "2-in-1 design allowing use in laptop or tablet mode. Budget-friendly with solid performance.",
            new=True, featured=True),
    # ---------------------------------------------------------------- creators
    _laptop("apple-macbook-pro-16-m2-pro", 'Apple MacBook Pro 16" (M2 Pro)', "Apple", "creators", 249900,
            {"Display": '16" Retina Display, 3456x2234', "Processor": "Apple M2 Pro",
             "Graphics": "Integrated 16-core GPU", "RAM": "16GB Unified Memory", "Storage": "512GB SSD"},
            "Designed for professional creators. Handles intensive creative workloads like video editing and "
            "3D rendering effortlessly."),
    _laptop("lenovo-legion-pro-7i", "Lenovo Legion Pro 7i", "Lenovo", "creators", 129999,
            {"Display": '17.3" 4K UHD (3840x2160)', "Processor": "Intel Core i7-12800H",
             "Graphics": "NVIDIA GeForce RTX 3080", "RAM": "32GB DDR5", "Storage": "1TB SSD"},
            "Powerful laptop with a large 4K display, ideal for video editing, 3D modeling, and content creation.",
            new=True, featured=True),
    _laptop("lenovo-yoga-slim-7", "Lenovo Yoga Slim 7", "Lenovo", "creators", 119999,
            {"Display": '14" 2.8K OLED', "Processor": "Intel Core i7-12700H",
             "Graphics": "Intel Iris Xe", "RAM": "16GB DDR4", "Storage": "512GB SSD"},
            "Lightweight and stylish laptop perfect for photo/video editing and multitasking on the go."),
    _laptop("asus-amd-ryzen-7", "ASUS AMD Ryzen 7", "ASUS", "creators", 99999,
            {"Display": '15.6" Full HD', "Processor": "AMD Ryzen 7 5800H",
             "Graphics": "NVIDIA GeForce RTX 3060", "RAM": "16GB DDR4", "Storage": "1TB SSD"},
            "High-performance laptop for creators who need reliable CPU/GPU power for editing and rendering tasks.",
            new=True),
    _laptop("apple-macbook-m4", "Apple MacBook M4", "Apple", "creators", 122999,
            {"Processor": "Apple M4"}, "", new=True),
    # -------------------------------------------------------------- chromebooks
    _laptop("google-pixelbook-go", "Google Pixelbook Go", "Google", "chromebooks", 62999,
            {"Display": '13.3" Full HD', "Processor": "Intel Core m3", "RAM": "8GB", "Storage": "128GB SSD"},
            "Thin, light, and excellent battery life for students and professionals."),
    _laptop("hp-chromebook-x360", "HP Chromebook x360", "HP", "chromebooks", 45999,
            {"Display": '14" Full HD Touch', "Processor": "Intel Core i3", "RAM": "8GB", "Storage": "64GB eMMC"},
            "Flexible 2-in-1 device for browsing, streaming, and light productivity tasks."),
    _laptop("acer-chromebook-spin-713", "Acer Chromebook Spin 713", "Acer", "chromebooks", 77999,
            {"Display": '13.5" 2K Touch', "Processor": "Intel Core i5", "RAM": "8GB", "Storage": "256GB SSD"},
            "Sharp display, powerful multitasking, and convertible design."),
    _laptop("lenovo-chromebook-flex-5", "Lenovo Chromebook Flex 5", "Lenovo", "chromebooks", 34999,
            {"Display": '13.3" Full HD Touch', "Processor": "Intel Core i3", "RAM": "4GB", "Storage": "64GB eMMC"},
            "Affordable and versatile Chromebook for students and casual users."),
    _laptop("asus-chromebook-flip-c434", "ASUS Chromebook Flip C434", "ASUS", "chromebooks", 49999,
            {"Display": '14" Full HD Touch', "Processor": "Intel Core m3", "RAM": "8GB", "Storage": "128GB SSD"},
            "Portability with full-featured Chrome OS experience and a 360° hinge.", featured=True),
    # -------------------------------------------------------------- headphones
    _accessory("apple-airpods-max", "Apple AirPods Max", "Apple", "headphones", 40000,
               {"Type": "Over-ear headphones"}, featured=True),
    _accessory("bose-quietcomfort-ultra", "Bose QuietComfort Ultra", "Bose", "headphones", 35000,
               {"Type": "Over-ear headphones"}),
    _accessory("hyperx-cloud-alpha-s", "HyperX Cloud Alpha S", "HyperX", "headphones", 15000,
               {"Type": "Gaming headset"}),
    _accessory("jbl-quantum-910-bluetooth", "JBL Quantum 910 Bluetooth", "JBL", "headphones", 12000,
               {"Type": "Gaming headset", "Connectivity": "Bluetooth"}),
    # --------------------------------------------------------------- keyboards
    _accessory("mechanical-keyboard-1", "Mechanical Keyboard 1", "", "keyboards", 5000,
               {"Type": "Mechanical keyboard"}, featured=True),
    _accessory("wireless-keyboard", "Wireless Keyboard", "", "keyboards", 4500,
               {"Connectivity": "Wireless"}),
    _accessory("mechanical-keyboard-2", "Mechanical Keyboard 2", "", "keyboards", 5200,
               {"Type": "Mechanical keyboard"}),
    _accessory("apple-wireless-keyboard", "Apple Wireless Keyboard", "Apple", "keyboards", 6000,
               {"Connectivity": "Wireless"}),
    # -------------------------------------------------------------------- mice
    _accessory("apple-magic-mouse", "Apple Magic Mouse", "Apple", "mice", 5500,
               {"Connectivity": "Wireless", "Power": "Rechargeable"}),
    _accessory("hp-z3700-wireless-mouse", "HP Z3700 Wireless Optical Mouse", "HP", "mice", 1200,
               {"Connectivity": "Wireless", "Sensor": "Optical"}),
    _accessory("logitech-g102-prodigy", "Logitech G102 Prodigy Wired Optical", "Logitech", "mice", 1500,
               {"Connectivity": "Wired", "Sensor": "Optical"}),
    _accessory("logitech-mx-master-3s", "Logitech MX Master 3S", "Logitech", "mice", 6500,
               {"Connectivity": "Wireless", "Power": "Rechargeable"}, featured=True),
    # ---------------------------------------------------------------- gamepads
    _accessory("cosmic-byte-quantum-gamepad", "Cosmic Byte Quantum Gamepad", "Cosmic Byte", "gamepads", 2500,
               featured=True),
    _accessory("fusion-pro-wireless-gamepad", "FUSION Pro Wireless Gamepad", "FUSION", "gamepads", 3500,
               {"Connectivity": "Wireless"}),
    _accessory("cosmic-byte-ares-wired-gamepad", "Cosmic Byte ARES Wired Gamepad", "Cosmic Byte", "gamepads", 1800,
               {"Connectivity": "Wired"}),
    _accessory("evofox-elite-x-wireless-gamepad", "EvoFox Elite X Wireless Gamepad", "EvoFox", "gamepads", 4000,
               {"Connectivity": "Wireless"}),
]
