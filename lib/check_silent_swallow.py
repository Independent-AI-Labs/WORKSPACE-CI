#!/usr/bin/env python3
"""workspace-ci error-swallowing detector: reads unified diff on stdin.

Emits one violation per line:
  <file>:<line>: <pattern_id> -- <line content>

Exits 0 if no violations, 1 otherwise.

Pattern definitions are loaded from config/silent_swallow_patterns.yaml.
Inline patterns are pure regex applied per line. Custom and multiline
detectors are named Python functions dispatched by config reference.

Sibling modules provide file-type detection and multi-line detector logic:
  check_silent_swallow_base.py   : diff parsing + AddedLine
  check_silent_swallow_python.py : Python multi-line except detection
  check_silent_swallow_js.py     : JS/TS multi-line catch detection
  check_silent_swallow_system.py : Shell + cron file-type detection
  check_silent_swallow_ansible.py: Ansible multi-line task detection
"""

import re
import sys

import yaml
from check_silent_swallow_ansible import (
    detect_ansible_tasks,
    detect_registered_output_swallow,
    is_ansible_file,
)
from check_silent_swallow_base import AddedLine, parse_diff
from check_silent_swallow_container import (
    detect_container_multiline,
    is_container_file,
)
from check_silent_swallow_js import (
    detect_js_multiline,
    detect_js_soft_fail_multiline,
    is_js_file,
)
from check_silent_swallow_python import (
    detect_python_capture_multiline,
    detect_python_multiline,
    is_python_file,
)
from check_silent_swallow_shell import detect_shell_multiline
from check_silent_swallow_system import (
    CRON_ENV,
    CRON_LINE,
    CRON_OK,
    CRON_SHEBANG_OR_COMMENT,
    is_cron_file,
    is_shell_file,
    is_systemd_file,
)

from ci.paths import resolve_config_path

_SNIPPET_MAX = 200

_LANGUAGE_CHECKERS: list[tuple[str, object]] = [
    ("python", is_python_file),
    ("js_ts", is_js_file),
    ("shell", is_shell_file),
    ("ansible", is_ansible_file),
    ("cron", is_cron_file),
    ("container", is_container_file),
    ("systemd", is_systemd_file),
]


def _load_config() -> dict:
    config_path = resolve_config_path("silent_swallow_patterns")
    if not config_path.is_file():
        sys.stderr.write(f"Config not found: {config_path}\n")
        sys.exit(2)
    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _build_inline_by_language(
    config: dict,
) -> dict[str, list[tuple[str, re.Pattern[str]]]]:
    result: dict[str, list[tuple[str, re.Pattern[str]]]] = {}
    for p in config.get("inline_patterns", []):
        lang = p["language"]
        result.setdefault(lang, []).append((p["id"], re.compile(p["regex"])))
    return result


def _build_custom_by_language(config: dict) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for d in config.get("custom_detectors", []):
        lang = d["language"]
        result.setdefault(lang, []).append(d["detector"])
    return result


def _match_inline(
    a: AddedLine,
    text: str,
    patterns: list[tuple[str, re.Pattern[str]]],
) -> tuple[str, int, str, str] | None:
    for pid, rgx in patterns:
        if rgx.search(text):
            return (a.path, a.lineno, pid, text.rstrip())
    return None


def _check_cron_inline(
    a: AddedLine,
    text: str,
) -> tuple[str, int, str, str] | None:
    stripped = text.rstrip()
    if not stripped:
        return None
    if CRON_SHEBANG_OR_COMMENT.match(stripped):
        return None
    if CRON_ENV.match(stripped):
        return None
    if not CRON_LINE.match(stripped):
        return None
    if not CRON_OK.search(stripped):
        return (a.path, a.lineno, "cron-no-log-redirect", stripped)
    return None


def _check_inline(
    a: AddedLine,
    inline_by_lang: dict[str, list[tuple[str, re.Pattern[str]]]],
    custom_by_lang: dict[str, list[str]],
) -> tuple[str, int, str, str] | None:
    text = a.text

    for lang, checker in _LANGUAGE_CHECKERS:
        if not checker(a.path):
            continue

        patterns = inline_by_lang.get(lang)
        if patterns:
            if lang == "python" and re.match(r"^\s*#", text):
                return None
            v = _match_inline(a, text, patterns)
            if v is not None:
                return v

        for det_name in custom_by_lang.get(lang, []):
            if det_name == "_check_cron_inline":
                v = _check_cron_inline(a, text)
                if v is not None:
                    return v
        return None

    return None


def _collect_multiline_violations(
    added: list[AddedLine],
    config: dict,
) -> list[tuple[str, int, str, str]]:
    violations: list[tuple[str, int, str, str]] = []

    detector_map = {
        "detect_python_multiline": detect_python_multiline,
        "detect_python_capture_multiline": detect_python_capture_multiline,
        "detect_js_multiline": detect_js_multiline,
        "detect_js_soft_fail_multiline": detect_js_soft_fail_multiline,
        "detect_ansible_tasks": detect_ansible_tasks,
        "detect_registered_output_swallow": detect_registered_output_swallow,
        "detect_shell_multiline": detect_shell_multiline,
        "detect_container_multiline": detect_container_multiline,
    }

    lang_checker = dict(_LANGUAGE_CHECKERS)

    seen: set[str] = set()
    for entry in config.get("multiline_detectors", []):
        det_name = entry["detector"]
        if det_name in seen:
            continue
        seen.add(det_name)

        det = detector_map.get(det_name)
        if det is None:
            continue

        lang = entry.get("language", "")
        checker = lang_checker.get(lang)

        for header, pid in det(added):
            if checker is not None and not checker(header.path):
                continue
            violations.append(
                (header.path, header.lineno, pid, header.text.rstrip())
            )

    return violations


def _emit_violations(
    violations: list[tuple[str, int, str, str]],
) -> int:
    if not violations:
        return 0
    violations.sort(key=lambda v: (v[0], v[1]))
    seen_keys: set[tuple[str, int, str]] = set()
    for path, lineno, pid, text in violations:
        key = (path, lineno, pid)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        snippet = (
            text if len(text) <= _SNIPPET_MAX else text[: _SNIPPET_MAX - 3] + "..."
        )
        sys.stdout.write(f"{path}:{lineno}: {pid} -- {snippet}\n")
    return 1


def main() -> int:
    config = _load_config()

    inline_by_lang = _build_inline_by_language(config)
    custom_by_lang = _build_custom_by_language(config)

    diff_text = sys.stdin.read()
    added = list(parse_diff(diff_text))

    violations: list[tuple[str, int, str, str]] = []

    for a in added:
        v = _check_inline(a, inline_by_lang, custom_by_lang)
        if v is not None:
            violations.append(v)

    violations.extend(_collect_multiline_violations(added, config))

    return _emit_violations(violations)


if __name__ == "__main__":
    sys.exit(main())
