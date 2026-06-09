# Parse exception files for banned words.
#
# Handles two YAML formats:
#
# 1. universal_exceptions (in banned_words.yaml):
#      universal_exceptions:
#        - paths: ['tests/']
#          patterns:
#            - ':\s*Any\b'
#            - '\bmock\b'
#
# 2. Project exceptions (banned_words_exceptions.yaml):
#      exceptions:
#        - pattern: '\b(Dict|Tuple|...)\['
#          paths: ['types/common.py', 'scripts/ci/']
#
# Output: pattern \034 path_regex
# One record per pattern. path_regex combines all paths with |.

BEGIN { OFS="\034"; section=""; cur_pattern=""; mode="" }

# Section detection
/^universal_exceptions:/ { section="universal"; mode="paths_first"; next }
/^exceptions:/ { section="project"; mode="pattern_first"; next }
# Exit section on other top-level keys
/^[a-z]/ && !/^  / && !/^universal/ && !/^exceptions/ { section=""; next }

# --- universal_exceptions mode (paths first, then patterns) ---
section == "universal" && /^  - paths:/ {
    # Extract paths list from inline YAML array: ['tests/', '.toml$']
    cur_paths = $0
    sub(/^.*paths:[[:space:]]*/, "", cur_paths)
    # Strip brackets
    gsub(/^\[|\]$/, "", cur_paths)
    # Strip quotes and spaces around items
    gsub(/'|"/, "", cur_paths)
    gsub(/,[[:space:]]*/, "|", cur_paths)
    gsub(/[[:space:]]+/, "", cur_paths)
    next
}
section == "universal" && /patterns:/ && !/- pattern/ { next }
section == "universal" && /^      - / {
    val = $0
    sub(/^[[:space:]]*- [[:space:]]*/, "", val)
    gsub(/^'|'$/, "", val)
    gsub(/^"/, "", val); gsub(/"$/, "", val)
    if (val != "" && cur_paths != "") {
        print val, cur_paths
    }
    next
}

# --- project exceptions mode (pattern first, then paths) ---
section == "project" && /^  - pattern:/ {
    cur_pattern = $0
    sub(/^.*pattern:[[:space:]]*/, "", cur_pattern)
    gsub(/^'|'$/, "", cur_pattern)
    gsub(/^"/, "", cur_pattern); gsub(/"$/, "", cur_pattern)
    next
}
section == "project" && /paths:/ {
    val = $0
    sub(/^.*paths:[[:space:]]*/, "", val)
    gsub(/^\[|\]$/, "", val)
    gsub(/'|"/, "", val)
    gsub(/,[[:space:]]*/, "|", val)
    gsub(/[[:space:]]+/, "", val)
    if (cur_pattern != "" && val != "") {
        print cur_pattern, val
    }
    cur_pattern = ""
    next
}
