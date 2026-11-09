"""Tests for ci.check_galaxy: Galaxy source validation."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from ci import check_galaxy


def test_strip_removes_strings_and_comments() -> None:
    text = 'call "a { b // c" // tail }'
    assert "{" not in check_galaxy._strip(text)
    assert "}" not in check_galaxy._strip(text)


def test_balance_accepts_balanced(tmp_path: Path) -> None:
    errors: list[str] = []
    check_galaxy._check_balance(tmp_path / "a.galaxy", "{ ( ) }", errors)
    assert errors == []


def test_balance_reports_unmatched_close(tmp_path: Path) -> None:
    errors: list[str] = []
    check_galaxy._check_balance(tmp_path / "a.galaxy", "}", errors)
    assert "unmatched brace }" in errors[0]


def test_balance_reports_unclosed(tmp_path: Path) -> None:
    errors: list[str] = []
    check_galaxy._check_balance(tmp_path / "a.galaxy", "{{", errors)
    assert errors == [f"{tmp_path / 'a.galaxy'}: 2 unclosed brace(s)"]


def test_tabs_reported(tmp_path: Path) -> None:
    errors: list[str] = []
    check_galaxy._check_tabs(tmp_path / "a.galaxy", "ok\n\tbad\n", errors)
    assert errors == [f"{tmp_path / 'a.galaxy'}:2: tab indentation"]


def test_resolve_include_trigger_libs() -> None:
    assert check_galaxy._resolve_include(Path("x/a.galaxy"), "TriggerLibs/x") is True


def test_resolve_include_finds_parent(tmp_path: Path) -> None:
    nested = tmp_path / "nested"
    nested.mkdir()
    (tmp_path / "lib.galaxy").write_text("", encoding="utf-8")
    assert check_galaxy._resolve_include(nested / "a.galaxy", "lib") is True


def test_resolve_include_missing(tmp_path: Path) -> None:
    assert check_galaxy._resolve_include(tmp_path / "a.galaxy", "nope") is False


def test_check_includes_reports_missing(tmp_path: Path) -> None:
    errors: list[str] = []
    check_galaxy._check_includes(
        tmp_path / "a.galaxy",
        'include "missing"\n',
        errors,
    )
    assert errors == [f"{tmp_path / 'a.galaxy'}:1: missing include missing"]


def test_check_duplicates() -> None:
    errors = check_galaxy._check_duplicates(
        {"f": ["a", "b"]},
        {"i": ["a", "b"]},
    )
    assert errors == ["duplicate function f: a, b", "duplicate include i: a, b"]


def test_galaxy_files(monkeypatch: pytest.MonkeyPatch) -> None:
    class Result:
        stdout = "a.galaxy\nb.galaxy\n"
        stderr = ""

    monkeypatch.setattr(check_galaxy.subprocess, "run", lambda *a, **k: Result())
    assert check_galaxy._galaxy_files() == [Path("a.galaxy"), Path("b.galaxy")]


def test_galaxy_files_stderr(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    class Result:
        stdout = "a.galaxy\n"
        stderr = "warn\n"

    monkeypatch.setattr(check_galaxy.subprocess, "run", lambda *a, **k: Result())
    assert check_galaxy._galaxy_files() == [Path("a.galaxy")]
    assert "warn" in capsys.readouterr().err


def test_galaxy_files_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*args, **kwargs):
        raise subprocess.SubprocessError("boom")

    monkeypatch.setattr(check_galaxy.subprocess, "run", fail)
    with pytest.raises(SystemExit) as exc:
        check_galaxy._galaxy_files()
    assert exc.value.code == 1


def test_main_no_files(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    monkeypatch.setattr(check_galaxy, "_galaxy_files", lambda: [])
    assert check_galaxy.main() == 0
    assert "no files" in capsys.readouterr().out


def test_main_ok(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys) -> None:
    good = tmp_path / "good.galaxy"
    good.write_text("void Foo() {\n}\n", encoding="utf-8")
    monkeypatch.setattr(check_galaxy, "_galaxy_files", lambda: [good])
    assert check_galaxy.main() == 0
    assert "1 file(s) OK" in capsys.readouterr().out


def test_main_errors(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys) -> None:
    bad = tmp_path / "bad.galaxy"
    bad.write_text("void Foo() {\n", encoding="utf-8")
    monkeypatch.setattr(check_galaxy, "_galaxy_files", lambda: [bad])
    assert check_galaxy.main() == 1
    assert "unclosed brace" in capsys.readouterr().out


def test_main_duplicate_functions(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys,
) -> None:
    one = tmp_path / "one.galaxy"
    two = tmp_path / "two.galaxy"
    one.write_text("void Foo() {\n}\n", encoding="utf-8")
    two.write_text("void Foo() {\n}\n", encoding="utf-8")
    monkeypatch.setattr(check_galaxy, "_galaxy_files", lambda: [one, two])
    assert check_galaxy.main() == 1
    assert "duplicate function Foo" in capsys.readouterr().out