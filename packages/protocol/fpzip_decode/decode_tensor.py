#!/usr/bin/env python3
"""Decode a Draw Things image tensor (68-byte header + fpzip/fp16 payload) to PNG.

Reads the complete tensor (including the 68-byte Draw Things header) from stdin
and writes the resulting PNG bytes to stdout. Errors go to stderr with a
non-zero exit code so the Node caller can detect them via exit status.

This mirrors `tensor_png.decode_dt_tensor_to_png` from dts-utils but uses the
Wheels-distributed `fpzip` Python binding which understands the fpz v2 format
that Draw Things actually emits.
"""

import struct
import sys
import io

import fpzip
import numpy as np
from PIL import Image

FPZIP_MAGIC = 1012247
HEADER_INTS = 17
HEADER_BYTES = HEADER_INTS * 4


def main() -> int:
    raw = sys.stdin.buffer.read()
    if len(raw) < HEADER_BYTES:
        print(f"Tensor too small: got {len(raw)} bytes, need >= {HEADER_BYTES}", file=sys.stderr)
        return 2

    header = struct.unpack("<17I", raw[:HEADER_BYTES])
    magic, _, _, _, _, _, height, width, channels = header[:9]

    if magic == FPZIP_MAGIC:
        payload = raw[HEADER_BYTES:]
        try:
            tensor = fpzip.decompress(payload, order="C")
        except Exception as exc:  # noqa: BLE001
            print(f"fpzip.decompress failed: {exc}", file=sys.stderr)
            return 3
        tensor = np.asarray(tensor)
        if tensor.ndim == 4 and tensor.shape[0] == 1:
            tensor = tensor[0]
    else:
        count = height * width * channels
        expected = count * 2
        if len(raw) - HEADER_BYTES < expected:
            print(
                f"Float16 tensor payload too small: got {len(raw) - HEADER_BYTES} bytes, "
                f"need {expected}",
                file=sys.stderr,
            )
            return 4
        tensor = np.frombuffer(raw, dtype=np.float16, offset=HEADER_BYTES).reshape(
            (height, width, channels)
        )

    pixels = np.clip((tensor + 1) * 127, 0, 255).astype(np.uint8)
    if pixels.shape != (height, width, channels):
        pixels = pixels.reshape((height, width, channels))

    mode = {1: "L", 3: "RGB", 4: "RGBA"}.get(channels)
    if mode is None:
        print(f"Unsupported channel count: {channels}", file=sys.stderr)
        return 5

    buf = io.BytesIO()
    Image.fromarray(pixels, mode=mode).save(buf, format="PNG")
    sys.stdout.buffer.write(buf.getvalue())
    return 0


if __name__ == "__main__":
    sys.exit(main())
