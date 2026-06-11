from backend.datetime_cursor import repair_iso_datetime_query_cursor


def test_repair_iso_datetime_query_cursor_plus_decoded_as_space():
    fixed = repair_iso_datetime_query_cursor("2026-06-10T13:03:21.642929 00:00")
    assert fixed == "2026-06-10T13:03:21.642929+00:00"
