# End-to-End Security & Safety Audit

**Date:** 2026-07-04
**Auditor:** opencode agent (6 parallel audit agents)
**Scope:** All 325 tracked files in the `WORKSPACE-CI` repository -- Python (47 files), TypeScript/React (149 files), Shell scripts (23 files), Makefiles (2), Config YAML (30 files), Data JSON (7 files), Rust (0 project files -- only vendored stdlib in git-ignored `.boot-linux/`)
**Methodology:** Six parallel explore agents audited: (1) Web application security, (2) Python CI scripts, (3) Shell scripts, (4) Config and git hooks, (5) Data exposure and dependencies, (6) Rust code. Each agent read all relevant files, traced data flows, and cross-referenced findings. Key findings were independently verified by direct grep/read against the source.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Severity Roll-Up](#2-severity-roll-up)
3. [HIGH Findings](#3-high-findings)
4. [MEDIUM Findings](#4-medium-findings)
5. [LOW Findings](#5-low-findings)
6. [INFO Findings](#6-info-findings)
7. [Positive Security Confirmations](#7-positive-security-confirmations)
8. [XSS Sink Audit -- Complete `dangerouslySetInnerHTML` Trace](#8-xss-sink-audit-complete-dangerouslysetinnerhtml-trace)
9. [Server-Component Input Handling Audit](#9-server-component-input-handling-audit)
10. [Dependency Security Audit](#10-dependency-security-audit)
11. [Git History & Secrets Audit](#11-git-history-secrets-audit)
12. [Remediation Priority Matrix](#12-remediation-priority-matrix)

---

## 1. Executive Summary

This audit examined every tracked file in the `WORKSPACE-CI` repository for security vulnerabilities across web application, Python backend, shell scripts, configuration, git hooks, data exposure, and dependency supply-chain dimensions.

**No Critical vulnerabilities were found. No secrets, credentials, API keys, private keys, or connection strings exist in source code, data files, build artifacts, or git history.**

The codebase demonstrates strong security hygiene in several areas:

- All 17 YAML load sites use `yaml.safe_load` (zero unsafe loaders)
- All 4 Python `subprocess` sites use list-form arguments with `shell=False` (zero `shell=True`)
- No `eval()`, `exec()`, `pickle`, `marshal`, `importlib`, or `tempfile` in project Python
- No process substitution in shell scripts (ban is enforced and verified)
- No hardcoded credentials anywhere in the codebase
- No bare `except:` or `except Exception: pass` in Python
- DOMPurify sanitizes all markdown before `dangerouslySetInnerHTML`
- All 672 npm packages carry integrity hashes
- No typosquatting packages detected
- `.env` files correctly gitignored
- No build artifacts or binaries tracked in git
- Git history is clean (no secrets ever committed and removed)

The findings below represent defense-in-depth gaps and architectural weaknesses that should be addressed in priority order.

---

## 2. Severity Roll-Up

| Severity | Count | Categories |
|----------|-------|------------|
| Critical | 0 | -- |
| High | 6 | No server-side CI, vulnerable `next`, unlimited feedback API, `curl|sh`, no SHA for `uv`, unenforced Node pinning |
| Medium | 12 | XSS in breadcrumbs, no CSP, SSRF, unsanitized feedback, config command injection, blanket exemptions, no lockfile, dev server exposure, sudo guard install, no CSRF, low coverage floor, incomplete gitignore |
| Low | 14 | Dead-code path traversal, unescaped quotes, predictable session IDs, local-outside-function, option injection, narrow blocklist, etc. |
| Info | 10 | No auth (by design), no client secrets, config exposure (by design), adequate path defenses, no JSON injection, all sinks traced, all inputs validated, no Rust code, clean Python hygiene, clean git history |

---

## 3. HIGH Findings

### H-1. No server-side CI enforcement -- all hooks bypassable via `--no-verify`

**Severity:** HIGH
**Files:** `.git/hooks/pre-commit`, `.git/hooks/pre-push`, `.git/hooks/commit-msg` (all `711` permissions)
**Status:** Verified

**Description:**

The repository has zero server-side CI infrastructure. There is no `.github/workflows/` directory, no GitHub Actions, no `pre-receive` hook, and no evidence of branch protection rules. Every security gate -- secret scanning (gitleaks), banned words detection, blocked co-authored commits, coverage thresholds, dependency pinning, silent-swallow detection, file-length checks, markdown link validation -- lives exclusively in local client-side git hooks.

`git commit --no-verify` and `git push --no-verify` silently skip ALL of these checks. The entire security model collapses to developer honesty.

**Impact:**

A contributor can:
- Push secrets (gitleaks is bypassed)
- Push co-authored commits (commit-msg check is bypassed)
- Push unpinned or vulnerable dependencies (dep checker is bypassed)
- Push code with banned patterns (banned-words check is bypassed)
- Push code that silently swallows errors (silent-swallow check is bypassed)
- Lower coverage thresholds (coverage devolution guard is bypassed)

The companion `WORKSPACE-GUARD` (`scripts/bootstrap-workspace-guard`) is a wrapper that blocks destructive commands (`git reset --hard`, `git push --force`, `git commit --amend`), but it does NOT block `--no-verify`. The guard's own documentation states "root can bypass (soft barrier)."

**Remediation:**

Add GitHub Actions (or equivalent CI) that mirror the local hooks as required status checks on `main` and all PR branches. Enable branch protection requiring these checks to pass before merge. The CI pipeline should run:
1. `make lint` (ruff)
2. `make type-check` (mypy)
3. `make test` (pytest + bash unit + integration)
4. `ci_check_banned_words`
5. `ci_check_silent_swallow`
6. `gitleaks` (secret scanning)
7. `ci_check_dependency_versions`
8. `ci_check_coverage_thresholds_no_devolution`
9. `ci_check_required_hooks_present`
10. `ci_check_markdown_docs --check-remote`

---

### H-2. Vulnerable `next` framework (16 known CVEs)

**Severity:** HIGH
**File:** `web/package.json:36` -- `"next": "16.1.7"`
**Status:** Verified via `npm audit`

**Description:**

The pinned `next@16.1.7` is affected by approximately 16 security advisories (CVSS up to 7.5 High). The full list from `npm audit`:

| Advisory | Description | CVSS |
|----------|-------------|------|
| GHSA-q4gf-8mx6-v5v3 | DoS with Server Components | 7.5 High |
| GHSA-8h8q-6873-q5fj | DoS with Server Components (variant) | 7.5 High |
| GHSA-26hh-7cqf-hhc6 | Middleware/Proxy bypass via segment-prefetch routes (incomplete fix) | 7.5 High |
| GHSA-492v-c6pp-mqqv | Middleware/Proxy bypass via dynamic route param injection | 7.5 High |
| GHSA-267c-6grr-h53f | Middleware/Proxy bypass via segment-prefetch routes | 7.5 High |
| GHSA-36qx-fr4f-26g5 | Middleware/Proxy bypass in Pages Router using i18n | 7.5 High |
| GHSA-c4j6-fc7j-m34r | SSRF via WebSocket upgrades | High |
| GHSA-h64f-5h5j-jqjh | DoS in Image Optimization API | High |
| GHSA-ffhc-5mcf-pf4q | XSS in App Router using CSP nonces | High |
| GHSA-gx5p-jg67-6x7h | XSS in beforeInteractive scripts with untrusted input | High |
| GHSA-3g8h-86w9-wvmq | Cache poisoning via middleware/proxy redirects | Moderate |
| GHSA-vfv6-92ff-j949 | Cache poisoning via RSC cache-busting collisions | Moderate |
| GHSA-wfc6-r584-vfw7 | Cache poisoning in RSC responses | Moderate |
| GHSA-mg66-mrh9-m8jx | DoS via connection exhaustion with Cache Components | High |
| GHSA-qx2v-qp2m-jg93 | PostCSS XSS via unescaped `</style>` (transitive via `next`) | Moderate |

**Impact:**

Even though this app currently has no middleware, the framework-level bypasses still apply if middleware is ever added. The XSS CVEs are relevant given the multiple `dangerouslySetInnerHTML` sinks in the app (though the app uses no CSP nonces currently, which mutes GHSA-ffhc-5mcf-pf4q specifically). The cache-poisoning CVEs could affect any deployed instance.

**Remediation:**

Upgrade to `next@16.2.10` (or latest 16.2.x):
```bash
cd web && npm audit fix --force
```
This also resolves the transitive `postcss` XSS advisory.

---

### H-3. Unauthenticated, unlimited feedback API (disk DoS / vote manipulation)

**Severity:** HIGH
**Files:**
- `web/src/app/api/feedback/route.ts:9-37` (POST handler)
- `web/src/lib/feedback-loader.ts:58-103` (`saveFeedback`)
**Status:** Verified

**Description:**

The POST `/api/feedback` endpoint is completely unauthenticated and unlimited. The handler accepts a JSON body with `targetType`, `targetId`, `vote`, and `comment`. Every call appends a new `FeedbackEntry` object (with `timestamp`, `sessionId`, `comment`) to a JSON file and rewrites the entire file via `writeFileSync` (synchronous, blocks the Node.js event loop).

Specific deficiencies:

1. **No rate limiting** -- no per-IP, per-session, or global throttle
2. **No entry count cap** -- `data.entries` array grows without bound; a single `targetId` file can be made arbitrarily large
3. **No comment length validation** -- `comment` is accepted as any string, unbounded
4. **No authentication / session binding** -- the `x-session-id` header defaults to `api-${Date.now()}` (line 21), so every anonymous request is treated as a new session. The "toggle vote" logic in `saveFeedback` (lines 86-97) never deduplicates anonymous abuse because every request has a unique session ID
5. **Synchronous file writes** -- `writeFileSync` blocks the event loop; concurrent bursts cause effective DoS
6. **Predictable session ID** -- `api-${Date.now()}` is timestamp-based and trivially guessable

**Impact:**

An attacker can:
- Fill disk by repeatedly POSTing large comments (unbounded file growth)
- Inflate or deflate vote counts arbitrarily (no dedup for anonymous sessions)
- Block the Node event loop with concurrent write bursts (synchronous I/O)
- Pollute stored data with arbitrary strings (no validation)

**Code trace:**

```typescript
// route.ts:9-37
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { targetType, targetId, vote, comment } = body as Partial<FeedbackSubmission>;
  // targetType validated against allowlist (good)
  // targetId sanitized via sanitizeId (good -- prevents path traversal)
  // vote validated as 'up' | 'down' (good)
  // comment: NO length check, NO sanitization, NO control-char stripping
  const sessionId = request.headers.get('x-session-id') ?? `api-${Date.now()}`;
  // sessionId: NO validation, NO format check, predictable default
  await saveFeedback({ targetType, targetId, vote, comment }, sessionId);
  // saveFeedback appends to entries[] array and rewrites entire file via writeFileSync
}
```

```typescript
// feedback-loader.ts:92-100
const data: FeedbackFile = existing ? JSON.parse(content) : { entries: [] };
data.entries.push({ vote, comment, timestamp: new Date().toISOString(), sessionId });
// entries grows without bound -- no cap
writeFileSync(feedbackPath, JSON.stringify(data, null, 2));
// synchronous write -- blocks event loop
```

**Remediation:**

1. Add rate limiting (per-IP, e.g. 10 requests/minute via a simple in-memory or Redis-backed limiter)
2. Cap `comment` length: `if (comment && comment.length > 500) return 400`
3. Cap `entries` array growth: `if (data.entries.length > 1000) data.entries = data.entries.slice(-1000)`
4. Switch to `fs.promises.writeFile` for async I/O
5. Generate `sessionId` server-side via `crypto.randomUUID()` instead of trusting the header
6. Add `Origin` / `Sec-Fetch-Site` same-origin check (also fixes M-10)

---

### H-4. `curl | sh` install pattern (no checksum verification)

**Severity:** HIGH
**File:** `Makefile:52-53`
**Status:** Verified

**Description:**

```makefile
@if ! command -v cargo > /dev/null 2>&1; then \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal; fi
```

This is the classic "pipe-to-shell" anti-pattern. The rustup installer is streamed directly from `https://sh.rustup.rs` into `sh` with no integrity verification (no checksum, no GPG signature check). While TLS (`--tlsv1.2`) protects the transport, any compromise of the `sh.rustup.rs` origin, CDN, or a TLS-stripping MITM (in environments with misconfigured CA stores) yields arbitrary code execution as the invoking user.

The repository's own `scripts/bootstrap-rust` script (lines 175-186) at least downloads to a temp file and runs `rustup-init.sh` rather than streaming raw bytes through a pipe -- but the `Makefile` path uses the worse pattern.

**Impact:**

Supply-chain compromise of the rustup distribution endpoint results in arbitrary code execution on the developer's machine during `make init`.

**Remediation:**

Replace the `Makefile` `curl | sh` with a call to `scripts/bootstrap-rust` (which downloads to a temp file first). Add SHA256 checksum verification by fetching the `.sha256` sidecar file from the trusted GitHub release URL at runtime (e.g. `https://sh.rustup.rs` does not publish sidecars, so download the installer to a temp file and compute its SHA256, then verify against a sidecar published alongside the release if available). Do NOT hardcode hash values in the script -- hardcoded hashes go stale on version bumps and are operationally fragile. The correct pattern is runtime fetch-and-verify from the release origin.

---

### H-5. `uv` binary installed with no SHA256 verification (placeholder checksums)

**Severity:** HIGH
**File:** `scripts/bootstrap-uv:47-51, 138-161`
**Status:** Verified

**Description:**

The `uv` package manager binary is downloaded over HTTPS from GitHub releases, but SHA256 verification is disabled by default. The environment variable `UV_VERIFY_SHA256` defaults to `0` (off). The shipped checksum values are explicitly invalid placeholders:

```bash
# scripts/bootstrap-uv:47-51
declare -A UV_SHA256=(
    ["x86_64-unknown-linux-gnu"]="00000000000000000000000000000000000000000000000000000000000000aa}"
    ["aarch64-unknown-linux-gnu"]="00000000000000000000000000000000000000000000000000000000000000bb}"
)
```

When verification is disabled (the default), the script logs:
```
SHA256 verification SKIPPED (set UV_VERIFY_SHA256=1 to enforce)
```

If `UV_VERIFY_SHA256=1` is set with the placeholder checksums, the script correctly refuses to install:
```
UV_VERIFY_SHA256=1 but no SHA pin for arch=$arch; refusing to install
```

This is inconsistent with `scripts/bootstrap-gitleaks` (lines 25-30, 109-125), which enforces SHA256 checksums by default -- however, `bootstrap-gitleaks` **hardcodes** the hash values in the script source, which is itself a suboptimal pattern: hardcoded hashes go stale on version bumps and require manual updates. The correct approach for ALL bootstrap scripts is to fetch the `.sha256` sidecar file from the trusted GitHub release URL at runtime and verify against it, eliminating hardcoded hashes entirely.

**Impact:**

A compromised GitHub release CDN, CDN cache poisoning, or MITM in environments with misconfigured TLS could serve a trojaned `uv` binary. Since `uv` is the core Python dependency-management tool, a compromised `uv` could inject malicious dependencies into every Python project managed by this CI tooling.

**Remediation:**

1. Remove all hardcoded SHA256 variables (`UV_SHA256_X64`, `UV_SHA256_ARM64`) and the `UV_VERIFY_SHA256` opt-in toggle entirely
2. After downloading the tarball, fetch the `.sha256` sidecar file from the same GitHub release URL (e.g. `https://github.com/astral-sh/uv/releases/download/0.11.23/uv-x86_64-unknown-linux-gnu.tar.gz.sha256`)
3. Parse the expected hash from the sidecar, compute `sha256sum` of the downloaded tarball, and compare -- refuse to install on mismatch
4. Verification is ON by default (no opt-out); the sidecar is the trusted source of truth, fetched from the same release origin as the tarball
5. Apply this same runtime sidecar-fetch pattern to `bootstrap-gitleaks` and `bootstrap-rust` -- NO bootstrap script should hardcode hash values

---

### H-6. `web/package.json` uses caret ranges -- Node dependency pinning not enforced

**Severity:** HIGH
**File:** `web/package.json:23-64`
**Status:** Verified

**Description:**

22 dependencies in `web/package.json` use caret (`^`) version ranges, including security-relevant packages:

| Package | Range | Security relevance |
|---------|-------|--------------------|
| `dompurify` | `^3.2.0` | XSS sanitization |
| `isomorphic-dompurify` | `^2.2.0` | XSS sanitization (SSR) |
| `marked` | `^17.0.6` | Markdown parsing (raw HTML passthrough) |
| `js-yaml` | `^4.1.0` | YAML parsing |
| `gray-matter` | `^4.0.3` | Frontmatter parsing |
| `fuse.js` | `^7.1.0` | Search |
| `@codemirror/*` | `^6.x` (6 packages) | Code editor |
| `next` | `16.1.7` | Framework (exact, but see H-2) |
| `react` / `react-dom` | `19.2.4` | UI library (exact) |
| `shiki` | `4.3.1` | Syntax highlighting (exact) |

The `package-lock.json` pins currently-resolved versions, but caret ranges allow automatic minor/patch updates on the next `npm install`. A compromised or yanked minor release would be silently adopted.

The repository's own `ci/check_dependency_versions.py` enforces strict pinning for Python dependencies (`==` pins, rejects `^`, `~`, wildcards -- see `_NPM_STRICT_RE` line 243), but:

1. `config/required_hooks.yaml:224-232` marks `check-dependency-versions` as `mandatory: false` (exemptable)
2. The checker runs only at pre-push, not pre-commit
3. Either the checker does not scan `web/package.json` by default, or the hook would fail on every commit (it does not appear to)

Net effect: **Node dependency pinning is not enforced** for the wiki app, undermining the repo's stated "strict pinning + latest" policy.

**Remediation:**

1. Replace all `^` ranges in `web/package.json` with exact version pins
2. Move `check-dependency-versions` to pre-commit (not just pre-push)
3. Set `mandatory: true` in `required_hooks.yaml`
4. Extend the checker to enforce exact pins in `web/package.json` (no `^`/`~`/`*`)

---

## 4. MEDIUM Findings

### M-1. JSON-LD script injection in breadcrumbs (XSS)

**Severity:** MEDIUM
**File:** `web/src/components/wiki/WikiBreadcrumbs.tsx:45-47`
**Status:** Verified

**Description:**

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(crumbs)) }}
/>
```

`crumbs` are built from `usePathname()` (line 40). `getBreadcrumbs` (lines 7-24) splits the path into segments and uses each segment as a label. `JSON.stringify` does **not** escape `<`, so a path segment literal `</script><script>...` survives into the rendered `<script>` block and breaks out of the element.

**Reachability:**

A URL like `/%3C%2Fscript%3E%3Cscript%3Ealert(document.domain)%3C%2Fscript%3E` decodes to a pathname whose segment is `</script><script>alert(document.domain)</script>`. This matches the catch-all `[slug]` route (`app/[slug]/page.tsx`). `getProjectBySlug` returns undefined, so `notFound()` is called, but `WikiBreadcrumbs` is rendered by `WikiShell` which is the layout chrome. Client-side `usePathname()` still reflects the attacker-controlled path. The injected script executes in the page origin.

**Remediation:**

Escape `<`, `>`, and `&` when serializing JSON into an HTML `<script>`:
```typescript
const jsonLd = JSON.stringify(buildJsonLd(crumbs))
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');
```

---

### M-2. No Content Security Policy / no security headers

**Severity:** MEDIUM
**Files:**
- `web/next.config.mjs:7-10` -- config only sets `reactStrictMode` and `images`; no `headers()` field
- No `middleware.ts` exists anywhere under `web/`
**Status:** Verified

**Description:**

There is no CSP, no `X-Content-Type-Options`, no `X-Frame-Options`/`frame-ancestors`, no `Referrer-Policy`, no `Strict-Transport-Security`, no `Permissions-Policy`. Given the multiple `dangerouslySetInnerHTML` sinks in the app, a CSP would provide meaningful defense-in-depth against any future XSS bypass (e.g., an mXSS in DOMPurify, or the breadcrumb injection in M-1).

**Remediation:**

Add a static `headers()` export in `next.config.mjs`:
```javascript
export default {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};
```

---

### M-3. SSRF via `--check-remote` with redirect-following and no host allowlist

**Severity:** MEDIUM
**File:** `ci/_md_http_client.py:72` -- `follow_redirects=True`, no `allow_hosts`/denylist
**Status:** Verified

**Description:**

When `--check-remote` is enabled (it is -- `.pre-commit-config.yaml:129`), the markdown docs validator HEAD/GET-probes every `http(s)` URL found in repository markdown. `follow_redirects=True` means a link to an attacker-controlled server can redirect the probe to internal targets:

- `http://169.254.169.254/` (AWS metadata endpoint)
- `http://localhost:8080/admin` (internal services)
- RFC1918 addresses (`10.x.x.x`, `172.16.x.x`, `192.168.x.x`)

Although only the HTTP status is recorded (not body content), an attacker submitting a PR could:
1. Fingerprint internal services' reachability
2. Trigger side-effecting internal GET endpoints
3. Use timing-based exfiltration

There is no `allow_hosts`/`deny_hosts` filter, no `trust_env` restriction, and no private-IP blocking.

**Remediation:**

Add an IP blocklist filter (block `127.0.0.0/8`, `169.254.0.0/16`, `10/8`, `172.16/12`, `192.168/16`, `::1`, `fc00::/7`) via httpx's transport/mount gating. Consider disabling `follow_redirects` for untrusted inputs. Add a configurable host allowlist in `config/markdown_docs.yaml`.

---

### M-4. Feedback comments stored unsanitized (latent stored XSS)

**Severity:** MEDIUM
**Files:**
- `web/src/app/api/feedback/route.ts:17,32` -- `comment` accepted as any string
- `web/src/lib/feedback-loader.ts:92-100` -- stored verbatim via `JSON.stringify`
**Status:** Verified

**Description:**

`comment` is not length-checked, not sanitized, and not HTML-escaped before storage. Currently comments are **never rendered back** as HTML anywhere (`FeedbackAggregate.tsx` only shows counts; the GET endpoint only returns counts; the client `useFeedback` never displays stored comments), so there is no present XSS path. However:

- The stored data is untrusted and persists on disk indefinitely. If any future feature renders comments (e.g., an admin/moderation view), this becomes a stored XSS reservoir.
- Because the file is `*.json` served only via the API (counts only), direct file-fetch is not exposed, but the `data/feedback` directory under `process.cwd()` is adjacent to the app.

`sessionId` (from the `x-session-id` request header, default `api-${Date.now()}`) is also stored verbatim with no length cap.

**Remediation:**

Validate `typeof comment === 'string' && comment.length <= 500`; strip control characters. Consider storing an HMAC or hash of `sessionId` rather than the raw header value.

---

### M-5. `bash -c "$cmd"` in coverage checker (command injection from config)

**Severity:** MEDIUM
**File:** `lib/checks_coverage.sh:158`
**Status:** Verified

**Description:**

```bash
# lib/checks_coverage.sh:154-161
if [[ "$runner" == vitest* ]]; then
    # vitest needs cd+&&; use bash -c. All others: direct execution.
    timeout --signal=TERM --kill-after=10s "${timeout_s}s" bash -c "$cmd" || rc=$?
else
    timeout --signal=TERM --kill-after=10s "${timeout_s}s" $cmd || rc=$?
fi
```

`$cmd` is built from `coverage_thresholds.yaml`'s `runner` field (line 140: `cmd="${runner} ${cov_part} ${path_part}..."`). If the YAML config is maliciously modified, arbitrary commands execute via `bash -c "$cmd"`. The unquoted `$cmd` in the `else` branch also allows word-splitting from config values.

Config is currently trusted (local, developer-controlled), but the pattern is an injection sink. A compromised `coverage_thresholds.yaml` could execute arbitrary shell commands.

**Remediation:**

Use array-form execution instead of `bash -c "$cmd"`, or validate the `runner` field against an allowlist of known test runners (`pytest`, `vitest`, `cargo test`, etc.) before building the command.

---

### M-6. Blanket `'.*'` banned-words exemptions for config files

**Severity:** MEDIUM
**File:** `config/banned_words_exceptions.yaml:5-10`
**Status:** Verified

**Description:**

```yaml
- pattern: '.*'
  paths: ['config/.*\.yaml$', '\.pre-commit-config\.yaml$', 'AGENTS\.md$']
- pattern: '.*'
  paths: ['docs/AUDIT-.*\.md$']
```

The `'.*'` wildcard means **every** banned pattern is exempt for any file under `config/*.yaml`, `.pre-commit-config.yaml`, `AGENTS.md`, and `docs/AUDIT-*.md`. Intent (these files define the banned patterns) is reasonable, but the scope is too broad:

- Adding a new `config/secrets.yaml` or `config/deploy.yaml` would be **silently exempt from all banned-word checks** including `/home/` hardcoding, `:latest`, `unsafe {`, `# type: ignore`, `@dataclass`, `dict[...Any]`.
- A config YAML that legitimately should be flagged for a hardcoded `/home/user` path or a `:latest` container tag would pass.

**Remediation:**

Replace `'.*'` with explicit per-pattern entries. The file already lists approximately 30 specific exemptions for `docs/`; the blanket wildcard is unnecessary.

---

### M-7. `uv.lock` gitignored -- no transitive lock committed

**Severity:** MEDIUM
**File:** `.gitignore:7`
**Status:** Verified

**Description:**

Without a committed lockfile, `uv sync` resolves transitive dependencies fresh on each install. The `pyproject.toml` `==` pins cover direct dependencies, but transitive dependencies resolve to latest compatible versions. For a CI/governance tool, a committed lock is the baseline expectation for reproducibility and supply-chain integrity.

**Remediation:**

Remove `uv.lock` from `.gitignore` and commit it to the repository.

---

### M-8. Dev server binds `0.0.0.0` with no sandbox hardening

**Severity:** MEDIUM
**File:** `web/res/wiki-ci-dev.service.tmpl`
**Status:** Verified

**Description:**

```
Environment="WIKI_DEV_HOST=0.0.0.0"
ExecStart=__NODE__ scripts/dev-single.mjs
Restart=always
LimitNOFILE=65536
MemoryHigh=4G / MemoryMax=6G
```

- **Binds all interfaces** (`0.0.0.0:3001`) -- a Next.js dev server (HMR, source-map endpoints, no production hardening) is network-exposed. On a shared VM this is reachable by other tenants/users.
- Resource limits are present (good -- `MemoryMax=6G`, `LimitNOFILE`), but there is no `SystemCallFilter`/`SystemCallArchitectures`, no `PrivateTmp`, no `NoNewPrivileges=true`, no `ProtectSystem`/`ProtectHome`, no `RestrictAddressFamilies`.
- Runs as a `--user` service (not root) via `web/Makefile:56-69` -- correct, avoids root.
- `Restart=always` + `StartLimitBurst=10` -- a crashing untrusted dependency could trigger a restart loop.

**Remediation:**

Default to `127.0.0.1` and require explicit opt-in for `0.0.0.0`. Add systemd hardening directives: `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=strict`, `ProtectHome=true`, `RestrictAddressFamilies=AF_INET AF_UNIX`.

---

### M-9. `sudo` runs guard installer that rewrites `/usr/bin/git`

**Severity:** MEDIUM
**Files:** `Makefile:251`, `scripts/bootstrap-workspace-guard`
**Status:** Verified

**Description:**

The guard install script uses `dpkg-divert` to relocate `/usr/bin/git` to `/usr/bin/git.original`, replaces it with a capability-enabled guard binary (`setcap cap_dac_override+ep`), sets `chattr +i` (immutable), installs an apt hook at `/etc/apt/apt.conf.d/99workspace-guard`, and `chmod 000` on bypass paths (`/snap/bin/git`, `/usr/local/bin/git`).

This is consequential system mutation invoked via `$(SUDO)` in the Makefile. In a non-interactive CI, the `-t 0` confirmation prompt is skipped and the script proceeds without human confirmation.

**Remediation:**

Ensure CI cannot reach `install-guard` without an explicit gate. Document the trust boundary clearly. Consider requiring an explicit `--i-understand-the-consequences` flag for non-interactive use.

---

### M-10. No CSRF protection on feedback POST

**Severity:** MEDIUM (rated Low by web agent, upgraded for completeness)
**File:** `web/src/app/api/feedback/route.ts:9`
**Status:** Verified

**Description:**

The POST sends `Content-Type: application/json` with no CSRF token and relies on no cookies (the app uses no auth). Because `application/json` triggers a CORS preflight and Next.js API routes emit no `Access-Control-Allow-Origin` by default, a cross-origin browser is blocked from completing the request -- accidental CSRF is largely mitigated. However there is no explicit `Origin`/`Sec-Fetch-Site` check, and if CORS headers are ever added this becomes fully exploitable.

**Remediation:**

Validate `request.headers.get('origin') === request.nextUrl.origin` (or check `Sec-Fetch-Site: same-origin`) before mutating state.

---

### M-11. Integration coverage floor at 5% with measurement disabled

**Severity:** MEDIUM
**File:** `config/coverage_thresholds.yaml:14-19`
**Status:** Verified

**Description:**

```yaml
integration:
  path: tests/integration
  min_coverage: 5
  coverage: "false"   # measurement disabled
```

`coverage: "false"` means `--no-cov` is appended (`lib/checks_coverage.sh:82-86`); the 5% floor only applies via `Makefile:170` (`--cov-fail-under=5`) at pre-push. A single trivial integration test touching one `ci/__init__.py` import clears 5%. New untested integration code paths face no real coverage pressure.

Additionally, the no-devolution guard (`lib/checks_coverage.sh:290-295`) **skips the threshold comparison when a suite's `path` changes**. To lower a threshold, rename `tests/unit` to `tests/unit-v2` in the YAML: the devolution detector treats it as "restructured" and accepts any new value.

**Remediation:**

Raise the integration floor incrementally. Enable coverage measurement when feasible. Lock path changes behind an explicit override key.

---

### M-12. `.gitignore` missing key/PEM/DB/log patterns

**Severity:** MEDIUM
**Files:** `.gitignore`, `web/.gitignore`
**Status:** Verified

**Description:**

Missing entries that could allow accidental secret/artifact commits:
- `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `*.crt` -- `config/sensitive_files.yaml` defines these as sensitive at-commit time, but `.gitignore` does not pre-empt them. The block-sensitive-files hook is the only barrier, and it is bypassable via `--no-verify` (see H-1).
- `*.sqlite`, `*.db`, `*.sqlite3` -- local DBs
- `*.log`, `*.pid` -- runtime artifacts
- `web/.env*` -- `web/.gitignore` omits `.env`; only the root `.gitignore` has `.env`, and `.gitignore` rules do not cascade downward reliably for nested `web/.env.local`
- `.vscode/`, `.idea/` -- IDE folders commonly leak tokens
- `*.swp`, `.DS_Store`, `Thumbs.db` -- hygiene

**Remediation:**

Add all missing patterns to both `.gitignore` and `web/.gitignore`.

---

## 5. LOW Findings

### L-1. `loadMarkdown` accepts absolute path with no confinement (dead code)

**File:** `web/src/lib/content-loader.ts:15-18`
**Description:** The `.startsWith('/')` branch bypasses `CONTENT_ROOT` confinement entirely. Currently dead code (no callers exist). If any future caller passes user-influenced `filePath`, this is an arbitrary-file-read sink.
**Remediation:** Remove the dead code, or enforce confinement by resolving and checking the path stays within `CONTENT_ROOT`.

### L-2. Shiki HTML output injected via `dangerouslySetInnerHTML` without additional sanitize

**Files:** `web/src/components/wiki/EntryPointDialog.tsx:59`, `web/src/components/wiki/ConfigDialog.tsx:80`
**Description:** `highlightedHtml` is produced server-side by shiki `codeToHtml`. Shiki tokenizes and HTML-escapes code content; its output is generally safe. Data is from build-generated JSON files and config YAML -- all filesystem-sourced, not request-controlled. The fallback branch (`highlight.ts:24`) escapes `<`, `>`, `&` via `escapeHtml`.
**Remediation:** Defense-in-depth: add a sanitize pass or ensure `escapeHtml` also escapes `"` and `'`.

### L-3. `escapeHtml` does not escape `"` or `'`

**File:** `web/src/lib/highlight.ts:28-33`
**Description:** `escapeHtml` escapes `&`, `<`, `>` but not `"` or `'`. Since the fallback wraps in `<pre class="shiki"><code>...</code></pre>` with no attribute context, attribute-injection is not reachable here.
**Remediation:** Add `"` and `'` to `escapeHtml` for defense-in-depth.

### L-4. `x-session-id` header trusted without validation

**File:** `web/src/app/api/feedback/route.ts:29`
**Description:** The `x-session-id` header value is stored verbatim in `data.entries[].sessionId` with no format/length validation. Combined with H-3 this allows arbitrary client-supplied strings to persist on disk.
**Remediation:** Validate format (e.g. UUID), cap length, or generate server-side.

### L-5. Unbounded client-side localStorage analytics store

**File:** `web/src/stores/analytics-store.ts:264-273`
**Description:** `feedback` is keyed by `targetId` (which on the server is sanitized, but on the client store the raw `targetId` prop is used). No client-side cap on the number of distinct keys.
**Remediation:** Cap the number of distinct keys in localStorage.

### L-6. `..` path traversal in local-link resolution for markdown docs checker

**File:** `ci/_md_checkers.py:44-53` (`_resolve_local`)
**Description:** For relative hrefs, the code does `(ref.src_file.parent / raw_path).resolve()` with no anchoring to the repo root. A markdown link such as `[x](../../../../etc/shadow#heading)` resolves to a path far above the repository. Only file existence and heading text is read -- no arbitrary content is written.
**Remediation:** Resolve relative links strictly under the repo root and reject paths whose `resolve()` result is not within `repo_root`.

### L-7. Config-driven scan paths passed to `os.walk` with no confinement

**File:** `ci/check_dead_code.py:144-153` (`discover_files`), `ci/check_boot_venv_layout.py:99,122`
**Description:** `scan_paths`/`inherit`/`boot_dir` values from YAML config are passed directly to `os.walk` / `Path.resolve(strict=False)` with no normalization or confinement. An entry such as `/` or `../../..` would cause a walk of the whole filesystem (DoS / slow run). Config is developer-trusted, so risk is operational.
**Remediation:** Validate that resolved scan paths stay within the project/workspace root before walking.

### L-8. Malformed `markdown_docs.yaml` silently falls back to defaults

**File:** `ci/check_markdown_docs.py:99-101, 128-130`
**Description:** `except yaml.YAMLError: return MarkdownDocsConfig()` -- a malformed config is silently replaced with the default config rather than surfacing an error. This can mask a misconfigured `ignore:` list, causing the validator to scan (or skip) the wrong files. The module's own docstring claims "NO silent swallow".
**Remediation:** Emit a stderr warning on YAML parse error before falling back.

### L-9. Per-repo override file can silently exempt broken-link findings

**File:** `ci/check_markdown_docs.py:121-132` (`_load_repo_override`)
**Description:** `<repo_root>/.markdown_docs_exceptions.yaml` is loaded and its `ignore`/`exceptions` lists are merged into the effective config. Any actor who can place this file can silently exempt broken-link findings -- including potentially hiding links to malicious/secret resources from detection.
**Remediation:** Document the trust assumption. Consider restricting override scope or logging which overrides were applied.

### L-10. Obfuscated string literal evades own banned-words scanner

**File:** `ci/check_dependency_versions.py:51`
**Code:** `"pandas-" + "st" + "ubs"`
**Description:** The string `"pandas-stubs"` is constructed by concatenating three fragments instead of writing the literal directly. This is a tell-tale anti-pattern for ducking a static banned-words linter (the project ships `lib/check_banned_words.py`). It subverts the project's own quality controls.
**Remediation:** Use the plain literal `"pandas-stubs"` and, if it triggers a banned-words rule, add a scoped exception rather than fragmenting the string.

### L-11. `local` used outside function in `scripts/rewrite-history`

**File:** `scripts/rewrite-history` (lines 109, 197, 202)
**Description:** `local` is used at top script scope (outside any function). In bash, `local` outside a function is an error ("can only be used in a function"). Under `set -e` this causes the script to behave unexpectedly or exit silently.
**Remediation:** Remove `local` declarations at top scope or wrap the code in a function.

### L-12. `rm -rf *.egg-info` in Makefile without `--` separator

**File:** `Makefile:196`
**Description:** `rm -rf build/ dist/ *.egg-info` -- `*.egg-info` is shell-expanded. If a file named `--help.egg-info` or starting with `-` exists, `rm` could interpret it as an option.
**Remediation:** Use `rm -rf -- build/ dist/ *.egg-info` or `rm -rf build/ dist/ ./*.egg-info`.

### L-13. `.coverage` file world-readable (644) on disk

**File:** `.coverage` (53 KB, `644 agent:agent`)
**Description:** Coverage artifacts can embed local filesystem paths. The file is gitignored (`.gitignore:10`) and not tracked -- no leak risk -- but world-readable permissions are unnecessary.
**Remediation:** Set `600` or add `umask 077` before test runs.

### L-14. Blocked-commit-pattern list is narrow

**File:** `config/blocked_commit_patterns.yaml:7-13`
**Description:** Only blocks `co-authored-by`, `noreply@anthropic.com`, `generated.with.*claude`. Does not block other common AI-tool attribution strings (e.g. `Generated with Gemini`, `Co-authored-by Copilot`, `Generated with [cursor]`).
**Remediation:** Extend the blocklist with additional AI-tool attribution patterns.

---

## 6. INFO Findings

### I-1. No authentication / authorization anywhere

The entire site is an unauthenticated read-only wiki plus the open feedback endpoint. There are no admin routes, no protected API routes, no session/cookie auth. For a public reference wiki this is acceptable by design. The only mutating endpoint is `/api/feedback` (see H-3). No action required beyond rate-limiting that endpoint.

### I-2. No `process.env` secret leakage to client; no `NEXT_PUBLIC_*` vars

`grep` for `NEXT_PUBLIC`, `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `Authorization`, `Bearer`, `private_key` across `web/src` found only `process.env.WORKSPACE_*_*_ROOT` in `yaml-loader.ts` and `project-registry.ts` -- these are filesystem path roots used only server-side. They are never sent to the client. No `NEXT_PUBLIC_*` variables exist. No client-side secret exposure found.

### I-3. Config values are displayed to the client (intended)

`app/config/page.tsx` and `app/guard/page.tsx` load parsed YAML values and pass them to `ConfigDialog` -> `SchemaFieldCards` -> `Tooltip html={formatValueHtml(value)}`. `formatValueHtml` (in `utils.ts:36-74`) escapes `&`/`<`/`>` for both string contents and object keys. These config files are the CI repo's own YAML (`banned_words.yaml`, `silent_swallow_patterns.yaml`, etc.) -- non-secret by design.

### I-4. Feedback path-traversal defenses are adequate

`sanitizeId` (`feedback-loader.ts:7-13`) strips everything outside `[a-zA-Z0-9._-]` to `-`. `targetType` is validated against a fixed allowlist in the POST route. `FEEDBACK_DIR` is a fixed `join(cwd,'data','feedback')`. `targetId` cannot introduce `..` or `/`. No path traversal and no arbitrary file overwrite found.

### I-5. No JSON-injection possible in feedback files

`writeFileSync(path, JSON.stringify(data, null, 2))` -- `JSON.stringify` quotes and escapes `"` and control chars in strings. A comment containing `,"foo":"x` cannot break the JSON structure.

### I-6. All `dangerouslySetInnerHTML` instances exhaustively traced

See Section 8 below for the complete trace of all 6 instances.

### I-7. All server-component `params`/`searchParams` usage validated

See Section 9 below for the complete trace.

### I-8. No first-party Rust code exists

All `.rs` files (1,973 total) and `Cargo.toml` files (44 total) reside exclusively under `.boot-linux/rust/toolchains/` (vendored Rust standard library, git-ignored). `git ls-files '*.rs' 'Cargo.toml' 'Cargo.lock'` returns zero results. No Rust-specific remediation is required.

### I-9. Clean Python hygiene

- 17/17 YAML load sites use `yaml.safe_load`; zero uses of `yaml.load`, `yaml.load_all`, `yaml.unsafe_load`, or `yaml.full_load`
- 4/4 subprocess sites use list-form args; zero `shell=True`; no `os.system`/`os.popen`/`Popen`/`check_output`
- Only `re.compile(...)` -- no Python `eval()`/`exec()`/`compile()`; `ast.parse` is parse-only
- No `pickle`/`marshal`/`shelve`
- No `tempfile`/`mktemp`/`mkstemp`
- No `importlib`/`__import__`/dynamic imports
- No hardcoded secrets
- No bare `except:` or `except Exception: pass`
- The codebase ships detectors for these exact anti-patterns (`lib/check_silent_swallow*.py`, `lib/check_banned_words.py`) and applies them to itself

### I-10. No secrets in git history

`git log --all -p -S 'ghp_'` / `-S 'AKIA'` / `-S 'BEGIN RSA PRIVATE'` -- 0 hits. `git log --all -p -- '*.env' '*.key' '*.pem'` -- 0 results. No secrets were ever committed and later removed. 50+ commits, all conventional-commit messages, none expose sensitive data.

---

## 7. Positive Security Confirmations

The following security-positive practices were verified during the audit:

| # | Practice | Verification |
|---|----------|-------------|
| 1 | No secrets in source code | Grepped for `sk-`, `AKIA`, `ghp_`, `gho_`, `xox[bp]`, `AIza`, `-----BEGIN`, `PRIVATE KEY`, `password=`, `token=`, `Bearer`, `mongodb://`, `postgres://` -- 0 matches in project code |
| 2 | No secrets in data files | Read all 7 JSON data files in `web/src/data/` -- all documentation/statistics, no credentials. Source dumps use variable placeholders, never absolute `/home/agent/...` paths |
| 3 | No secrets in git history | `git log --all -p -S` for 5 secret sentinels -- 0 hits across all 50+ commits |
| 4 | No environment files | `find . -name '.env*'` -- 0 files. `.gitignore` covers `.env` and `.env.*` |
| 5 | YAML safety | 17/17 sites use `yaml.safe_load` |
| 6 | No shell injection in Python | 4/4 subprocess sites use list-form, 0 `shell=True` |
| 7 | No eval/exec/pickle/importlib | Only `re.compile` in 43 regex patterns; `ast.parse` is parse-only |
| 8 | No process substitution | Verified: no `<()` or `>()` in executable shell code |
| 9 | No hardcoded credentials | Comprehensive grep across all file types -- 0 matches |
| 10 | No bare except in Python | All exception handlers name specific types |
| 11 | DOMPurify sanitizes markdown | `ContentRenderer.tsx` uses `marked()` then `sanitizeHtml()` (DOMPurify) before `dangerouslySetInnerHTML` |
| 12 | Feedback path traversal prevented | `sanitizeId` strips to `[a-zA-Z0-9._-]`; `targetType` validated against allowlist |
| 13 | All npm packages carry integrity hashes | 672/672 packages have `integrity` field in `package-lock.json` |
| 14 | No typosquatting packages | Detected package name pairs are all legitimate platform-specific or sibling-author packages |
| 15 | `.env` files correctly gitignored | `.gitignore:8-9` covers `.env` and `.env.*` |
| 16 | No build artifacts tracked | `web/.next/`, `.coverage`, `*.egg-info/` all in `.gitignore` and not tracked |
| 17 | Markdown link validation runs on every commit | `.pre-commit-config.yaml:129` wires `ci.check_markdown_docs --all-md --check-remote` |
| 18 | Banned-words scanner runs on every commit | `.pre-commit-config.yaml` wires `ci.check_banned_words` |
| 19 | Silent-swallow scanner runs on every commit | `.pre-commit-config.yaml` wires `ci.check_silent_swallow` |
| 20 | Coverage devolution guard runs on every commit | Prevents lowering coverage thresholds |
| 21 | Dependency pinning enforced for Python | `pyproject.toml` uses exact `==` pins; `check_dependency_versions.py` rejects `^`/`~`/`*` |
| 22 | File length limits enforced | `check_file_length` blocks files over 512 lines |
| 23 | `__init__.py` files must be empty | `check_init_files` enforces this |
| 24 | No `+x` bit on `.py` modules | `check_executable_python` enforces this |
| 25 | Secret scanning runs on every commit | `checks_secrets.sh` runs `gitleaks --redact --verbose` |
| 26 | Co-authored commits blocked | `commit-msg` hook blocks `Co-authored-by` and Anthropic attribution |
| 27 | Sensitive files blocked at commit time | `checks_files.sh` blocks `.env`, `*.key`, `*.pem`, `credentials.json`, etc. |
| 28 | Boot layout audited | `check_boot_venv_layout` validates venv, boot dir, world-writable dirs |

---

## 8. XSS Sink Audit -- Complete `dangerouslySetInnerHTML` Trace

Every instance of `dangerouslySetInnerHTML` in the codebase was located, traced to its data source, and assessed for exploitability:

| # | File:Line | Source of `__html` | Sanitized? | User reachable? | Verdict |
|---|-----------|--------------------|------------|-----------------|---------|
| 1 | `app/layout.tsx:44` | Static `themeScript` string (layout.tsx:23-34) | N/A (static literal) | No | **Safe** |
| 2 | `src/components/wiki/ContentRenderer.tsx:17` | `marked()` output on README markdown, then `sanitizeHtml()` (DOMPurify) | **Yes** (DOMPurify) | No (filesystem-trusted content) | **Safe** (see M-4 for defense-in-depth) |
| 3 | `src/components/wiki/EntryPointDialog.tsx:59` | shiki `codeToHtml` output (server) | No (shiki output) | No (build-generated source JSON) | **Safe** (see L-2) |
| 4 | `src/components/wiki/ConfigDialog.tsx:80` | shiki `codeToHtml` output (server) | No (shiki output) | No (filesystem YAML) | **Safe** (see L-2) |
| 5 | `src/components/wiki/WikiBreadcrumbs.tsx:47` | `JSON.stringify(buildJsonLd(crumbs))` where crumbs come from `usePathname()` | No | **Yes** (URL path) | **Vulnerable** -- see M-1 |
| 6 | `src/components/ui/Tooltip.tsx:146` | `html` prop from `formatValueHtml(value)` in `SchemaFieldCards.tsx:77` | Escaped via `escHtml` | No (server config values) | **Safe** (see I-3) |

**Summary:** 5 of 6 instances are safe. Instance #5 (WikiBreadcrumbs) is vulnerable to XSS via crafted URL paths (M-1).

---

## 9. Server-Component Input Handling Audit

All server component `params`, `searchParams`, and `headers()` usage was reviewed for injection, path traversal, and data exposure:

| Route | Input | Usage | Validation | Verdict |
|-------|-------|-------|------------|---------|
| `app/[slug]/page.tsx` | `params.slug` | Look up entry in fixed `PROJECTS` array, then `loadProjectReadme` reads a fixed `readmePath` from the array entry | Not used to build file path | **Safe** |
| `app/patterns/[category]/page.tsx:42-51` | `params.category` | Validated against `VALID_CATEGORIES` allowlist before use; otherwise `notFound()` | Allowlist | **Safe** |
| `app/checks/[id]/page.tsx:81-86` | `params.id` | In-memory string-equality key against `fn.name` in API-docs JSON | No filesystem path, no shell, no query | **Safe** |
| `src/app/api/feedback/route.ts:40-46` (GET) | `searchParams.targetType` | Used as a directory-listing prefix filter (never joined into a path) | Prefix filter only | **Safe** |
| `src/app/api/feedback/route.ts:9-37` (POST) | Body fields | `targetType` validated against allowlist, `vote` validated as enum, `targetId` sanitized via `sanitizeId` | Allowlist + sanitize | **Safe** (re traversal; other concerns in H-3) |

No `headers()` server calls, no `cookies()` use, no `child_process`/`exec`/`eval`/`new Function`. The lone `re.exec` match (`src/lib/regex-engine.ts:39`) is `RegExp.prototype.exec`, not shell execution.

---

## 10. Dependency Security Audit

### Python Dependencies (`pyproject.toml` + `uv.lock`)

All dependencies are **exactly pinned** (`==X.Y.Z`):
- `PyYAML==6.0.3`, `markdown-it-py==4.2.0`, `httpx==0.28.1`, `pydantic==2.13.4`, `packaging==26.2`, `pytest==9.1.1`, `ruff==0.15.20`, `mypy==2.1.0`, etc.
- 38 total packages in `uv.lock`
- No floating/wildcard versions
- No unfamiliar/typosquat names -- all mainstream PyPI packages
- No known critical CVEs at these pins for the project's threat model (no network-facing Python service ships here)
- `black==26.5.1` is included in dev/lint extras but unused (hooks only use `ruff`) -- dead dependency, enlarges supply-chain surface

**Note:** `uv.lock` is gitignored (see M-7) -- reproducibility gap.

### Node Dependencies (`web/package.json` + `web/package-lock.json`)

- `lockfileVersion: 3`, **672 packages**, all from `registry.npmjs.org` (671) and `github.com` (153 -- prebuilt binary artifacts, normal)
- **Every package carries an `integrity` hash** (0 packages missing integrity/link) -- supply-chain integrity is enforced
- Typosquat scan: the "similar name" pairs detected (`@img/sharp-*` platform variants, `@jridgewell/*` sibling packages) are all legitimate platform-specific or sibling-author packages
- `@acemir/cssom@0.9.31` is the known maintained fork used by `dompurify`/`isomorphic-dompurify` -- legitimate, not a typosquat
- `next@16.1.7` is vulnerable (see H-2); `postcss` transitive is vulnerable (GHSA-qx2v-qp2m-jg93)
- 22 dependencies use caret `^` ranges in `package.json` (see H-6) -- lockfile pins exact versions but `npm install` can resolve to newer

### Bootstrap Tool Integrity

| Tool | Checksum verification | Status |
|------|----------------------|--------|
| `gitleaks` (v8.21.2) | **Enforced by default** but with **hardcoded** SHA256 hashes (`scripts/bootstrap-gitleaks:25-30, 109-125`). Should be refactored to fetch the checksum sidecar from GitHub at runtime instead | Needs refactor |
| `uv` (v0.11.23) | **Disabled by default** with placeholder checksums (`scripts/bootstrap-uv:47-51, 138-161`). Should fetch `.sha256` sidecar from GitHub release URL at runtime, verification ON by default | **H-5** |
| `rustup` | **No verification** -- `curl | sh` pattern (`Makefile:52-53`). `scripts/bootstrap-rust` downloads to temp file but performs no checksum check. Should fetch and verify sidecar at runtime | **H-4** |

**Architectural note:** No bootstrap script should hardcode SHA256 hashes. Hardcoded hashes go stale on version bumps, require manual maintenance, and are operationally fragile. The correct pattern for all bootstrap scripts is: (1) download the tarball, (2) download the `.sha256` sidecar from the same GitHub release URL, (3) compute `sha256sum` of the tarball, (4) compare against the sidecar value, (5) refuse to install on mismatch. The sidecar is fetched from the trusted release origin at runtime, so it is always correct for whatever version is being installed.

---

## 11. Git History & Secrets Audit

### Secrets scan

Comprehensive grep across the entire repo (excluding `.git/`, `node_modules/`, `.venv/`, caches, `.boot-linux`) for:

| Pattern | Matches in project code |
|---------|----------------------|
| `sk-` (OpenAI API key) | 0 |
| `AKIA` (AWS access key) | 0 |
| `ghp_` / `gho_` (GitHub token) | 0 |
| `xox[bp]` (Slack token) | 0 |
| `AIza` (Google API key) | 0 |
| `-----BEGIN` / `PRIVATE KEY` | 0 |
| `password=` / `passwd=` / `pwd=` | 0 (in non-test files) |
| `token=` / `Bearer ` / `authorization:` | 0 (in non-test files) |
| `mongodb://` / `postgres://` / `redis://` with credentials | 0 |

### Git history scan

| Command | Result |
|---------|--------|
| `git log --all --oneline` | 50+ commits, all conventional-commit messages, none expose secrets |
| `git log --all -p -S 'ghp_'` | 0 hits |
| `git log --all -p -S 'AKIA'` | 0 hits |
| `git log --all -p -S 'BEGIN RSA PRIVATE'` | 0 hits |
| `git log --all -p -- '*.env' '*.key' '*.pem'` | 0 results |
| `git log --all --diff-filter=D` for deleted sensitive-named files | 0 results |

**Conclusion:** Git history is clean. No secrets were ever committed and later removed.

### Data files review

All 7 JSON data files in `web/src/data/` were read in full:

| File | Content | Secrets? | Notes |
|------|---------|----------|-------|
| `api-docs.json` | Empty stub (`modules: []`) | No | -- |
| `shell-docs.json` | Empty stub (`modules: []`) | No | -- |
| `code-stats.json` | Pure line-count statistics | No | No PII |
| `hook-descriptions.json` | Documentation text + 3-sentence descriptions | No | Describes CI hooks |
| `swallow-detectors.json` | AST detector source snippets | No | Describes anti-pattern checkers |
| `hook-sources.json` | Full source dumps of CI hooks | No | Reveals internal path conventions (e.g. `/usr/bin/git.original`, `/etc/apt/apt.conf.d/99workspace-guard`) -- intentional for a public wiki, but exposes defensive mechanism details |
| `script-sources.json` | Full source dumps of bootstrap scripts | No | Contains public download URLs only (version-pinned GitHub releases). No embedded tokens. Uses variable placeholders (`$CI_PROJECT_ROOT`, `$WORKSPACE_ROOT`) throughout, never absolute `/home/agent/...` paths |

### Feedback data

`data/feedback/` is in `.gitignore` and contains only `.gitkeep` (no feedback files in this clone). No emails or IPs are collected. The schema stores only `vote`, `comment`, `timestamp`, `sessionId` (see H-3 and M-4 for concerns about comment storage).

### Log files

Only one log file exists: `web/.next/dev/logs/next-development.log` (untracked, in `.gitignore`). It retains a private-LAN client IP (`192.168.50.63`) -- not public, not PII under GDPR. No other `.log` files exist.

### Build artifacts

- `web/.next/` exists on disk (dev build) but is **not tracked** and is in `web/.gitignore`
- No `dist/`, `build/`, or `out/` tracked directories
- `.coverage` is a SQLite binary present on disk but **not tracked** and is in `.gitignore`
- `workspace_ci.egg-info/` present but untracked, in `.gitignore`

### Binary files

`git ls-files --eol` reported only three files with `i/none w/none` (no EOL):
- `ci/__init__.py` -- empty marker file
- `ci/py.typed` -- empty PEP 561 marker
- `web/public/styles/_tooling-card.css` -- empty/minified CSS

No unexpected binary artifacts in the repo.

---

## 12. Remediation Priority Matrix

Findings prioritized by impact and effort:

| Priority | Finding | Severity | Effort | Remediation |
|----------|---------|----------|--------|-------------|
| **P1** | H-1: No server-side CI | HIGH | Medium | Add GitHub Actions mirroring local hooks; enable branch protection |
| **P2** | H-2: Vulnerable `next` | HIGH | Low | `npm audit fix --force` (upgrade to 16.2.10) |
| **P3** | H-3: Unlimited feedback API | HIGH | Medium | Rate limit, length cap, async writes, CSRF check, server-generated session ID |
| **P4** | H-4: `curl | sh` rustup | HIGH | Low | Replace with `scripts/bootstrap-rust` call; fetch SHA256 sidecar from GitHub at runtime |
| **P5** | H-5: No SHA for `uv` | HIGH | Low | Remove hardcoded hashes; fetch `.sha256` sidecar from GitHub release URL at runtime; verification ON by default |
| **P6** | H-6: Unenforced Node pinning | HIGH | Medium | Replace `^` with exact pins; move dep checker to pre-commit |
| **P7** | M-1: Breadcrumbs XSS | MEDIUM | Low | Escape `<`/`>`/`&` in JSON-LD serialization |
| **P8** | M-2: No CSP/headers | MEDIUM | Low | Add `headers()` export in `next.config.mjs` |
| **P9** | M-3: SSRF via `--check-remote` | MEDIUM | Medium | Add IP blocklist; disable redirect-following for untrusted content |
| **P10** | M-5: Coverage checker `bash -c` | MEDIUM | Medium | Use array-form execution or runner allowlist |
| **P11** | M-6: Blanket `'.*'` exemptions | MEDIUM | Low | Replace with explicit per-pattern entries |
| **P12** | M-7: `uv.lock` gitignored | MEDIUM | Low | Remove from `.gitignore`, commit |
| **P13** | M-8: Dev server `0.0.0.0` | MEDIUM | Low | Default to `127.0.0.1`; add systemd hardening |
| **P14** | M-12: Incomplete `.gitignore` | MEDIUM | Low | Add key/PEM/DB/log patterns |
| **P15** | M-4: Unsanitized feedback | MEDIUM | Low | Cap comment length, strip control chars |
| **P16** | M-10: No CSRF check | MEDIUM | Low | Add `Origin`/`Sec-Fetch-Site` validation |
| **P17** | M-9: `sudo` guard install | MEDIUM | Medium | Add explicit gate for non-interactive use |
| **P18** | M-11: 5% coverage floor | MEDIUM | Medium | Raise floor; enable measurement; lock path changes |
| **P19** | L-1 through L-14 | LOW | Low each | Individual remediations per finding |
| **P20** | I-1 through I-10 | INFO | N/A | Informational, no action required |

---

## Appendix A: Audit Methodology

Six parallel explore agents were deployed, each with a specialized audit focus:

1. **Web App Security Agent** -- Audited all TypeScript/React files under `web/`. Focused on XSS (`dangerouslySetInnerHTML`), injection, data exposure, auth, CSRF, path traversal, dependency vulnerabilities, client-side secrets, feedback system, CSP.
2. **Python CI Scripts Agent** -- Audited all 47 Python files in `ci/`, `lib/`, `scripts/`, `tests/`. Focused on command injection, path traversal, YAML deserialization, eval/exec, pickle, secrets, temp file races, input validation, exception handling, file permissions, import security, ReDoS.
3. **Shell Scripts Agent** -- Audited all 23 shell scripts and 2 Makefiles. Focused on command injection, path traversal, TOCTOU, temp file security, privilege escalation, env injection, wildcard injection, IFS, signal handling, error handling, secrets, process substitution.
4. **Config & Git Hooks Agent** -- Audited all 30 YAML config files, git hook configs, `.gitignore`, dependency files, Docker/container configs, Makefile security, server configs.
5. **Data Exposure & Dependencies Agent** -- Performed comprehensive grep for secret patterns across the entire repo, read all JSON data files, checked feedback data, log files, dependency audit (npm + pip), git history, environment files, `res/` directory, build artifacts, binary files.
6. **Rust Code Agent** -- Searched for all `*.rs`, `Cargo.toml`, `Cargo.lock` files. Determined no first-party Rust code exists.

Key findings from each agent were independently verified by direct `grep`/`read` against the source files.

---

## Appendix B: Files Audited

### Python (47 files)
- `ci/` directory: `__init__.py`, `_boot_layout_helpers.py`, `_docker_versions.py`, `_md_checkers.py`, `_md_http_client.py`, `_md_refs.py`, `_md_slug.py`, `check_boot_venv_layout.py`, `check_dead_code.py`, `check_dependency_versions.py`, `check_duplicate_dependencies.py`, `check_markdown_docs.py`, `check_required_hooks_present.py`, `dead_code_analyzer.py`, `models.py`, `py.typed`
- `lib/` directory: `check_banned_words.py`, `check_silent_swallow.py`, `check_silent_swallow_ansible.py`, `check_silent_swallow_js.py`, `check_silent_swallow_python.py`, `check_silent_swallow_system.py`
- `scripts/` directory: `extract-code-stats.py`, `extract-hook-descriptions.py`, `extract-hook-sources.py`, `extract-script-sources.py`
- `tests/` directory: all test files

### TypeScript/React (149 files)
- `web/app/` -- all page components, layouts, route handlers
- `web/src/components/` -- all UI and wiki components
- `web/src/hooks/` -- all React hooks
- `web/src/stores/` -- all state stores
- `web/src/lib/` -- all utility libraries
- `web/src/types/` -- all type definitions
- `web/src/data/` -- all JSON data files

### Shell Scripts (23 files)
- `lib/` directory: all `*.sh` checker scripts
- `scripts/` directory: all bootstrap, extraction, and utility scripts
- `Makefile` and `web/Makefile`

### Config (30+ files)
- `config/` directory: all YAML config files
- `.pre-commit-config.yaml`
- `.gitignore` and `web/.gitignore`
- `pyproject.toml` and `web/package.json`

---

*End of audit report.*
