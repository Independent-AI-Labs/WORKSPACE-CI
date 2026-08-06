"""Unit tests for ci/check_npm_lock_sync module."""

import json
from pathlib import Path

import ci.check_npm_lock_sync as npm_lock_sync
from ci.check_npm_lock_sync import find_drift, find_workspace_dirs, main


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def _make_repo(
    tmp_path: Path,
    *,
    manifest_spec: str = "6.0.5",
    lock_spec: str = "6.0.5",
    resolved: bool = True,
    workspaces: list[str] | None = None,
) -> Path:
    manifest: dict = {
        "name": "root",
        "dependencies": {"@vitejs/plugin-react": manifest_spec},
    }
    if workspaces is not None:
        manifest["workspaces"] = workspaces
    _write_json(tmp_path / "package.json", manifest)

    root_entry: dict = {"dependencies": {"@vitejs/plugin-react": lock_spec}}
    packages: dict = {"": root_entry}
    if resolved:
        packages["node_modules/@vitejs/plugin-react"] = {"version": lock_spec}
    _write_json(
        tmp_path / "package-lock.json", {"lockfileVersion": 3, "packages": packages}
    )
    return tmp_path


class TestFindDrift:
    """Tests for find_drift."""

    def test_no_lockfile_passes(self, tmp_path: Path) -> None:
        """A repo without package-lock.json has nothing to sync."""
        _write_json(tmp_path / "package.json", {"name": "x"})
        assert find_drift(tmp_path) == []

    def test_lock_without_manifest_is_drift(self, tmp_path: Path) -> None:
        """A lockfile with no package.json is reported."""
        _write_json(
            tmp_path / "package-lock.json", {"lockfileVersion": 3, "packages": {}}
        )
        drift = find_drift(tmp_path)
        assert len(drift) == 1
        assert "no package.json" in drift[0].message

    def test_in_sync_passes(self, tmp_path: Path) -> None:
        assert find_drift(_make_repo(tmp_path)) == []

    def test_spec_mismatch_detected(self, tmp_path: Path) -> None:
        drift = find_drift(
            _make_repo(tmp_path, manifest_spec="6.0.5", lock_spec="6.0.4")
        )
        assert any("6.0.5" in d.message and "6.0.4" in d.message for d in drift)

    def test_missing_resolved_entry_detected(self, tmp_path: Path) -> None:
        drift = find_drift(_make_repo(tmp_path, resolved=False))
        assert any("no resolved entry" in d.message for d in drift)

    def test_missing_in_lock_detected(self, tmp_path: Path) -> None:
        root = _make_repo(tmp_path)
        lock = json.loads((root / "package-lock.json").read_text())
        lock["packages"][""]["dependencies"] = {}
        _write_json(root / "package-lock.json", lock)
        drift = find_drift(root)
        assert any("missing from lockfile" in d.message for d in drift)

    def test_stale_lock_entry_detected(self, tmp_path: Path) -> None:
        root = _make_repo(tmp_path)
        lock = json.loads((root / "package-lock.json").read_text())
        lock["packages"][""]["dependencies"]["leftpad"] = "1.0.0"
        _write_json(root / "package-lock.json", lock)
        drift = find_drift(root)
        assert any("stale entry in lockfile" in d.message for d in drift)

    def test_workspace_manifest_checked(self, tmp_path: Path) -> None:
        root = _make_repo(tmp_path, workspaces=["web"])
        _write_json(
            root / "web" / "package.json",
            {"name": "web", "devDependencies": {"vite": "8.0.0"}},
        )
        lock = json.loads((root / "package-lock.json").read_text())
        lock["packages"]["web"] = {"devDependencies": {"vite": "7.0.0"}}
        lock["packages"]["node_modules/vite"] = {"version": "7.0.0"}
        _write_json(root / "package-lock.json", lock)
        drift = find_drift(root)
        assert any("vite" in d.message for d in drift)

    def test_workspace_missing_from_lock_detected(self, tmp_path: Path) -> None:
        root = _make_repo(tmp_path, workspaces=["web"])
        _write_json(root / "web" / "package.json", {"name": "web"})
        drift = find_drift(root)
        assert any("no entry in package-lock.json" in d.message for d in drift)

    def test_file_protocol_dep_skips_resolution(self, tmp_path: Path) -> None:
        root = _make_repo(
            tmp_path,
            manifest_spec="file:../vendor/pkg",
            lock_spec="file:../vendor/pkg",
            resolved=False,
        )
        assert find_drift(root) == []

    def test_no_packages_map_detected(self, tmp_path: Path) -> None:
        _write_json(tmp_path / "package.json", {"name": "x"})
        _write_json(tmp_path / "package-lock.json", {"lockfileVersion": 1})
        drift = find_drift(tmp_path)
        assert any("lockfileVersion >= 2" in d.message for d in drift)


class TestFindWorkspaceDirs:
    """Tests for find_workspace_dirs."""

    def test_glob_patterns(self, tmp_path: Path) -> None:
        for d in ("apps/a", "apps/b"):
            _write_json(tmp_path / d / "package.json", {"name": d})
        dirs = find_workspace_dirs(tmp_path, {"workspaces": ["apps/*"]})
        assert dirs == [tmp_path / "apps/a", tmp_path / "apps/b"]

    def test_dict_form_supported(self, tmp_path: Path) -> None:
        _write_json(tmp_path / "web" / "package.json", {"name": "web"})
        dirs = find_workspace_dirs(tmp_path, {"workspaces": {"packages": ["web"]}})
        assert dirs == [tmp_path / "web"]

    def test_missing_manifest_dir_skipped(self, tmp_path: Path) -> None:
        (tmp_path / "empty").mkdir()
        assert find_workspace_dirs(tmp_path, {"workspaces": ["empty"]}) == []


class TestMain:
    """Tests for the CLI entry point."""

    def test_no_lockfile_exits_zero(self, tmp_path: Path, capsys) -> None:
        assert main([str(tmp_path)]) == 0
        assert "nothing to check" in capsys.readouterr().out

    def test_in_sync_exits_zero(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setattr(
            npm_lock_sync,
            "_validate_with_npm",
            lambda root, lock: None,
        )
        assert main([str(_make_repo(tmp_path))]) == 0

    def test_npm_resolver_drift_exits_one(
        self, tmp_path: Path, monkeypatch, capsys
    ) -> None:
        monkeypatch.setattr(
            npm_lock_sync,
            "_validate_with_npm",
            lambda root, lock: npm_lock_sync.LockDrift(
                str(lock),
                "npm ci --dry-run failed (exit 1): Invalid: lock file package drift",
            ),
        )
        assert main([str(_make_repo(tmp_path))]) == 1
        assert "npm ci --dry-run failed" in capsys.readouterr().out

    def test_drift_exits_one_with_fix_hint(self, tmp_path: Path, capsys) -> None:
        root = _make_repo(tmp_path, manifest_spec="6.0.5", lock_spec="6.0.4")
        assert main([str(root)]) == 1
        out = capsys.readouterr().out
        assert "npm install --package-lock-only" in out
