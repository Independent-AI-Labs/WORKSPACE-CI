from pathlib import Path


def test_cleanup_disables_traps_before_mutating_paths() -> None:
    script = (Path(__file__).parents[2] / "scripts/deploy-ci").read_text()
    cleanup = script.split("cleanup() {", 1)[1].split("}\ntrap cleanup", 1)[0]
    assert cleanup.index("trap - EXIT INT TERM") < cleanup.index('if [[ -d "$DEPLOYED"')


def test_candidate_build_runs_as_source_owner() -> None:
    script = (Path(__file__).parents[2] / "scripts/deploy-ci").read_text()
    assert 'chown -R "$owner" "$CANDIDATE"' not in script
    assert 'install -d -o "$owner" -g "$owner_group"' in script
    for target in ("bootstrap", "install-ci", "check-push"):
        assert f'"${{owner_env[@]}}" make -C "$CANDIDATE" {target}' in script


def test_cleanup_accepts_the_explicit_build_owner() -> None:
    script = (Path(__file__).parents[2] / "scripts/deploy-ci").read_text()
    assert "current_uid -eq 0 || $current_uid -eq $candidate_uid" in script
    main = script.split("trap cleanup EXIT INT TERM", 1)[1]
    owner_index = main.index('candidate_uid=$(id -u "$owner")')
    assert owner_index < main.index("remove_candidate")


def test_preflight_does_not_start_a_nested_shell() -> None:
    makefile = (Path(__file__).parents[2] / "Makefile").read_text()
    assert "$(SHELL) -c" not in makefile
