#!/bin/bash
# Claude Code Status Line
# Shows: git branch | model | agent | context usage (% + tokens)

input=$(cat)

# --- Extract fields ---
MODEL=$(echo "$input" | jq -r '.model.display_name // "?"')
PERCENT=$(echo "$input" | jq -r '.context_window.used_percentage // 0')
CTX_SIZE=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')
USED_TOKENS=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
AGENT=$(echo "$input" | jq -r '.agent.name // empty')

# --- Git branch ---
BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
[ -z "$BRANCH" ] && BRANCH="detached"

# --- Calculate remaining and format tokens ---
REMAINING=$((100 - ${PERCENT%.*}))
TOKENS_K=$(( ${USED_TOKENS%.*} / 1000 ))
CTX_SIZE_K=$(( ${CTX_SIZE%.*} / 1000 ))

# --- ANSI colors ---
DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
MAGENTA='\033[35m'
RESET='\033[0m'

# --- Context color based on usage ---
PERCENT_INT=${PERCENT%.*}
CTX_COLOR=$GREEN
if [ "$PERCENT_INT" -gt 70 ] 2>/dev/null; then
    CTX_COLOR=$RED
elif [ "$PERCENT_INT" -gt 40 ] 2>/dev/null; then
    CTX_COLOR=$YELLOW
fi

# --- Build segments ---
SEP="${DIM} | ${RESET}"
LINE="${CYAN}${BRANCH}${RESET}${SEP}${BOLD}${MODEL}${RESET}"

if [ -n "$AGENT" ]; then
    LINE="${LINE}${SEP}${MAGENTA}@${AGENT}${RESET}"
fi

LINE="${LINE}${SEP}${CTX_COLOR}${REMAINING}% left${RESET} ${DIM}(${TOKENS_K}k/${CTX_SIZE_K}k)${RESET}"

echo -e "$LINE"
