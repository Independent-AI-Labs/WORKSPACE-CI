#!/usr/bin/awk -f
# parse_hook_yaml.awk: Parse ci-profile.yaml and required_hooks.yaml.
#
# Mode dispatch via -v mode=profile|registry (default: registry).
#
# Mode "registry": Parse required_hooks.yaml hooks list.
#   Output: One line per hook, fields separated by \034 (ASCII FS):
#     id \034 kind \034 entry \034 stage \034 pass_filenames \034 always_run
#          \034 mandatory \034 safety \034 applicable_to \034 files \034 files_types
#
# Mode "profile": Parse ci-profile.yaml.
#   Output: Structured records prefixed by type tag:
#     S\034<key>\034<value>          scalars: version, project, tier
#     L\034<language>                language entries (one per line)
#     H\034<stage>\034<hook_id>      hooks (in declared order)
#     O\034<hook_id>\034<field>\034<value>  override entries
#
# The parser is a pure tokeniser: no validation logic.

BEGIN {
    if (mode == "") mode = "registry"
    sep = "\034"
    pass_filenames = "true"
    always_run = "false"
    mandatory = "true"
    safety = "false"
}

# Skip comment-only lines in both modes
/^[[:space:]]*#/ { next }

# ── Registry mode ──────────────────────────────────────────────────────────
mode == "registry" {
    if (/^[[:space:]]*- id:/) {
        flush_hook()
        sub(/^[[:space:]]*- id:[[:space:]]*/, "")
        id = trim_quotes($0)
        in_hook = 1
        next
    }
    if (!in_hook) next
    if (/^[[:space:]]+kind:/)           { kind = scalar(); next }
    if (/^[[:space:]]+entry:/)          { entry = entry_val(); next }
    if (/^[[:space:]]+stage:/)          { stage = scalar(); next }
    if (/^[[:space:]]+pass_filenames:/) { pass_filenames = scalar(); next }
    if (/^[[:space:]]+always_run:/)     { always_run = scalar(); next }
    if (/^[[:space:]]+mandatory:/)      { mandatory = scalar(); next }
    if (/^[[:space:]]+safety:/)         { safety = scalar(); next }
    if (/^[[:space:]]+applicable_to:/)  { applicable_to = inline_list(); next }
    if (/^[[:space:]]+files:/)          { files = scalar(); next }
    if (/^[[:space:]]+files_types:/)    { files_types = inline_list(); next }
}

