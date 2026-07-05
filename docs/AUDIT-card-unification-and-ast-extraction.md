# Audit: Card Unification and AST Source Extraction

**Date:** 2026-07-03  
**Status:** Open  
**Severity:** Critical  

---

## 1. Executive Summary

The wiki UI has six independent card systems with zero shared layout, typography, or data
representation. Additionally, the AST source extraction pipeline for error-swallowing
patterns displays the wrong functions on pattern cards because the underlying Python
detection code crams multiple pattern branches into single shared functions. The fix
requires refactoring the Python detector functions so each pattern maps to its own
clearly-named function, then unifying the web card components through a single data
model and adapter pattern.

---

## 2. Card Inconsistency Audit

### 2.1 Current State: Six Card Systems

| Page | Component | Root CSS class | Grid container | Grid min | Padding | Icon | Title font | Badge style |
|------|-----------|----------------|-----------------|----------|---------|------|------------|-------------|
| Home | `ProjectCard.tsx` | `.project-card` | `.project-grid` | 320px | `--space-5` (self-declared) | `ri-*` per project | `--text-lg` 700 | Custom inline badge (self-declared) |
| Config | `ConfigCard.tsx` | `.config-card` | `.config-grid` | 380px | `--space-4` (layered) | `ri-settings-3-line` | mono 600 | `badge--green/orange` |
| Guard | `GuardConfigCard.tsx` | `.guard-card` | `.config-grid` | 380px | `--space-4` (layered) | `ri-shield-keyhole-line` | mono 600 | `badge--green/orange` |
| Patterns | `PatternCard.tsx` | `.pattern-card` | `.pattern-grid` | 400px | `--space-4` (layered) | none | mono (regex) | `badge--<category>` |
| Tooling | inline in `page.tsx` | `.tooling-card` | `.tooling-grid` | 350px | `--space-4` (layered) | none | mono (id in h2) | `badge--blue` |
| Checks | `CheckCard.tsx` (unused) | `.check-card` | `.check-list` | N/A | `--space-4` (layered) | none | mono | `badge--purple/teal` |

### 2.2 Problems

1. **Six different grid breakpoints** (320px, 350px, 380px, 400px, N/A) - cards don't align across pages.
2. **Two padding values** (`--space-4` vs `--space-5`) - `ProjectCard` declares its own panel chrome instead of using the layered `.card` base.
3. **Three title typography styles** (mono 600, `--text-lg` 700, mono regex) - no consistency in font family, weight, or size.
4. **Four badge styling approaches** (layered `.badge` base, custom inline badge, `badge--<category>`, `badge--blue`) - same visual concept rendered four different ways.
5. **Inconsistent field ordering** - each card displays fields in a different order with no shared philosophy.
6. **`GuardConfigCard` reuses `config-card__*` inner classes** but has a different root class (`.guard-card`) - fragile coupling.
7. **`CheckCard` exists but is unused** - dead code.
8. **Tooling card is inline in the page file** - no reusable component.

### 2.3 CSS File Inventory

| File | Lines | Card classes | Notes |
|------|-------|--------------|-------|
| `_components.css` | 293 | `.card` base (collapses 5 card roots) + `.badge` base | Layered (`@layer components`) |
| `_config-table.css` | 75 | `.config-card`, `.guard-card` + element modifiers | Unlayered card parts, layered table parts |
| `_project-card.css` | 120 | `.project-card` + element modifiers + `.project-detail*` | Self-declares panel chrome (not in `.card` base) |
| `_tooling-card.css` | 31 | `.tooling-card__usage`, `__args` | Only element modifiers, base via `.card` |
| `_check-card.css` | 31 | `.check-card` + element modifiers | Only element modifiers, base via `.card` |
| `_wiki-patterns.css` | 191 | `.pattern-card` + element modifiers + filter UI + dialog | Largest file, mixes card + non-card concerns |

---

## 3. AST Source Extraction Audit

### 3.1 Architecture Overview

