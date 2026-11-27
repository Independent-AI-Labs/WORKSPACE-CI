"""Trust checks the CI client applies to the guard inline scanner (HG-13)."""

from __future__ import annotations

import errno
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ci import inline_scanner


def _tree(tmp_path: Path) -> tuple[Path, Path]:
    stop = tmp_path / "trust"
    scanner = stop / "lib" / "inline-scan"
    scanner.parent.mkdir(parents=True)
    scanner.write_bytes(b"\x7fELF")
    for directory in (stop, scanner.parent):
        directory.chmod(0o755)
    scanner.chmod(0o755)
    return scanner, stop


def _verify(scanner: Path, stop: Path, root_uid: int | None = None) -> None:
    uid = os.getuid() if root_uid is None else root_uid
    inline_scanner.verify_scanner(scanner, root_uid=uid, stop=stop)


def test_installed_path_is_outside_the_sealed_root():
    assert inline_scanner.SCANNER == Path("/usr/lib/workspace-guard/inline-scan")
    assert "sealed" not in inline_scanner.SCANNER.parts


def test_trusted_scanner_passes(tmp_path):
    scanner, stop = _tree(tmp_path)
    _verify(scanner, stop)


def test_symlink_is_rejected(tmp_path):
    scanner, stop = _tree(tmp_path)
    link = scanner.parent / "link"
    link.symlink_to(scanner)
    with pytest.raises(inline_scanner.ScannerError, match="not a regular file"):
        _verify(link, stop)


def test_wrong_owner_is_rejected(tmp_path):
    scanner, stop = _tree(tmp_path)
    with pytest.raises(inline_scanner.ScannerError, match="not root-owned"):
        _verify(scanner, stop, root_uid=os.getuid() + 1)


def test_wrong_mode_is_rejected(tmp_path):
    scanner, stop = _tree(tmp_path)
    scanner.chmod(0o775)
    with pytest.raises(inline_scanner.ScannerError, match="mode is not 0755"):
        _verify(scanner, stop)


def test_file_capabilities_are_rejected(monkeypatch, tmp_path):
    scanner, stop = _tree(tmp_path)
    monkeypatch.setattr(os, "getxattr", lambda *args, **kwargs: b"\x01")
    with pytest.raises(inline_scanner.ScannerError, match="carries file capabilities"):
        _verify(scanner, stop)


def test_unreadable_capabilities_fail_closed(monkeypatch, tmp_path):
    scanner, stop = _tree(tmp_path)

    def _eio(*_args, **_kwargs):
        raise OSError(errno.EIO, "io error")

    monkeypatch.setattr(os, "getxattr", _eio)
    with pytest.raises(inline_scanner.ScannerError, match="cannot read file capabilities"):
        _verify(scanner, stop)


def test_writable_parent_is_rejected(tmp_path):
    scanner, stop = _tree(tmp_path)
    scanner.parent.chmod(0o775)
    with pytest.raises(inline_scanner.ScannerError, match="group or other writable"):
        _verify(scanner, stop)


def test_writable_stop_directory_is_rejected(tmp_path):
    scanner, stop = _tree(tmp_path)
    stop.chmod(0o757)
    with pytest.raises(inline_scanner.ScannerError, match="group or other writable"):
        _verify(scanner, stop)
