import pytest

from pipeline.timeparse import days_to_str, fmt_time, parse_days, parse_time


@pytest.mark.parametrize("text,mask", [("MWF", 21), ("TR", 10), ("MTWRF", 31), ("n.a.", 0), ("", 0), (None, 0),
                                       ("R", 8), ("S", 32)])
def test_parse_days(text, mask):
    assert parse_days(text) == mask


def test_parse_days_rejects_garbage():
    with pytest.raises(ValueError):
        parse_days("MXZ")


@pytest.mark.parametrize("text,minutes", [("09:00AM", 540), ("09:00 AM", 540), ("12:00PM", 720), ("12:30AM", 30),
                                          ("01:50PM", 830), ("11:59 PM", 1439), ("9:00 a.m.", 540),
                                          ("ARRANGED", None), ("", None), (None, None)])
def test_parse_time(text, minutes):
    assert parse_time(text) == minutes


def test_bad_time():
    with pytest.raises(ValueError):
        parse_time("25:00PM")


def test_roundtrip():
    assert days_to_str(parse_days("MWF")) == "MWF"
    assert fmt_time(540) == "9:00 AM" and fmt_time(None) == "ARRANGED" and fmt_time(780) == "1:00 PM"