```
config/silent_swallow_patterns.yaml
  (source_function field per pattern)
        |
        v
scripts/extract-swallow-source.py
  (ast.parse, find FunctionDef by name, dedup by name)
        |
        v
web/src/data/swallow-detectors.json
  (6 entries, one per unique function name)
        |
        v
web/src/lib/patterns.ts :: classifySwallowPatterns()
  (builds detectorMap keyed by function name, looks up by source_function)
        |
        v
web/src/components/wiki/PatternCard.tsx
  (renders FunctionCodeDialog with full function source)
```

### 3.2 The Core Problem: One Function Per Multiple Patterns

The Python detection code uses shared functions that handle multiple patterns:

#### `lib/check_silent_swallow_python.py`

**`_classify_except_body`** handles **8 patterns**:
- `py-except-pass` (via `_BODY_MAP["pass"]`)
- `py-except-continue` (via `_BODY_MAP["continue"]`)
- `py-except-ellipsis` (via `_BODY_MAP["..."]`)
- `py-except-return-none` (via direct `return "py-except-return-none"`)
- `py-except-debug-only` (via `_NON_SILENT_CHECKS` list entry)
- `py-except-raise-no-from` (via `_NON_SILENT_CHECKS` list entry)
- `py-except-silent-exit` (via `_NON_SILENT_CHECKS` list entry)
- `py-except-print` (via `_NON_SILENT_CHECKS` list entry)

**`_resolve_next_line`** handles **1 pattern** but is poorly named:
- `py-except-empty-body` (returned in 3 places)

#### `lib/check_silent_swallow_js.py`

**`_check_catch_body`** handles **1 pattern** but:
- Returns `True/False` (boolean predicate)
- Never contains the pattern ID string `"js-catch-silent-return-multi"`
- The actual pattern ID emission is in the parent `detect_js_multiline` on line 76: `yield header, "js-catch-silent-return-multi"`

#### `lib/check_silent_swallow_ansible.py`

**`detect_ansible_tasks`** handles **2 patterns**:
- `ansible-shell-no-register` (line 90)
- `ansible-shell-no-guard` (line 92)

**`detect_registered_output_swallow`** handles **1 pattern**:
- `ansible-register-output-swallowed` (line 187)

### 3.3 Impact on Wiki Display

| Pattern ID | YAML `source_function` | Function shown on card | Does function contain pattern ID? | Verdict |
|---|---|---|---|---|
| `py-except-pass` | `_classify_except_body` | `_classify_except_body()` | Yes (via `_BODY_MAP`) | Shared - user sees logic for 8 patterns |
| `py-except-continue` | `_classify_except_body` | `_classify_except_body()` | Yes (via `_BODY_MAP`) | Shared - same full function |
| `py-except-ellipsis` | `_classify_except_body` | `_classify_except_body()` | Yes (via `_BODY_MAP`) | Shared - same full function |
| `py-except-return-none` | `_classify_except_body` | `_classify_except_body()` | Yes (direct return) | Shared - same full function |
| `py-except-empty-body` | `_resolve_next_line` | `_resolve_next_line()` | Yes (3 return sites) | Wrong name - "resolve next line" != "empty body" |
| `py-except-debug-only` | `_classify_except_body` | `_classify_except_body()` | Yes (via `_NON_SILENT_CHECKS`) | Shared - same full function |
| `py-except-raise-no-from` | `_classify_except_body` | `_classify_except_body()` | Yes (via `_NON_SILENT_CHECKS`) | Shared - same full function |
| `py-except-silent-exit` | `_classify_except_body` | `_classify_except_body()` | Yes (via `_NON_SILENT_CHECKS`) | Shared - same full function |
| `py-except-print` | `_classify_except_body` | `_classify_except_body()` | Yes (via `_NON_SILENT_CHECKS`) | Shared - same full function |
| `js-catch-silent-return-multi` | `_check_catch_body` | `_check_catch_body()` | **No** - returns bool, ID in parent | **Broken** - wrong function entirely |
| `ansible-shell-no-register` | `detect_ansible_tasks` | `detect_ansible_tasks()` | Yes (line 90) | Shared - 2 patterns |
| `ansible-shell-no-guard` | `detect_ansible_tasks` | `detect_ansible_tasks()` | Yes (line 92) | Shared - same full function |
| `ansible-register-output-swallowed` | `detect_registered_output_swallow` | `detect_registered_output_swallow()` | Yes (line 187) | OK |
| `cron-no-log-redirect` | `_check_cron_inline` | `_check_cron_inline()` | Yes (line 112) | OK |

