"""Tests for ci.check_markdown_docs: reference extraction + validation."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from ci._md_checkers import SEVERITY_ERROR, SEVERITY_WARNING, check_reference
from ci._md_refs import parse_doc
from ci._md_slug import slugify
from ci.check_markdown_docs import run

# ── slug helper ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("text", "slug"),
    [
        ("API Reference", "api-reference"),
        ("A B C", "a-b-c"),
        ("  Padded  ", "padded"),
        ("Section 1.2", "section-1-2"),
        ("Unicode: Démo", "unicode-d-mo"),
        ("---", ""),
    ],
)
def test_slugify(text: str, slug: str) -> None:
    assert slugify(text) == slug


# ── reference extraction ────────────────────────────────────────────────────


def test_parse_doc_extracts_links_images_and_headings(tmp_path: Path) -> None:
    md = tmp_path / "doc.md"
    md.write_text(
        "# Title\n\n"
        "## Section Two\n\n"
        "See [local](./other.md), [anchor](#title), [web](https://example.com).\n\n"
        "![pic](/img/foo.png)\n",
        encoding="utf-8",
    )
    doc = parse_doc(md, md.read_text())
    assert "title" in doc.headings
    assert doc.headings["title"] == "Title"
    assert "section-two" in doc.headings

    hrefs = [(r.kind, r.href) for r in doc.references]
    assert ("link", "./other.md") in hrefs
    assert ("link", "#title") in hrefs
    assert ("link", "https://example.com") in hrefs
    assert ("image", "/img/foo.png") in hrefs


# ── individual checkers ─────────────────────────────────────────────────────


def test_check_reference_valid_anchor(tmp_path: Path) -> None:
    md = tmp_path / "x.md"
    md.write_text("# Hello\n\n[link](#hello)\n")
    doc = parse_doc(md, md.read_text())
    findings = check_reference(doc.references[0], doc, {})
    assert findings == []


def test_check_reference_broken_anchor_suggestion(tmp_path: Path) -> None:
    md = tmp_path / "x.md"
    md.write_text("# Deprecated API\n\n[link](#depricated-api)\n")
    doc = parse_doc(md, md.read_text())
    findings = check_reference(doc.references[0], doc, {})
    assert len(findings) == 1
    assert findings[0].severity == SEVERITY_ERROR
    assert "depricated-api" in findings[0].message
    assert findings[0].suggestion == "#deprecated-api"


def test_check_reference_missing_file(tmp_path: Path) -> None:
    md = tmp_path / "x.md"
    md.write_text("[gone](./nope.md)\n")
    doc = parse_doc(md, md.read_text())
    findings = check_reference(doc.references[0], doc, {})
    assert len(findings) == 1
    assert findings[0].severity == SEVERITY_ERROR
    assert "missing file" in findings[0].message


def test_check_reference_existing_file_passes(tmp_path: Path) -> None:
    (tmp_path / "sibling.md").write_text("# sibling\n")
    md = tmp_path / "x.md"
    md.write_text("[ok](./sibling.md)\n")
    doc = parse_doc(md, md.read_text())
    findings = check_reference(doc.references[0], doc, {})
    assert findings == []


def test_check_reference_cross_doc_anchor(tmp_path: Path) -> None:
    (tmp_path / "target.md").write_text("# Target\n\n## Real Section\n")
    md = tmp_path / "x.md"
    md.write_text("[ok](./target.md#real-section)\n[bad](./target.md#missing)\n")
    doc = parse_doc(md, md.read_text())
    cache: dict[Path, dict[str, str]] = {}
    assert check_reference(doc.references[0], doc, cache) == []
    bad = check_reference(doc.references[1], doc, cache)
    assert len(bad) == 1
    assert "unknown anchor" in bad[0].message


def test_check_reference_malformed_mailto(tmp_path: Path) -> None:
    md = tmp_path / "x.md"
    md.write_text("[mail](mailto:not-an-email)\n")
    doc = parse_doc(md, md.read_text())
    findings = check_reference(doc.references[0], doc, {})
    assert len(findings) == 1
    assert findings[0].severity == SEVERITY_WARNING


def test_check_reference_remote_not_invoked_when_disabled(tmp_path: Path) -> None:
    md = tmp_path / "x.md"
    md.write_text("[web](https://example.com/thing)\n")
    doc = parse_doc(md, md.read_text())
    findings = check_reference(doc.references[0], doc, {}, remote=None)
    assert findings == []


def test_check_reference_remote_invoked(tmp_path: Path) -> None:
    md = tmp_path / "x.md"
    md.write_text("[web](https://example.com/bad)\n")
    doc = parse_doc(md, md.read_text())

    calls: list[str] = []

    class FakeRemote:
        def check(self, url: str) -> tuple[bool, str]:
            calls.append(url)
            return (False, "HTTP 404")

    findings = check_reference(doc.references[0], doc, {}, remote=FakeRemote())
    assert calls == ["https://example.com/bad"]
    assert len(findings) == 1
    assert findings[0].severity == SEVERITY_ERROR


# ── end-to-end CLI ──────────────────────────────────────────────────────────


def test_cli_exit_zero_on_clean_doc(tmp_path: Path) -> None:
    md = tmp_path / "clean.md"
    md.write_text("# Hi\n\n[self](#hi)\n")
    rc = run([str(md)])
    assert rc == 0


def test_cli_exit_one_on_broken_doc(
    tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    md = tmp_path / "broken.md"
    md.write_text("# Title\n\n[gone](#nonexistent)\n[missing](./404.md)\n")
    rc = run([str(md)])
    assert rc == 1
    out = capsys.readouterr().out
    assert "nonexistent" in out
    assert "missing file" in out


def test_cli_json_output(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    md = tmp_path / "broken.md"
    md.write_text("# T\n\n[x](#missing)\n")
    rc = run([str(md), "--json"])
    assert rc == 1
    payload = json.loads(capsys.readouterr().out)
    assert "files" in payload
    file_key = next(iter(payload["files"]))
    assert payload["files"][file_key][0]["severity"] == SEVERITY_ERROR
    assert payload["files"][file_key][0]["href"] == "#missing"


def test_cli_no_network_by_default(tmp_path: Path) -> None:
    """--check-remote off → no httpx client ever instantiated."""
    md = tmp_path / "x.md"
    md.write_text("[web](https://example.invalid/will-fail)\n")
    with patch("ci.check_markdown_docs._resolve_remote", return_value=None):
        rc = run([str(md)])
    assert rc == 0


def test_cli_all_md_requires_git(tmp_path: Path) -> None:
    """--all-md outside a git repo prints error and exits."""
    with patch("ci.check_markdown_docs.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 128
        mock_run.return_value.stderr = "not a git repository"
        rc = run(["--all-md"])
    assert rc == 0  # exits cleanly with empty file list


def test_cli_all_md_scans_tracked_files(tmp_path: Path) -> None:
    """--all-md discovers .md files via git ls-files and checks them."""
    clean = tmp_path / "clean.md"
    clean.write_text("# Clean\n[self](#clean)\n")
    broken = tmp_path / "broken.md"
    broken.write_text("# Broken\n[bad](#nope)\n")

    with patch("ci.check_markdown_docs.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = "clean.md\nbroken.md\n"
        mock_run.return_value.stderr = ""
        with patch("pathlib.Path.cwd", return_value=tmp_path):
            rc = run(["--all-md"])
    assert rc == 1  # broken.md has a bad anchor


def test_cli_paths_required_without_all_md() -> None:
    """No paths and no --all-md → error."""
    rc = run([])
    assert rc == 1


def test_cli_ignore_pattern(tmp_path: Path) -> None:
    md = tmp_path / "broken.md"
    md.write_text("[gone](#nowhere)\n")
    rc = run([str(md), "--ignore", "broken.md"])
    assert rc == 0


def test_cli_fail_on_warning(tmp_path: Path) -> None:
    md = tmp_path / "warn.md"
    md.write_text("[m](mailto:malformed)\n")  # warning severity
    assert run([str(md)]) == 0  # default fail-on=error → warnings pass
    assert run([str(md), "--fail-on", "warning"]) == 1
