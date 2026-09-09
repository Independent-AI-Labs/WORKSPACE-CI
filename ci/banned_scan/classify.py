"""Exact-file classification manifest (config/file_classifications.yaml).

Replaces every wildcard exemption for binary, generated, lockfile,
reference, fixture, test, and policy-definition files with exact,
reviewed classifications (REQ §12.5-6, §14.6-8). Roots (test_roots,
doc_roots, doc_files) are reviewed structural facts used only by
ordinary rules' declared scope; non-exemptible rules ignore scopes and
apply to every tracked text file (REQ §14.1).

Shape (all keys required, unknown keys rejected):

    test_roots: ["tests/"]
    doc_roots: ["docs/"]
    doc_files: ["AGENTS.md"]
    files:
      "web/src/data/hook-sources.json":
        class: generated
        validated_by: "regenerate + git diff --exit-code"
        owner: workspace-ci

Classes: binary, generated, lock, reference, fixture, policy-definition.
"""

from __future__ import annotations

from pathlib import Path

import yaml

CLASSES = ("binary", "generated", "lock", "reference", "fixture", "policy-definition")
FILE_ENTRY_KEYS = {"class", "validated_by", "owner"}


class ClassificationError(Exception):
    """Manifest failed validation; the check must fail closed."""


class FileClass:
    __slots__ = ("cls", "owner", "path", "validated_by")

    def __init__(self, path: str, cls: str, validated_by: str, owner: str):
        self.path = path
        self.cls = cls
        self.validated_by = validated_by
        self.owner = owner


class Classifications:
    __slots__ = ("doc_files", "doc_roots", "files", "test_roots")

    def __init__(self, files, test_roots, doc_roots, doc_files):
        self.files = files
        self.test_roots = test_roots
        self.doc_roots = doc_roots
        self.doc_files = doc_files

    def of(self, path: str) -> FileClass | None:
        return self.files.get(path)

    @staticmethod
    def _under(path: str, roots: tuple[str, ...]) -> bool:
        for root in roots:
            segment = root.rstrip("/")
            if not segment:
                continue
            parts = path.split("/")
            if segment in parts:
                return True
        return False

    def is_test(self, path: str) -> bool:
        return self._under(path, self.test_roots)

    def is_doc(self, path: str) -> bool:
        return path in self.doc_files or self._under(path, self.doc_roots)

    def applies_to(self, scope: str, path: str) -> bool:
        if scope == "all":
            return True
        if scope == "production":
            return not self.is_test(path)
        if scope == "docs":
            return self.is_doc(path)
        return False


def load(root: Path) -> Classifications:
    return load_from(root / "config" / "file_classifications.yaml")


def _parse_file_entry(fpath: str, entry: object) -> FileClass:
    where = f"files[{fpath!r}]"
    if not isinstance(entry, dict):
        _msg = f"{where}: must be a mapping"
        raise ClassificationError(_msg)
    unknown_keys = sorted(set(entry) - FILE_ENTRY_KEYS)
    if unknown_keys:
        _msg = f"{where}: unknown key(s) {unknown_keys}"
        raise ClassificationError(_msg)
    cls = entry.get("class")
    if cls not in CLASSES:
        _msg = f"{where}: class must be one of {CLASSES}: {cls!r}"
        raise ClassificationError(_msg)
    validated_by = entry.get("validated_by", "")
    owner = entry.get("owner", "")
    if not isinstance(validated_by, str) or not isinstance(owner, str):
        _msg = f"{where}: validated_by/owner must be strings"
        raise ClassificationError(_msg)
    if cls in ("generated", "lock") and not validated_by:
        _msg = f"{where}: class {cls!r} requires validated_by"
        raise ClassificationError(_msg)
    return FileClass(str(fpath), cls, validated_by, owner)


def _roots_of(path: Path, raw: dict, key: str) -> tuple[str, ...]:
    values = raw.get(key) or []
    if not isinstance(values, list) or not all(
        isinstance(v, str) and v for v in values
    ):
        _msg = f"{path}: {key} must be a list of nonempty strings"
        raise ClassificationError(_msg)
    return tuple(values)


def load_from(path: Path) -> Classifications:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except FileNotFoundError:
        return Classifications({}, (), (), ())
    except (OSError, yaml.YAMLError) as exc:
        _msg = f"cannot load {path}: {exc}"
        raise ClassificationError(_msg) from exc
    if not isinstance(raw, dict):
        _msg = f"{path}: top level must be a mapping"
        raise ClassificationError(_msg)
    unknown = sorted(set(raw) - {"test_roots", "doc_roots", "doc_files", "files"})
    if unknown:
        _msg = f"{path}: unknown key(s) {unknown}"
        raise ClassificationError(_msg)
    raw_files = raw.get("files") or {}
    if not isinstance(raw_files, dict):
        _msg = f"{path}: 'files' must be a mapping"
        raise ClassificationError(_msg)
    files = {str(k): _parse_file_entry(str(k), v) for k, v in raw_files.items()}
    return Classifications(
        files,
        _roots_of(path, raw, "test_roots"),
        _roots_of(path, raw, "doc_roots"),
        _roots_of(path, raw, "doc_files"),
    )