### 3.4 Root Cause

The root cause is NOT the extractor or the web display. The root cause is the **Python
code architecture**: detection logic for multiple patterns is crammed into single
shared functions with no per-pattern extraction. The fix is to refactor the Python
detector functions so each pattern has its own dedicated, clearly-named function.

---

## 4. Required Fixes

### 4.1 Python Detector Refactoring

**File:** `lib/check_silent_swallow_python.py`

**Current:** `_classify_except_body` is a 30-line function with 8 branches (dict lookup +
list iteration + direct returns) that handles 8 different patterns.

**Required:** Extract each pattern's detection logic into its own function:

```
_check_except_pass(nxt, lines, lineno, header_indent) -> str | None
_check_except_continue(nxt, lines, lineno, header_indent) -> str | None
_check_except_ellipsis(nxt, lines, lineno, header_indent) -> str | None
_check_except_return_none(nxt, lines, lineno, header_indent) -> str | None
_check_except_debug_only(nxt, lines, lineno, header_indent) -> str | None
_check_except_raise_no_from(nxt, lines, lineno, header_indent) -> str | None
_check_except_silent_exit(nxt, lines, lineno, header_indent) -> str | None
_check_except_print(nxt, lines, lineno, header_indent) -> str | None
```

Each function:
- Contains ONLY the regex/condition for that specific pattern
- Returns the pattern ID string when matched, `None` otherwise
- Is clearly named to match its pattern

`_classify_except_body` becomes a dispatcher that calls each check in order and returns
the first match (or None). The dispatcher is NOT shown on the wiki card - only the
specific per-pattern function is shown.

**Current:** `_resolve_next_line` handles `py-except-empty-body` but is named for a
different concept.

**Required:** Rename to `_check_except_empty_body` or extract the empty-body detection
into a dedicated function with that name. The line-resolution logic stays as a utility
helper.

**File:** `lib/check_silent_swallow_js.py`

**Current:** `_check_catch_body` returns `True/False`. The pattern ID
`"js-catch-silent-return-multi"` is in `detect_js_multiline`.

**Required:** Either:
- Move the pattern ID into `_check_catch_body` so it returns `str | None` (the pattern
  ID or None) instead of `bool`, OR
- Extract the detection logic into a function that directly returns the pattern ID

**File:** `lib/check_silent_swallow_ansible.py`

**Current:** `detect_ansible_tasks` handles 2 patterns (`ansible-shell-no-register`
and `ansible-shell-no-guard`) with a branch on `_check_changed_when_false`.

**Required:** Extract per-pattern functions or at minimum extract the branching logic
into named helpers.

### 4.2 YAML Config Update

**File:** `config/silent_swallow_patterns.yaml`

Update `source_function` fields to point to the new per-pattern functions:

```yaml
- id: py-except-pass
  detector: detect_python_multiline
  source_function: _check_except_pass      # was _classify_except_body
  ...

- id: py-except-empty-body
  detector: detect_python_multiline
  source_function: _check_except_empty_body  # was _resolve_next_line
  ...
```

### 4.3 Extractor Update

**File:** `scripts/extract-swallow-source.py`

The dedup-by-name logic stays (each function name is now unique per pattern). The
extractor naturally produces one entry per pattern because each pattern has its own
function. No architectural change needed - just re-run after the Python refactoring.

### 4.4 Web Type Update

**File:** `web/src/types/patterns.ts`

`SwallowDetectorData` keyed by function name stays the same, but now each function name
is unique per pattern, so the map lookup naturally produces per-pattern results.

### 4.5 Unified Card Data Model

