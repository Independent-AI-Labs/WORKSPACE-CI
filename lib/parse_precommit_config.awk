#!/usr/bin/awk -f
# parse_precommit_config.awk: Parse .pre-commit-config.yaml for generate-hooks.
#
# Input:  .pre-commit-config.yaml (repo:local, language:system hooks only)
# Output: One line per hook, fields separated by \034 (ASCII FS):
#   id \034 name \034 entry \034 stage \034 pass_filenames \034 always_run \034 files \034 exclude \034 args \034 types_or

/^[[:space:]]*- id:/ {
    flush()
    sub(/^[[:space:]]*- id:[[:space:]]*/, "")
    id = trim_quotes($0)
    name = ""; entry = ""; stage = "pre-commit"
    pass_filenames = "true"; always_run = "false"
    files = ""; exclude = ""; args = ""; types_or = ""
    in_hook = 1
    next
}

in_hook {
    if (/^[[:space:]]+name:/)           { name = scalar(); next }
    if (/^[[:space:]]+entry:/)          { entry = entry_val(); next }
    if (/^[[:space:]]+stages:/)         { stage = inline_list(); next }
    if (/^[[:space:]]+pass_filenames:/) { pass_filenames = scalar(); next }
    if (/^[[:space:]]+always_run:/)     { always_run = scalar(); next }
    if (/^[[:space:]]+files:/)          { files = scalar(); next }
    if (/^[[:space:]]+exclude:/)        { exclude = scalar(); next }
    if (/^[[:space:]]+args:/)           { args = inline_list(); next }
    if (/^[[:space:]]+types_or:/)      { types_or = inline_list(); next }
    if (/^[[:space:]]+types:/)         { types_or = inline_list(); next }
    # language, verbose, etc.: silently ignored
}

END { flush() }

# ── helpers ───────────────────────────────────────────────────────────────

function flush(    sep) {
    if (id == "") return
    sep = "\034"
    printf "%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s\n", \
        id, sep, name, sep, entry, sep, stage, sep, \
        pass_filenames, sep, always_run, sep, files, sep, exclude, sep, args, sep, types_or
    id = ""
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

function entry_val(    v) {
    v = $0
    sub(/^[^:]+:[[:space:]]*/, "", v)
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