# ── Profile mode ───────────────────────────────────────────────────────────
mode == "profile" {
    if (/^version:/) { printf "S%sversion%s%s\n", sep, sep, scalar_top(); next }
    if (/^project:/) { printf "S%sproject%s%s\n", sep, sep, scalar_top(); next }
    if (/^tier:/)    { printf "S%stier%s%s\n", sep, sep, scalar_top(); next }

    if (/^languages:/) {
        in_languages = 1
        v = $0
        sub(/^languages:[[:space:]]*/, "", v)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        if (v ~ /^\[.*\]$/) emit_inline_list("L", v)
        next
    }
    if (in_languages && /^[[:space:]]+- /) {
        v = $0
        sub(/^[[:space:]]+- /, "", v)
        gsub(/["']/, "", v)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        if (v != "") printf "L%s%s\n", sep, v
        next
    }
    if (in_languages && /^[^ ]/) in_languages = 0

    if (/^hooks:/) { in_hooks_map = 1; next }
    if (in_hooks_map && /^[[:space:]]+pre-commit:/) {
        cur_stage = "pre-commit"
        v = $0
        sub(/^[^:]+:[[:space:]]*/, "", v)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        if (v ~ /^\[.*\]$/) { emit_inline_hooks(cur_stage, v); cur_stage = "" }
        next
    }
    if (in_hooks_map && /^[[:space:]]+commit-msg:/) {
        cur_stage = "commit-msg"
        v = $0
        sub(/^[^:]+:[[:space:]]*/, "", v)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        if (v ~ /^\[.*\]$/) { emit_inline_hooks(cur_stage, v); cur_stage = "" }
        next
    }
    if (in_hooks_map && /^[[:space:]]+pre-push:/) {
        cur_stage = "pre-push"
        v = $0
        sub(/^[^:]+:[[:space:]]*/, "", v)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        if (v ~ /^\[.*\]$/) { emit_inline_hooks(cur_stage, v); cur_stage = "" }
        next
    }
    if (in_hooks_map && cur_stage != "" && /^[[:space:]]+- /) {
        v = $0
        sub(/^[[:space:]]+- /, "", v)
        gsub(/["']/, "", v)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        if (v != "") printf "H%s%s%s%s\n", sep, cur_stage, sep, v
        next
    }
    if (in_hooks_map && /^[^ ]/) in_hooks_map = 0

    if (/^overrides:/) { in_overrides = 1; next }
    if (in_overrides && /^[[:space:]]+- [A-Za-z0-9_-]+:/) {
        v = $0
        sub(/^[[:space:]]+- /, "", v)
        sub(/:.*/, "", v)
        gsub(/["']/, "", v)
        cur_override_id = v
        next
    }
    if (in_overrides && /^[[:space:]]{2}[A-Za-z0-9_.-]+:[[:space:]]*$/) {
        v = $0
        sub(/^[[:space:]]+/, "", v)
        sub(/:.*/, "", v)
        gsub(/["']/, "", v)
        cur_override_id = v
        next
    }
    if (in_overrides && /^[[:space:]]{4}[A-Za-z0-9_.-]+:/) {
        field_name = $0
        sub(/[[:space:]]*:.*/, "", field_name)
        sub(/^[[:space:]]+/, "", field_name)
        field_val = entry_val()
        if (cur_override_id != "" && field_name != "") {
            printf "O%s%s%s%s%s%s\n", sep, cur_override_id, sep, field_name, sep, field_val
        }
        next
    }
    if (in_overrides && /^[^ ]/) in_overrides = 0
}

END {
    if (mode == "registry") flush_hook()
}

# ── Helpers ────────────────────────────────────────────────────────────────

function flush_hook() {
    if (id == "") return
    printf "%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s\n", \
        id, sep, kind, sep, entry, sep, stage, sep, \
        pass_filenames, sep, always_run, sep, mandatory, sep, \
        safety, sep, applicable_to, sep, files, sep, files_types
    id = ""
    kind = ""; entry = ""; stage = ""
    pass_filenames = "true"; always_run = "false"
    mandatory = "true"; safety = "false"
    applicable_to = ""; files = ""; files_types = ""
    in_hook = 0
}

function trim_quotes(s) {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
    if (s ~ /^".*"$/) s = substr(s, 2, length(s) - 2)
    else if (s ~ /^'.*'$/) s = substr(s, 2, length(s) - 2)
    return s
}

function scalar(    v) {
    v = $0
    sub(/^[^:]+:[[:space:]]*/, "", v)
    return trim_quotes(v)
}

function scalar_top(    v) {
    v = $0
    sub(/^[^:]+:[[:space:]]*/, "", v)
    gsub(/#.*/, "", v)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
    if (v ~ /^".*"$/) {
        v = substr(v, 2, length(v) - 2)
    } else if (v ~ /^'.*'$/) {
        v = substr(v, 2, length(v) - 2)
    }
    return v
}

function entry_val(    v) {
    v = $0
    sub(/^[^:]+:[[:space:]]*/, "", v)
    gsub(/#.*/, "", v)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
    if (v ~ /^".*"$/) {
        v = substr(v, 2, length(v) - 2)
        gsub(/\\"/, "\"", v)
    } else if (v ~ /^'.*'$/) {
        v = substr(v, 2, length(v) - 2)
        gsub(/''/, "'", v)
    }
    return v
}

function inline_list(    v) {
    v = $0
    sub(/^[^:]+:[[:space:]]*/, "", v)
    gsub(/\[|\]/, "", v)
    gsub(/["']/, "", v)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
    gsub(/,[[:space:]]*/, " ", v)
    return v
}

function emit_inline_list(prefix, raw    , n, items, i, gi) {
    gsub(/\[|\]/, "", raw)
    gsub(/["']/, "", raw)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", raw)
    n = split(raw, items, /[[:space:]]*,[[:space:]]*/)
    for (i = 1; i <= n; i++) {
        gi = items[i]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", gi)
        if (gi != "") printf "%s%s%s\n", prefix, sep, gi
    }
}

function emit_inline_hooks(stage, raw) {
    emit_inline_list("H" sep stage, raw)
}
