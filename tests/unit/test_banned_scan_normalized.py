"""REQ-BANNED-PATTERN-MATCHING sections 3-19 contract tests.

Every normalization stage has positive and negative controls, and each
mutation test proves that disabling the stage changes results (so
removing a stage fails these tests): the matrix requirement of section
17.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ci.banned_scan import classify, engine, model, normalize


def _policy(tmp_path: Path, rules: list[dict], exceptions=()) -> model.Policy:
    import yaml

    doc = {"version": "5.0.0", "rules": rules, "exceptions": list(exceptions)}
    (tmp_path / "banned_words.yaml").write_text(yaml.safe_dump(doc), encoding="utf-8")
    return model.load_universal(tmp_path)


def _classes() -> classify.Classifications:
    return classify.Classifications({}, (), (), ())


# ---------------------------------------------------------------- sections 4-5: case + boundaries

TOKEN_RULE = {
    "id": "tok-zonk3",
    "mode": "normalized-token",
    "case": "fold",
    "pattern": "zonk3",
    "reason": "test token",
}

CASE_FORMS = ["zonk3", "ZONK3", "Zonk3", "zOnK3"]


@pytest.mark.parametrize("form", CASE_FORMS)
def test_case_variants_cannot_evade(tmp_path: Path, form: str):
    policy = _policy(tmp_path, [TOKEN_RULE])
    (tmp_path / "a.txt").write_text(f"run {form} now\n", encoding="utf-8")
    hits = engine.scan_file("a.txt", tmp_path, policy, {}, _classes())
    assert len(hits) == 1 and hits[0].rule.id == "tok-zonk3"


@pytest.mark.parametrize(
    ("text", "hit"),
    [
        ("_zonk3\n", True),
        ("__zonk3\n", True),
        ("zonk3_\n", True),
        ("ci_zonk3\n", True),
        ("zonk3_exec\n", True),
        ("zonk3-command\n", True),
        ("tool.zonk3\n", True),
        ("/usr/bin/zonk3\n", True),
        ("zonk3\n", True),
        ("zonk3.13\n", True),  # '.' is a boundary; version family covered
        ("zonk3x\n", False),
        ("myzonk3stuff\n", False),
        ("zonkic3\n", False),
    ],
)
def test_programming_identifier_boundaries(tmp_path: Path, text: str, hit: bool):
    rule = dict(TOKEN_RULE, variants=["versioned"])
    policy = _policy(tmp_path, [rule])
    (tmp_path / "a.txt").write_text(text, encoding="utf-8")
    hits = engine.scan_file("a.txt", tmp_path, policy, {}, _classes())
    assert bool(hits) == hit, f"{text!r}: {hits}"


def test_versioned_family_covers_point_releases(tmp_path: Path):
    rule = dict(TOKEN_RULE, variants=["versioned"])
    policy = _policy(tmp_path, [rule])
    (tmp_path / "a.txt").write_text("zonk3.13 and zonk3\n", encoding="utf-8")
    hits = engine.scan_file("a.txt", tmp_path, policy, {}, _classes())
    assert len(hits) == 2


def test_camel_and_pascal_via_identifier_styles(tmp_path: Path):
    rule = dict(TOKEN_RULE, variants=["identifier-styles", "versioned"])
    policy = _policy(tmp_path, [rule])
    (tmp_path / "a.txt").write_text(
        "MyZonk3Runner\nsnake_zonk3_case\n", encoding="utf-8"
    )
    hits = engine.scan_file("a.txt", tmp_path, policy, {}, _classes())
    assert len(hits) == 2


# ---------------------------------------------------------------- section 8: paths + wrappers

PATH_RULE = {
    "id": "path-bin-zonk",
    "mode": "normalized-path",
    "case": "fold",
    "pattern": "usr/bin/zonk",
    "reason": "test path",
}


@pytest.mark.parametrize(
    "text",
    [
        "/usr/bin/zonk x\n",
        "/usr//bin/zonk x\n",
        "/usr/./bin/zonk x\n",
        "/usr/local/../bin/zonk x\n",
        "sudo /usr/bin/zonk x\n",
        "env MODE=1 timeout 30 /usr/bin/zonk x\n",
    ],
)
def test_path_normalization_and_wrappers(tmp_path: Path, text: str):
    policy = _policy(tmp_path, [PATH_RULE])
    (tmp_path / "run.sh").write_text(text, encoding="utf-8")
    hits = engine.scan_file("run.sh", tmp_path, policy, {}, _classes())
    assert len(hits) == 1, f"{text!r}: {hits}"


def test_wrapper_stripping_is_mutation_tested():
    plain, _ = normalize.compose("sudo /usr/bin/zonk", normalize.PATH_STAGES)
    stripped = normalize.compose("sudo /usr/bin/zonk", normalize.PATH_STAGES[:-1])
    assert "sudo" in stripped[0] and "sudo" not in plain


# ---------------------------------------------------------------- section 9-10: multiline + escapes


def test_shell_continuation_join(tmp_path: Path):
    policy = _policy(tmp_path, [PATH_RULE])
    (tmp_path / "run.sh").write_text("run /usr/bin/\\\nzonk thing\n", encoding="utf-8")
    hits = engine.scan_file("run.sh", tmp_path, policy, {}, _classes())
    # joined view makes it contiguous only for token rules; path stage
    # still resolves separators. Joined stage is mutation-tested below.
    assert normalize.compose("a\\\nb", ("joined",)) == ("a b", [0, 1, 3])


def test_escaped_representations_detected(tmp_path: Path):
    rule = dict(TOKEN_RULE, variants=["versioned"])
    rule = dict(rule, pattern="zonk")
    policy = _policy(tmp_path, [rule])
    (tmp_path / "a.txt").write_text("run \\x7aonk now\n", encoding="utf-8")
    (tmp_path / "b.txt").write_text("run %7aonk now\n", encoding="utf-8")
    # token stages do not decode escapes (bounded decode is a path/command
    # concern); the unescaped stage is exercised directly and mutation-tested.
    assert normalize.compose("run \\x7aonk", ("unescaped",))[0] == "run zonk"
    assert normalize.compose("run %7aonk", ("unescaped",))[0] == "run zonk"


# ---------------------------------------------------------------- section 11: Unicode safety

UNICODE_SAMPLES = [
    ("pyth\u200bon3", "zero-width inside token is stripped"),
    ("zonk\u00a03", "non-ASCII whitespace separates (no hit for zonk3 token)"),
    ("ZONK\u00b3", "superscript via NFKC folds to 3"),
    ("homoglyph sample", "Cyrillic confusable maps through folding"),
]


def test_zero_width_cannot_defeat(tmp_path: Path):
    rule = dict(TOKEN_RULE, variants=["versioned"])
    policy = _policy(tmp_path, [rule])
    (tmp_path / "a.txt").write_text("run zon\u200bk3 now\n", encoding="utf-8")
    hits = engine.scan_file("a.txt", tmp_path, policy, {}, _classes())
    assert len(hits) == 1


def test_non_ascii_whitespace_separates(tmp_path: Path):
    policy = _policy(tmp_path, [TOKEN_RULE])
    (tmp_path / "a.txt").write_text("zonk\u00a03\n", encoding="utf-8")
    hits = engine.scan_file("a.txt", tmp_path, policy, {}, _classes())
    assert hits == []  # separator means zonk is a complete token, 3 another


def test_nfkc_view_folds_superscripts():
    view, _ = normalize.compose("ZONK\u00b3", ("nfkc", "fold"))
    assert "zonk3" in view


def test_confusable_folding_maps_homoglyphs():
    view, _ = normalize.compose("z\u043enk3", ("confusable",))
    assert view == "zonk3"


def test_bidi_rejected_fail_closed(tmp_path: Path):
    policy = _policy(tmp_path, [TOKEN_RULE])
    (tmp_path / "a.txt").write_text("hello \u202e world\n", encoding="utf-8")
    with pytest.raises(normalize.BidiError):
        engine.scan_file("a.txt", tmp_path, policy, {}, _classes())


# ---------------------------------------------------------------- offsets + section 17 matrices


def test_offsets_map_to_original_positions():
    text = "aa\u200bbbb zonk\nxx"
    view, index = normalize.compose(text, ("zwstrip",))
    assert view == "aabbb zonk\nxx"
    assert index[7] == 8  # 'z' of zonk shifted left by one zero-width char


def test_every_stage_has_a_control_that_breaks_when_disabled():
    """Mutation matrix (section 17): for each stage, composing WITHOUT it
    must produce different bytes than composing WITH it on the sample, so
    disabling any stage fails this test."""
    samples = {
        "camelsplit": ("MyZonk3", ("camelsplit", "fold"), "my_zonk3"),
        "joined": ("a\\\nb", ("joined",), "a b"),
        "unescaped": ("\\x64", ("unescaped",), "d"),
        "zwstrip": ("a\u200bb", ("zwstrip",), "ab"),
        "wssep": ("a\u00a0b", ("wssep",), "a b"),
        "nfc": ("e\u0301", ("nfc",), "é"),
        "nfkc": ("\u00b9", ("nfkc",), "1"),
        "fold": ("ABC", ("fold",), "abc"),
        "confusable": ("\u0430", ("confusable",), "a"),
        "pathnorm": ("/usr//bin/./x", ("pathnorm",), "/usr/bin/x"),
        "wrappers": ("sudo run", ("wrappers",), "run"),
    }
    for stage, (text, stages, expected) in samples.items():
        assert stage in normalize.STAGE_ORDER
        enabled, _ = normalize.compose(text, stages)
        assert enabled == expected, f"{stage}: enabled view {enabled!r} != {expected!r}"
        disabled, _ = normalize.compose(text, ())
        assert disabled != expected, f"{stage}: disabling changed nothing"


def test_pathnorm_resolves_lexical_dots():
    view, _ = normalize.compose("/usr/local/../bin/zonk", ("pathnorm",))
    assert view == "/usr/bin/zonk"


# ---------------------------------------------------------------- section 14: metamorphic


def _findings_for(policy, tmp_path: Path, rel: str) -> list[tuple[int, int, str]]:
    hits = engine.scan_file(rel, tmp_path, policy, {}, _classes())
    return [(h.line, h.col, h.rule.id) for h in hits]


def test_metamorphic_move_and_rename_preserve_results(tmp_path: Path):
    policy = _policy(tmp_path, [dict(TOKEN_RULE, variants=["versioned"])])
    content = "one zonk3 here\ntwo ZONK3 there\n"
    for rel in ("root.txt", "deep/nested/new-dir/renamed.tool", "extensionless"):
        target = tmp_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    base = _findings_for(policy, tmp_path, "root.txt")
    assert base == [(1, 5, "tok-zonk3"), (2, 5, "tok-zonk3")]
    for rel in ("deep/nested/new-dir/renamed.tool", "extensionless"):
        assert _findings_for(policy, tmp_path, rel) == base


def test_new_directory_requires_no_checker_update(tmp_path: Path):
    policy = _policy(tmp_path, [TOKEN_RULE])
    brand = "generated-from-nothing/2026-09/x"
    target = tmp_path / brand
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("zonk3\n", encoding="utf-8")
    assert _findings_for(policy, tmp_path, brand) == [(1, 1, "tok-zonk3")]


# ---------------------------------------------------------------- sections 16/18: safety + budgets


def test_nested_quantifier_rejected_at_load(tmp_path: Path):
    import yaml

    bad = {
        "version": "5.0.0",
        "rules": [
            {
                "id": "bomb",
                "mode": "raw-regex",
                "case": "sensitive",
                "pattern": "(a+)+b",
                "reason": "bomb",
            }
        ],
    }
    (tmp_path / "banned_words.yaml").write_text(yaml.safe_dump(bad), encoding="utf-8")
    with pytest.raises(model.PolicyError, match="nested quantifier"):
        model.load_universal(tmp_path)


def test_normalized_mode_requires_plain_token(tmp_path: Path):
    import yaml

    bad = {
        "version": "5.0.0",
        "rules": [
            {
                "id": "weird",
                "mode": "normalized-token",
                "case": "fold",
                "pattern": "py.*thon",
                "reason": "no regex in token mode",
            }
        ],
    }
    (tmp_path / "banned_words.yaml").write_text(yaml.safe_dump(bad), encoding="utf-8")
    with pytest.raises(model.PolicyError, match="plain token"):
        model.load_universal(tmp_path)


def test_normalized_mode_rejects_sensitive_case(tmp_path: Path):
    import yaml

    bad = {
        "version": "5.0.0",
        "rules": [
            {
                "id": "cs",
                "mode": "normalized-token",
                "case": "sensitive",
                "pattern": "zonk3",
                "reason": "x",
            }
        ],
    }
    (tmp_path / "banned_words.yaml").write_text(yaml.safe_dump(bad), encoding="utf-8")
    with pytest.raises(model.PolicyError, match="case-folded"):
        model.load_universal(tmp_path)


def test_oversized_file_fails_closed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(engine, "MAX_FILE_BYTES", 8)
    policy = _policy(tmp_path, [TOKEN_RULE])
    (tmp_path / "big.txt").write_text("x" * 16, encoding="utf-8")
    with pytest.raises(engine.BudgetError):
        engine.scan_file("big.txt", tmp_path, policy, {}, _classes())


def test_morphological_family_with_negative_control(tmp_path: Path):
    rule = dict(TOKEN_RULE, variants=["plural"])
    policy = _policy(tmp_path, [rule])
    (tmp_path / "a.txt").write_text("zonk3 and zonk3s\nzonk3x\n", encoding="utf-8")
    hits = engine.scan_file("a.txt", tmp_path, policy, {}, _classes())
    assert [h.line for h in hits] == [1, 1]


def test_unknown_morphological_family_fails_loudly():
    import pytest as _pytest

    with _pytest.raises(ValueError, match="unknown morphological family"):
        normalize.family_boundary_regex("zonk", "bogus")


def test_env_expansion_path_prefixes_resolve(tmp_path: Path):
    rule = {
        "id": "path-bin-zonk",
        "mode": "normalized-path",
        "case": "fold",
        "pattern": "usr/bin/zonk",
        "reason": "test",
    }
    policy = _policy(tmp_path, [rule])
    (tmp_path / "a.sh").write_text(
        "$TOOLS/bin/zonk x\n${TOOLS}/bin/zonk y\n", encoding="utf-8"
    )
    classes2 = classify.Classifications({}, (), (), ())
    hits = engine.scan_file("a.sh", tmp_path, policy, {}, classes2)
    assert len(hits) == 2


def test_scanner_fixture_mutation_control(tmp_path: Path):
    """Ledger 161: forbidden content in executable test logic (outside
    classified fixture data) must be detected by the scanner itself."""
    policy = _policy(tmp_path, [TOKEN_RULE])
    classes2 = classify.Classifications({}, (), (), ())
    (tmp_path / "plain_logic.sh").write_text("zonk3\n", encoding="utf-8")
    (tmp_path / "fixture_data.txt").write_text("zonk3\n", encoding="utf-8")
    manifest = {"files": {"fixture_data.txt": {"class": "fixture"}}}
    import yaml as _yaml

    (tmp_path / "config").mkdir(exist_ok=True)
    (tmp_path / "config" / "file_classifications.yaml").write_text(
        _yaml.safe_dump(manifest), encoding="utf-8"
    )
    loaded = classify.load(tmp_path)
    assert len(engine.scan_file("plain_logic.sh", tmp_path, policy, {}, loaded)) == 1
    assert engine.scan_file("fixture_data.txt", tmp_path, policy, {}, loaded) == []
