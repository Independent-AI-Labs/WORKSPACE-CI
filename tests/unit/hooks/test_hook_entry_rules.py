"""Applicability-aware rendered hook checks."""

from __future__ import annotations

from ci.hook_entry_rules import rendered_entry_issues


class Hook:
    def __init__(
        self,
        hook_id: str,
        kind: str,
        entry: str,
        stage: str,
        mandatory: bool = True,
        applicable_to: list[str] | None = None,
    ) -> None:
        self.id = hook_id
        self.kind = kind
        self.entry = entry
        self.stage = stage
        self.mandatory = mandatory
        self.applicable_to = applicable_to or ["any"]


def test_rust_only_hook_not_required_for_python() -> None:
    hook = Hook("cargo-fmt", "shell", "ci_check_cargo_fmt", "pre-commit", applicable_to=["rust"])
    assert rendered_entry_issues([hook], {"pre-commit": ""}, {"python"}) == []


def test_rust_only_hook_required_for_rust() -> None:
    hook = Hook("cargo-fmt", "shell", "ci_check_cargo_fmt", "pre-commit", applicable_to=["rust"])
    issues = rendered_entry_issues([hook], {"pre-commit": ""}, {"rust"})
    assert issues == ["hook 'cargo-fmt' is not rendered through the sealed runner"]


def test_non_mandatory_hook_not_required() -> None:
    hook = Hook(
        "optional",
        "shell",
        "ci_check_optional",
        "pre-commit",
        mandatory=False,
        applicable_to=["any"],
    )
    assert rendered_entry_issues([hook], {"pre-commit": ""}, {"python"}) == []


def test_inline_rejected_regardless_of_language() -> None:
    hook = Hook("bad", "shell", "bash -c 'echo hi'", "pre-commit", applicable_to=["rust"])
    issues = rendered_entry_issues([hook], {"pre-commit": ""}, {"python"})
    assert "hook 'bad' entry invokes an inline interpreter" in issues


def test_shell_inline_kind_rejected() -> None:
    hook = Hook("bad", "shell_inline", "echo hi", "pre-commit", applicable_to=["any"])
    issues = rendered_entry_issues([hook], {"pre-commit": ""}, {"python"})
    assert "hook 'bad' uses removed kind shell_inline; no inline command is executed" in issues
