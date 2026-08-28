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


def test_deploy_installs_root_only_host_podman_entries() -> None:
    script = (Path(__file__).parents[2] / "scripts/deploy-ci").read_text()
    # System podman entries are admin-only: mode 0700 real files installed
    # after publication, never world-executable symlinks, and the deploy
    # fails if the entry point is not root-only.
    assert "ln -sfn" not in script
    assert "install -v -o root -g root -m 0700" in script
    assert "/usr/local/bin/podman" in script
    assert "/usr/local/lib/systemd/user-generators/podman-user-generator" in script
    publish = script.index("attr_root +i")
    entries = script.index("install -v -o root -g root -m 0700", publish)
    containers_install = script.index('"$home/.config/containers/"')
    assert containers_install < entries
    assert 'stat -c %a /usr/local/bin/podman) == 700' in script


def test_bootstrap_podman_never_links_world_exec_system_entries() -> None:
    bootstrap = (Path(__file__).parents[2] / "scripts/bootstrap-podman").read_text()
    assert 'ln -sf "${VENV_DIR}/bin/podman" "${QUADLET_PODMAN_PATH}"' not in bootstrap
    assert 'install -o root -g root -m 0700' in bootstrap
    assert 'chmod 0700 "${QUADLET_PODMAN_PATH}"' in bootstrap


def test_prod_sh_resolves_podman_only_from_sealed_artifact() -> None:
    prod = (Path(__file__).parents[2] / "web/scripts/prod.sh").read_text()
    assert 'PODMAN="$DEPLOYED_CI_ROOT/.boot-linux/bin/podman"' in prod
    assert "resolve_cmd PODMAN podman" not in prod
