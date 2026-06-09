# Parse banned_words.yaml rules (patterns + reasons only).
# Exceptions are handled separately by parse_exceptions.awk.
#
# Output: section \034 pattern \034 reason \034 dir_key
# One record per pattern entry.
BEGIN { OFS="\034"; section=""; pattern=""; reason=""; dir_key="" }

# Flush any pending pattern before switching sections so the pattern is
# emitted under the section it was authored in, not the next one.
function _flush() {
    if (pattern != "") {
        print section, pattern, reason, dir_key
        pattern = ""; reason = ""
    }
}

/^banned:/          { _flush(); section="banned";          dir_key=""; next }
/^directory_rules:/ { _flush(); section="directory_rules"; dir_key=""; next }
/^filename_rules:/  { _flush(); section="filename_rules";  dir_key=""; next }
/^[a-z]/ && !/^  /  { _flush(); section="";                dir_key=""; next }

# directory_rules sub-keys (e.g. "  tests:")
section == "directory_rules" && /^  [a-z][a-z_]*:/ {
    dir_key = $0
    sub(/:.*/, "", dir_key)
    gsub(/^[[:space:]]+/, "", dir_key)
    next
}

# New entry marker
/^  - pattern:/ || /^    - pattern:/ {
    if (pattern != "") {
        print section, pattern, reason, dir_key
    }
    pattern = $0; sub(/^.*pattern:[[:space:]]*/, "", pattern)
    # Trim quotes while preserving backslashes
    sub(/^'/, "", pattern); sub(/'$/, "", pattern)
    sub(/^"/, "", pattern); sub(/"$/, "", pattern)
    reason = ""
    next
}
/reason:/ {
    reason = $0; sub(/^.*reason:[[:space:]]*/, "", reason)
    gsub(/^"/, "", reason); gsub(/"$/, "", reason)
    next
}
END {
    if (pattern != "") {
        print section, pattern, reason, dir_key
    }
}
