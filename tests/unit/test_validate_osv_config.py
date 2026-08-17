import datetime as dt
from pathlib import Path

from ci.validate_osv_config import main, validate


def test_empty_config_is_valid(tmp_path: Path) -> None:
    config = tmp_path / "osv.toml"
    config.write_text("", encoding="utf-8")
    assert validate(config) == []


def test_valid_suppression_is_accepted(tmp_path: Path) -> None:
    config = tmp_path / "osv.toml"
    config.write_text(
        '[[IgnoredVulns]]\nid="CVE-2099-1234"\nreason="not reachable"\n'
        "ignoreUntil=2099-01-01\n",
        encoding="utf-8",
    )
    assert validate(config, dt.date(2098, 1, 1)) == []


def test_invalid_fields_duplicates_and_expiry_are_reported(tmp_path: Path) -> None:
    config = tmp_path / "osv.toml"
    config.write_text(
        'extra=true\n[[IgnoredVulns]]\nid="bad"\nreason=""\nignoreUntil=2020-01-01\n'
        'unknown=true\n[[IgnoredVulns]]\nid="CVE-2020-1234"\nreason="x"\n'
        'ignoreUntil="later"\n',
        encoding="utf-8",
    )
    errors = validate(config, dt.date(2026, 1, 1))
    assert any("unknown root" in error for error in errors)
    assert any("invalid id" in error for error in errors)
    assert any("reason is required" in error for error in errors)
    assert any("expired" in error for error in errors)
    assert any("unknown field" in error for error in errors)
    assert any("TOML date" in error for error in errors)


def test_malformed_config_and_cli_failure(tmp_path: Path, monkeypatch) -> None:
    config = tmp_path / "osv.toml"
    config.write_text("broken = [", encoding="utf-8")
    assert validate(config)[0].startswith("invalid OSV configuration")
    monkeypatch.setattr("sys.argv", ["validate-osv", str(config)])
    assert main() == 1


def test_missing_and_non_table_entries_are_rejected(tmp_path: Path) -> None:
    assert validate(tmp_path / "missing.toml")[0].startswith(
        "invalid OSV configuration"
    )
    config = tmp_path / "osv.toml"
    config.write_text("IgnoredVulns = [1]\n", encoding="utf-8")
    assert validate(config) == ["IgnoredVulns[0] must be a table"]


def test_duplicate_suppression_and_successful_cli(tmp_path: Path, monkeypatch) -> None:
    config = tmp_path / "osv.toml"
    entry = 'id="CVE-2099-1234"\nreason="reviewed"\nignoreUntil=2099-01-01\n'
    config.write_text(
        f"[[IgnoredVulns]]\n{entry}[[IgnoredVulns]]\n{entry}", encoding="utf-8"
    )
    assert any("duplicate id" in error for error in validate(config))
    config.write_text("", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["validate-osv", str(config)])
    assert main() == 0
