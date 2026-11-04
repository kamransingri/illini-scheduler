"""Day and time parsing shared by every Course Explorer source.

Days become a 5-bit mask (Mon=1, Tue=2, Wed=4, Thu=8, Fri=16; Sat=32 and Sun=64 are kept for the rare
weekend section). Times become minutes since midnight. ARRANGED / online sections have no time and parse
to ``None``.
"""

from __future__ import annotations

import re

DAY_BITS = {"M": 1, "T": 2, "W": 4, "R": 8, "F": 16, "S": 32, "U": 64}
NO_DAYS = {"", "N.A.", "NA", "N/A", "ARRANGED", "TBA"}

_TIME_RE = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]?\.?\s*$")


def parse_days(text: str | None) -> int:
    """'MWF' -> 21. Unknown letters raise so that bad data is noticed, blanks/'n.a.' -> 0."""
    if text is None:
        return 0
    t = text.strip().upper()
    if t in NO_DAYS:
        return 0
    mask = 0
    for ch in t:
        if ch == " ":
            continue
        if ch not in DAY_BITS:
            raise ValueError(f"unknown day letter {ch!r} in {text!r}")
        mask |= DAY_BITS[ch]
    return mask


def days_to_str(mask: int) -> str:
    return "".join(ch for ch, bit in DAY_BITS.items() if mask & bit)


def parse_time(text: str | None) -> int | None:
    """'09:00AM' / '09:00 AM' / '9:00 a.m.' -> 540. 'ARRANGED' or blank -> None."""
    if text is None:
        return None
    t = text.strip()
    if not t or t.upper() in NO_DAYS:
        return None
    m = _TIME_RE.match(t)
    if not m:
        raise ValueError(f"unparseable time {text!r}")
    hour, minute, ampm = int(m.group(1)), int(m.group(2)), m.group(3).upper()
    if not (1 <= hour <= 12 and 0 <= minute < 60):
        raise ValueError(f"time out of range {text!r}")
    hour = hour % 12 + (12 if ampm == "P" else 0)
    return hour * 60 + minute


def fmt_time(minutes: int | None) -> str:
    if minutes is None:
        return "ARRANGED"
    h, m = divmod(minutes, 60)
    suffix = "AM" if h < 12 else "PM"
    return f"{(h % 12) or 12}:{m:02d} {suffix}"
