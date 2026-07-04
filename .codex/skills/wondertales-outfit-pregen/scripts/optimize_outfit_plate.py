#!/usr/bin/env python3
"""Optimize a generated WonderTales outfit plate into a canonical JPEG."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Tuple

from PIL import Image, ImageOps


def parse_hex_color(value: str) -> Tuple[int, int, int]:
    raw = value.strip()
    if raw.startswith("#"):
        raw = raw[1:]
    if len(raw) != 6:
        raise argparse.ArgumentTypeError("background must be a 6-digit hex color")
    try:
        return tuple(int(raw[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("background must be a 6-digit hex color") from exc


def optimize(
    input_path: Path,
    output_path: Path,
    *,
    size: int,
    quality: int,
    background: Tuple[int, int, int],
) -> None:
    if size <= 0:
        raise ValueError("size must be positive")
    if not (1 <= quality <= 100):
        raise ValueError("quality must be between 1 and 100")
    if not input_path.exists():
        raise FileNotFoundError(input_path)

    image = Image.open(input_path)
    image = ImageOps.exif_transpose(image)

    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        flattened = Image.new("RGBA", rgba.size, (*background, 255))
        flattened.alpha_composite(rgba)
        image = flattened.convert("RGB")
    else:
        image = image.convert("RGB")

    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), background)
    canvas.paste(image, ((size - image.width) // 2, (size - image.height) // 2))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, "JPEG", quality=quality, optimize=True, progressive=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a generated outfit plate to the WonderTales canonical JPEG format."
    )
    parser.add_argument("--input", required=True, type=Path, help="Source image path")
    parser.add_argument("--output", required=True, type=Path, help="Final .jpg path")
    parser.add_argument("--size", type=int, default=1024, help="Square output size in pixels")
    parser.add_argument("--quality", type=int, default=95, help="JPEG quality")
    parser.add_argument(
        "--background",
        type=parse_hex_color,
        default=parse_hex_color("#faf7f1"),
        help="Canvas background color, hex RGB",
    )
    parser.add_argument(
        "--delete-source",
        action="store_true",
        help="Delete the input file after a successful optimized output is written",
    )
    args = parser.parse_args()

    optimize(
        args.input,
        args.output,
        size=args.size,
        quality=args.quality,
        background=args.background,
    )

    if args.delete_source:
        args.input.unlink(missing_ok=True)

    with Image.open(args.output) as output:
        print(
            f"optimized={args.output} format={output.format} size={output.size[0]}x{output.size[1]} "
            f"bytes={args.output.stat().st_size} quality={args.quality}"
        )


if __name__ == "__main__":
    main()
