from pathlib import Path


def test_cleanup_disables_traps_before_mutating_paths() -> None:
    script = (Path(__file__).parents[2] / "scripts/deploy-ci").read_text()
    cleanup = script.split("cleanup() {", 1)[1].split("}\ntrap cleanup", 1)[0]
    assert cleanup.index("trap - EXIT INT TERM") < cleanup.index('if [[ -d "$DEPLOYED"')


def test_candidate_build_runs_as_source_owner() -> None:
    script = (Path(__file__).parents[2] / "scripts/deploy-ci").read_text()
    # No whole-tree chown of the candidate; owner-writable generated dirs
    # are created with install -d -o/-g so the owner-scoped build inside
    # the candidate namespace can write them.
    assert 'chown -R "$owner" "$CANDIDATE"' not in script
    assert 'install -v -d -o "$owner" -g "$owner_group"' in script
    # The build itself runs through the private mount namespace where the
    # candidate is bind-mounted at /opt/workspace-ci, as the source owner
    # (never as root; root only constructs and publishes).
    assert '"$CANDIDATE_NAMESPACE" "$CANDIDATE" "$owner" "$home"' in script
    build = (Path(__file__).parents[2] / "scripts/build-candidate.sh").read_text()
    for target in ("bootstrap", "install-ci", "check-push"):
        assert f"make -C /opt/workspace-ci {target}" in build


def test_cleanup_accepts_the_explicit_build_owner() -> None:
    script = (Path(__file__).parents[2] / "scripts/deploy-ci").read_text()
    assert "current_uid -eq 0 || $current_uid -eq $candidate_uid" in script
    main = script.split("trap cleanup EXIT INT TERM", 1)[1]
    owner_index = main.index('candidate_uid=$(id -u "$owner")')
    assert owner_index < main.index("remove_candidate")


def test_preflight_does_not_start_a_nested_shell() -> None:
    makefile = (Path(__file__).parents[2] / "Makefile").read_text()
    assert "$(SHELL) -c" not in makefile


def test_coverage_data_uses_writable_generated_directory() -> None:
    makefile = (Path(__file__).parents[2] / "Makefile").read_text()
    assert 'COVERAGE_FILE="$(CURDIR)/.pytest_cache/.coverage"' in makefile
