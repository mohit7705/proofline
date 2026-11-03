"""Before and After files for checklist items that need a pair."""

PHASES = ("before", "after", "other")


def phase_gaps(items) -> list[str]:
    """Which of "before" and "after" no file covers yet."""
    have = {item.phase for item in items}
    return [name for name in ("before", "after") if name not in have]


def gap_text(gaps: list[str]) -> str:
    """Plain words for the missing files, for example "a Before file"."""
    words = [("an After file" if name == "after" else "a Before file") for name in gaps]
    return " and ".join(words)
