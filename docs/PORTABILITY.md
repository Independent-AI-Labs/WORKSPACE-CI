# Shell Portability Guide

workspace-ci's shell layer (`lib/*.sh`, `scripts/*`) must run on any Linux
virtualization layer: bare metal, Docker, Kubernetes, PRoot, bwrap, firejail,
chroot, and any combination thereof. This document defines the portability
contract and the idioms used to enforce it.

## The Problem: Process Substitution

Bash process substitution (`< <(cmd)`, `>(cmd)`) is correct, idiomatic bash
on a normal Linux system. However, it requires opening `/dev/fd/NN` **by
path** to hand the file descriptor to the consuming command. This path-based
fd access is broken under:

- **PRoot** (ptrace-based chroot, used on Android/Termux Ubuntu): does not
  emulate `/dev/fd/` symlinks correctly.
- **bwrap / firejail** sandboxes without `/proc` mounted.
- **chroot** environments without a populated `/dev/fd/`.
- **some container runtimes** with restricted `/proc` and `/dev` layouts.

Since workspace-ci is a security product that may be installed on any of
these, the shell layer avoids process substitution entirely.

## The Solution: Temp-File-Based Capture

Two helpers in `lib/ci.sh` replace every process-substitution site:

### `ci_capture_lines <array-nameref> -- <command...>`

Runs `<command>`, captures stdout lines into `<array-nameref>` (blanks
skipped). Preserves the producer's exit code. Uses a `mktemp` temp file
(0600 perms), auto-removed on completion.

```bash
local exts=()
ci_capture_lines exts -- ci_read_yaml_list "$config" "extensions"
```

### `ci_capture_pipe <array-nameref> <snippet> [args...]]`

Like `ci_capture_lines` but runs `bash -c <snippet> _ <args>`: for
pipelines. The snippet's `$0` is `_` and `$1..` are `<args>`.

```bash
local files=()
ci_capture_pipe files 'ci_file_list "$@" | ci_filter_ext .py .sh' "$@"
```

### When neither helper fits (complex nested producers)

If the producer needs outer-scope array variables (which can't be passed
through `bash -c`), use the temp-file pattern directly:

```bash
local tmp; tmp=$(mktemp) || return 1
(
    cd "$dir" && git ls-files | while IFS= read -r p; do
        for e in "${exts[@]}"; do
            [[ "$p" == *"$e" ]] && echo "$dir/$p" && break
        done
    done
) > "$tmp" 2>/dev/null
while IFS= read -r f; do
    [[ -n "$f" ]] && files+=("$f")
done < "$tmp"
rm -f "$tmp"
```

The subshell `( ... )` inherits the parent's variables (including arrays),
so outer-scope data is accessible. The temp file decouples producer from
consumer without `/dev/fd`.

## Enforcement

### `ci_check_portable_shell` (pre-commit hook)

Scans `lib/*.sh` and `scripts/*` for process substitution patterns
(`< <(...)`, `> >(...)`). Fails on any match, pointing to the
`ci_capture_lines` / `ci_capture_pipe` helpers. Registered in
`config/required_hooks.yaml` as `check-portable-shell` (mandatory, safety,
pre-commit).

### `tests/unit/test_portable_shell.sh`

Asserts no process substitution in `lib/` or `scripts/`, and validates
`ci_capture_lines` / `ci_capture_pipe` work correctly (array population,
blank skipping, exit-code preservation, pipeline support). Runs in the
existing `tests/run_tests.sh` harness.

## What's Allowed

These idioms are portable and used freely:

- **Here-strings** (`<<< "$var"`): implemented via pipe + dup2, no
  `/dev/fd` path open. Works everywhere.
- **Command substitution** (`$(cmd)` or `` `cmd` ``): no fd path dependency.
- **Pipes** (`cmd1 | cmd2`): standard POSIX, works everywhere (the consumer
  runs in a subshell, so don't use pipes when you need to mutate outer-scope
  variables: use `ci_capture_lines` instead).
- **Temp files** (`mktemp`, `< "$tmp"`): the gold standard. Works on every
  POSIX system and every virtualization layer.
- **`mapfile` / `readarray`** from temp files: portable when reading from a
  file path, not from process substitution.

## Bash Version Requirement

`ci_capture_lines` and `ci_capture_pipe` use nameref (`local -n`), which
requires **bash 4.3+** (released 2014). This is present on every non-ancient
Linux distribution. The `make preflight` target verifies this.