**New file:** `web/src/types/card.ts`

```typescript
interface CardItem {
  id: string
  title: string
  description: string
  href: string
  category: string
  icon?: string
  tags?: { label: string; variant: 'accent' | 'muted' | 'warn' | 'ok' }[]
  meta?: { label: string; value: string }[]
  status?: 'ok' | 'warn' | 'info'
}

interface CardTag {
  label: string
  variant: 'accent' | 'muted' | 'warn' | 'ok'
}

interface CardMeta {
  label: string
  value: string
}
```

### 4.6 Adapters

**New file:** `web/src/lib/card-adapters.ts`

Each adapter converts a domain-specific type to `CardItem[]`:

| Adapter | Input type | Tags | Meta | Status |
|---------|------------|------|------|--------|
| `projectAdapter` | `ProjectSummary[]` | language | - | - |
| `configAdapter` | `ConfigEntry[]` | - | field count | has/no schema |
| `guardConfigAdapter` | `GuardConfigEntry[]` | - | field count | has/no schema |
| `patternAdapter` | `ClassifiedPattern[]` | languages, extensions, detection type | scope, detector function | - |
| `scriptAdapter` | `ScriptManifestEntry[]` | category | make target, arg count | - |
| `checkAdapter` | `ApiDocsOutput + ShellDocsOutput` | source (python/shell) | line, signature | - |

### 4.7 Unified WikiCard Component

**New file:** `web/src/components/wiki/WikiCard.tsx`

Single component, single layout. Field order:
1. Header: icon + title + status badge (right-aligned)
2. Description (muted, `--text-sm`)
3. Tag row (languages, extensions, category, etc.)
4. Meta row (field count, line number, source file, etc.)
5. Optional children (function dialog, feedback widget)

```tsx
interface WikiCardProps {
  item: CardItem
  children?: ReactNode
}
```

### 4.8 Unified CSS

**New file:** `web/public/styles/_wiki-card.css`

- `.wiki-card-grid` - single grid: `repeat(auto-fill, minmax(360px, 1fr))`
- `.wiki-card` - flex column, gap, hover accent + raised shadow
- `.wiki-card__header`, `__title`, `__badge`, `__description`, `__tags`, `__tag`, `__meta`, `__meta-item`

All in `@layer components` for base chrome. Per-feature modifiers (if any) unlayered.

**Delete card parts from:**
- `_project-card.css` (keep `.project-detail*`)
- `_config-table.css` (keep `.config-field-table`, `.required-badge`, `.optional-badge`)
- `_check-card.css` (delete entirely - component is unused)
- `_tooling-card.css` (keep `.tooling-card__args` dl styles if needed)
- `_wiki-patterns.css` (keep `.pattern-list`, `.category-nav`, `.function-code-dialog`)

### 4.9 Page Refactors

Each page becomes:
```tsx
const data = await loadData()
const items = adapter(data)
return (
  <WikiShell>
    <h1>Title</h1>
    <p className="page-intro">...</p>
    <WikiCardGrid items={items} />
  </WikiShell>
)
```

Pattern page keeps `PatternList` (client component for filtering) but renders `WikiCard`
instead of `PatternCard`. `FunctionCodeDialog` and `FeedbackWidget` passed as children.

### 4.10 Delete Old Card Components

- `ProjectCard.tsx` - replaced by `WikiCard`
- `ConfigCard.tsx` - replaced by `WikiCard`
- `GuardConfigCard.tsx` - replaced by `WikiCard`
- `PatternCard.tsx` - replaced by `WikiCard` (PatternList stays)
- `CheckCard.tsx` - dead code, delete

---

## 5. Execution Order

1. **Python refactoring** (4.1) - extract per-pattern functions in all 3 detector modules
2. **YAML update** (4.2) - update `source_function` fields
3. **Regenerate JSON** (4.3) - re-run `make extract-swallow`
4. **Python tests** - verify all 53 silent-swallow tests still pass
5. **Web types** (4.4, 4.5) - add `CardItem`, update `SwallowDetectorData` if needed
6. **Adapters** (4.6) - implement all 6 adapters
7. **WikiCard component** (4.7) - implement
8. **Unified CSS** (4.8) - create `_wiki-card.css`, trim old files
9. **Page refactors** (4.9) - update all 6 pages
10. **Delete old components** (4.10)
11. **Tests** - update vitest suite, verify all pass

