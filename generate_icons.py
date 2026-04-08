"""Generate placeholder PNG icons for the Unaware Sessions browser extension."""

import struct
import zlib
import os


def create_png(width: int, height: int, filepath: str) -> None:
    """Create a PNG with a blue circle on transparent background."""

    def make_pixel(x: int, y: int) -> bytes:
        cx, cy = width / 2, height / 2
        r = min(width, height) / 2 - 1
        dx, dy = x - cx + 0.5, y - cy + 0.5
        if dx * dx + dy * dy <= r * r:
            return b"\x3d\x7a\xc7\xff"  # Blue (#3D7AC7) fully opaque
        return b"\x00\x00\x00\x00"  # Transparent

    # Build raw image data (filter byte 0 + RGBA pixels per row)
    raw = b""
    for y in range(height):
        raw += b"\x00"  # filter: none
        for x in range(width):
            raw += make_pixel(x, y)

    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc

    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat_data = zlib.compress(raw)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr_data)
    png += chunk(b"IDAT", idat_data)
    png += chunk(b"IEND", b"")

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(png)
    print(f"Created {filepath} ({width}x{height})")


if __name__ == "__main__":
    base = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(base, "src", "assets", "icons")

    for size in (16, 32, 48, 128):
        create_png(size, size, os.path.join(icons_dir, f"icon-{size}.png"))

    print("Done. All icons generated.")
