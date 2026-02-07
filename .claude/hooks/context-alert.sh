#!/bin/bash
# Context Window Alert Hook
# Warns when context usage exceeds 40%

input=$(cat)

PERCENT=$(echo "$input" | jq -r '.context_window.used_percentage // 0')

# Check if we have bc for floating point comparison
if command -v bc >/dev/null 2>&1; then
    if (( $(echo "$PERCENT > 40" | bc -l) )); then
        echo "⚠️  Context window at ${PERCENT}% - consider /clear, /compact, or /handover" >&2
    fi
else
    # Fallback for systems without bc
    PERCENT_INT=${PERCENT%.*}
    if [ "$PERCENT_INT" -gt 40 ]; then
        echo "⚠️  Context window at ${PERCENT}% - consider /clear, /compact, or /handover" >&2
    fi
fi
