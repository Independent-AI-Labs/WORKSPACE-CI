from pathlib import Path

import pytest

from ci.atomic_exchange import exchange, main


def test_exchange_swaps_nonempty_directories_atomically(tmp_path: Path) -> None:
    left = tmp_path / "left"
    right = tmp_path / "right"
    left.mkdir()
    right.mkdir()
    (left / "new").write_text("new", encoding="utf-8")
    (right / "old").write_text("old", encoding="utf-8")

    exchange(left, right)

    assert (left / "old").read_text(encoding="utf-8") == "old"
    assert (right / "new").read_text(encoding="utf-8") == "new"


def test_exchange_rejects_symlinks(tmp_path: Path) -> None:
    real = tmp_path / "real"
    other = tmp_path / "other"
    real.mkdir()
    other.mkdir()
    linked = tmp_path / "linked"
    linked.symlink_to(real, target_is_directory=True)

    with pytest.raises(ValueError, match="real directory"):
        exchange(linked, other)


def test_exchange_rejects_different_parents(tmp_path: Path) -> None:
    left = tmp_path / "one" / "left"
    right = tmp_path / "two" / "right"
    left.mkdir(parents=True)
    right.mkdir(parents=True)

    with pytest.raises(ValueError, match="share a parent"):
        exchange(left, right)


def test_main_exchanges_argument_paths(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    left = tmp_path / "left"
    right = tmp_path / "right"
    left.mkdir()
    right.mkdir()
    (left / "value").write_text("left", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["atomic-exchange", str(left), str(right)])

    assert main() == 0
    assert (right / "value").read_text(encoding="utf-8") == "left"
