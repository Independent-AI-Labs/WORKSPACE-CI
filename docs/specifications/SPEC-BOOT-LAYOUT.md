# SPEC-BOOT-LAYOUT: Platform Boot Artifacts

**Date:** 2026-08-16
**Status:** Active blank-slate specification
**Requirements:** [REQ-BOOT-LAYOUT](../requirements/REQ-BOOT-LAYOUT.md)
**Deployment:** [SPEC-DEPLOYMENT](SPEC-DEPLOYMENT.md)

## 1. Layout

```text
source checkout/
  .boot-linux/                 Linux development
  .boot-macos/                 macOS development

/opt/.workspace-ci.candidate/
  .boot-linux/                 candidate artifact

/opt/workspace-ci/
  .boot-linux/                 deployed immutable artifact
    bin/
    python/
    python-env/
    node-env/
    rust/
```

## 2. Resolution

`BOOT_NAME` is derived only from the operating system:

```text
Linux  -> .boot-linux
Darwin -> .boot-macos
```

Source-development commands resolve `BOOT_BIN` from their current checkout.
Candidate construction resolves it from `/opt/.workspace-ci.candidate`.
Protected runtime commands resolve it from `/opt/workspace-ci`.

The Makefile fixes `BOOT_NAME` and `BOOT_BIN`; environment and command-line
assignment cannot replace them for protected operations. Tools are invoked by
absolute path.

## 3. Provisioning

`make bootstrap` populates the boot directory of the tree from which it runs.
During deployment this is the candidate, never the current artifact. Bootstrap
scripts keep interpreter pools, tool environments, runtimes, and package state
inside `.boot-linux`; temporary downloads use bounded temporary paths and are
removed on exit.

Downloaded artifacts are checked against the dependency catalog before
installation. Locally built tools use locked inputs and record or verify the
resulting executable identity.

## 4. Deployment

The complete candidate boot directory is verified before atomic publication.
After publication, `/opt/workspace-ci/.boot-linux` is verified by absolute path
and sealed with the rest of the artifact. No post-publication operation writes
inside it.

## 5. Acceptance

The test matrix covers:

- Linux and macOS naming;
- source, candidate, and deployed path resolution;
- Make/environment override rejection;
- downloaded and built artifact identity;
- no HOME or sibling-project writes;
- missing-tool and missing-directory failure;
- root ownership, modes, and immutable attributes in the deployed artifact.
