#!/usr/bin/awk -f
# extract_local_hooks.awk: Copy consumer-local hook blocks verbatim.
#
# Given a .pre-commit-config.yaml and a space-separated list of registry hook
# ids (-v reg_ids="id1 id2 ..."), print every hook block whose id is NOT in
# that list, byte-for-byte, re-indented so its "- id:" line sits at 6 spaces
# (the scaffold-generated layout). This preserves fields the field parser
# ignores (language, verbose, additional_dependencies, ...) and avoids any
# YAML quote/escape round-trip drift.
#
# A block starts at "- id:" and runs until the next "- id:", a new local repo
# ("- repo:"), a "hooks:" key, a top-level line, or a line indented less than
# the "- id:" line.

BEGIN {
    n = split(reg_ids, _r, " ")
    for (i = 1; i <= n; i++) if (_r[i] != "") reg[_r[i]] = 1
    nblocks = 0
    in_hook = 0
}

/^[[:space:]]*- id:/ {
    flush_block()
    id = $0
    sub(/^[[:space:]]*- id:[[:space:]]*/, "", id)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
    gsub(/^["']|["']$/, "", id)
    base = leading_spaces($0)
    nblocks = 1
    block[1] = reindent($0)
    in_hook = 1
    next
}

in_hook {
    if ($0 ~ /^[[:space:]]*- repo:/ || $0 ~ /^[[:space:]]*hooks:[[:space:]]*$/ || $0 ~ /^[^[:space:]]/) {
        flush_block()
        in_hook = 0
        next
    }
    if ($0 ~ /^[[:space:]]*$/) {
        nblocks++
        block[nblocks] = ""
        next
    }
    if (leading_spaces($0) > base) {
        nblocks++
        block[nblocks] = reindent($0)
        next
    }
    flush_block()
    in_hook = 0
}

END { flush_block() }

function flush_block(   i) {
    if (id != "" && !(id in reg)) {
        for (i = 1; i <= nblocks; i++) print block[i]
    }
    id = ""
    nblocks = 0
    in_hook = 0
}

function leading_spaces(s,   i) {
    i = 0
    while (substr(s, i + 1, 1) == " ") i++
    return i
}

# Shift a line so the block base moves from `base` to 6 spaces.
function reindent(s,   d) {
    d = 6 - base
    if (d == 0) return s
    if (d > 0) return sprintf("%*s%s", d, "", s)
    if (substr(s, 1, -d) ~ /^ *$/) return substr(s, -d + 1)
    return s
}
