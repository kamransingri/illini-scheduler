"""Read upstream CSVs that mix UTF-8 lines with Windows-1252 lines (seen in the GPA and gen-ed files)."""

from __future__ import annotations

import io
from pathlib import Path


def decode_mixed(data: bytes) -> str:
    out = []
    for line in data.splitlines(keepends=True):
        try:
            out.append(line.decode("utf-8"))
        except UnicodeDecodeError:
            out.append(line.decode("cp1252", errors="replace"))
    text = "".join(out)
    return text[1:] if text.startswith("﻿") else text


def open_mixed(path: Path | str) -> io.StringIO:
    return io.StringIO(decode_mixed(Path(path).read_bytes()), newline="")
