"""Prod-build pipeline silent-swallow catalog tests."""

from __future__ import annotations

import io
from collections.abc import Sequence
from typing import NamedTuple

import pytest
from check_silent_swallow import main


class SwallowCase(NamedTuple):
    test_id: str
    path: str
    lines: list[str]
    expect_rc: int
    grep_pattern: str | None


def _diff(path: str, lines: list[str]) -> str:
    body = "\n".join("+" + line for line in lines)
    return (
        f"diff --git a/{path} b/{path}\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
        f"@@ -0,0 +1,{len(lines)} @@\n"
        f"{body}\n"
    )


def _run_main(monkeypatch: pytest.MonkeyPatch, diff_text: str) -> tuple[int, str]:
    monkeypatch.setattr("sys.stdin", io.TextIOWrapper(io.BytesIO(diff_text.encode())))
    captured = io.StringIO()
    monkeypatch.setattr("sys.stdout", captured)
    rc = main()
    return rc, captured.getvalue()


_SHOULD_BLOCK = 1
_SHOULD_PASS = 0

BLOCKED_CASES: list[SwallowCase] = [
    SwallowCase(
        "prod_podman_build_no_plain",
        "web/scripts/prod.sh",
        ['"${PODMAN}" build -f "${WEB_DIR}/Containerfile" -t "${PROD_IMAGE}" "${PROJECTS_ROOT}"'],
        _SHOULD_BLOCK,
        "sh-podman-build-no-plain",
    ),
    SwallowCase(
        "prod_curl_silent_discard",
        "web/scripts/prod.sh",
        ['http_code="$(curl -s -o /dev/null -w \'%{http_code}\' --max-time 5 "http://127.0.0.1:8080/")"'],
        _SHOULD_BLOCK,
        "sh-curl-silent-discard",
    ),
    SwallowCase(
        "prod_make_at_silent",
        "web/Makefile",
        ["\t@./scripts/prod.sh build"],
        _SHOULD_BLOCK,
        "make-at-silent",
    ),
    SwallowCase(
        "sync_warn_return",
        "web/scripts/sync-web-content.mjs",
        [
            "    console.warn('[sync-web-content] WORKSPACE-WEB-CONTENT not found; skipping')",
            "    return",
        ],
        _SHOULD_BLOCK,
        "js-warn-skip-return",
    ),
    SwallowCase(
        "container_run_chained",
        "web/Containerfile",
        [
            "RUN test -f /workspace/CI/README.md \\",
            "    && test -f /workspace/WORKSPACE-WEB-CONTENT/landing-posts.yaml \\",
            "    && npm install \\",
            "    && npm run build",
        ],
        _SHOULD_BLOCK,
        "container-run-chained-no-trace",
    ),
    SwallowCase(
        "systemd_journal_only",
        "res/ansible/templates/wiki-prod-compose.service.j2",
        ["StandardOutput=journal"],
        _SHOULD_BLOCK,
        "systemd-journal-only",
    ),
]

PASSING_CASES: list[SwallowCase] = [
    SwallowCase(
        "prod_podman_build_plain",
        "web/scripts/prod.sh",
        [
            '"${PODMAN}" build --progress=plain -f "${WEB_DIR}/Containerfile" '
            '-t "${PROD_IMAGE}" "${PROJECTS_ROOT}"'
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "sync_hard_fail",
        "web/scripts/sync-web-content.mjs",
        [
            "    console.error('[sync-web-content] WORKSPACE-WEB-CONTENT not found')",
            "    process.exit(1)",
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "container_run_traced",
        "web/Containerfile",
        [
            "RUN set -eux \\",
            '    && echo "[wiki-build] npm install" \\',
            "    && npm install \\",
            '    && echo "[wiki-build] npm run build" \\',
            "    && npm run build",
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "prod_podman_build_comment",
        "web/scripts/prod.sh",
        ["# pipefail: podman build | tee must surface podman rc, not tee rc"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "prod_podman_build_error_echo",
        "web/scripts/prod.sh",
        [
            '    echo "ERROR: podman build failed (rc=${PIPESTATUS[0]}); see ${BUILD_LOG}" >&2',
        ],
        _SHOULD_PASS,
        None,
    ),
]


@pytest.mark.parametrize("case", BLOCKED_CASES, ids=[c.test_id for c in BLOCKED_CASES])
def test_prod_catalog_blocks(
    monkeypatch: pytest.MonkeyPatch, case: SwallowCase
) -> None:
    rc, out = _run_main(monkeypatch, _diff(case.path, case.lines))
    assert rc == case.expect_rc
    if case.grep_pattern:
        assert case.grep_pattern in out


@pytest.mark.parametrize("case", PASSING_CASES, ids=[c.test_id for c in PASSING_CASES])
def test_prod_catalog_passes(
    monkeypatch: pytest.MonkeyPatch, case: SwallowCase
) -> None:
    rc, out = _run_main(monkeypatch, _diff(case.path, case.lines))
    assert rc == case.expect_rc
    if case.grep_pattern:
        assert case.grep_pattern not in out