---

## 6. Constraints

- Banned Python patterns: `\.parent\.parent`, `\.parents\[`, `\.parent\.resolve` - ALL banned
- Banned Python types: `list[dict]`, `list[dict[str, object]]`, `dict[..., object]` - ALL banned
- Config paths via `CI_CONFIG_DIR` env var, NOT `Path(__file__).parent.parent`
- Banned words in web/: `fallback`, `silent`, `shim`, `stubs`, `compatibility`, `degradation`, `legacy`, `dict[str, Any]`, em-dash (`—`), `eslint-disable`, `.suppress`, `# type: ignore`
- CSS layering: per-feature CSS UNLAYERD. Only `_components.css` uses `@layer components`
- Route-level `loading.tsx` files replace inline `<Suspense>` (avoids banned prop name `fallback`)
- HTML `placeholder` attribute banned - use `aria-label`
- `@typescript-eslint/no-explicit-any` is an ESLint error in web/
- DO NOT run `next build` - hangs indefinitely on Next.js 16
- DO NOT `pkill -f next` - kills WORKSPACE-PORTAL processes on port 3000

---

## 7. File Inventory

### Python files to modify:
- `lib/check_silent_swallow_python.py` - extract per-pattern functions
- `lib/check_silent_swallow_js.py` - fix `_check_catch_body` to return pattern ID
- `lib/check_silent_swallow_ansible.py` - extract per-pattern functions
- `config/silent_swallow_patterns.yaml` - update `source_function` fields

### Web files to create:
- `web/src/types/card.ts` - `CardItem`, `CardTag`, `CardMeta`
- `web/src/lib/card-adapters.ts` - 6 adapter functions
- `web/src/components/wiki/WikiCard.tsx` - unified card component
- `web/public/styles/_wiki-card.css` - unified card CSS

### Web files to modify:
- `web/src/lib/patterns.ts` - update `classifySwallowPatterns` if type changes
- `web/src/components/wiki/PatternList.tsx` - use `WikiCard` instead of `PatternCard`
- `web/app/page.tsx` - use adapter + `WikiCard`
- `web/app/config/page.tsx` - use adapter + `WikiCard`
- `web/app/guard/page.tsx` - use adapter + `WikiCard`
- `web/app/patterns/page.tsx` - use adapter + `WikiCard`
- `web/app/tooling/page.tsx` - extract inline card to adapter + `WikiCard`
- `web/public/styles/_components.css` - add `.wiki-card` to `.card` base selector list
- `web/public/styles/_project-card.css` - delete card parts, keep `.project-detail*`
- `web/public/styles/_config-table.css` - delete card parts, keep table parts
- `web/public/styles/_wiki-patterns.css` - delete `.pattern-card*`, keep filter/dialog
- `web/public/styles/_tooling-card.css` - delete card parts, keep dl styles if needed

### Web files to delete:
- `web/src/components/wiki/ProjectCard.tsx`
- `web/src/components/wiki/ConfigCard.tsx`
- `web/src/components/wiki/GuardConfigCard.tsx`
- `web/src/components/wiki/PatternCard.tsx`
- `web/src/components/wiki/CheckCard.tsx`
- `web/public/styles/_check-card.css`

### Test files to update:
- `web/src/components/wiki/ProjectCard.test.tsx` (if exists)
- `web/src/components/wiki/ConfigCard.test.tsx` (if exists)
- `web/src/components/wiki/GuardConfigCard.test.tsx` (if exists)
- `web/src/components/wiki/PatternCard.test.tsx` (if exists)
- `web/src/components/wiki/WikiCard.test.tsx` (new)
- `web/src/lib/card-adapters.test.ts` (new)
- Python tests for refactored detector functions
