#!/bin/bash
# Claude Code Status Line
# Line 1: git branch | model | agent | duration | code metrics
# Line 2: context progress bar with token counts

input=$(cat)

# --- Extract fields ---
MODEL=$(echo "$input" | jq -r '.model.display_name // "?"')
PERCENT=$(echo "$input" | jq -r '.context_window.used_percentage // 0')
CTX_SIZE=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')
USED_TOKENS=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
AGENT=$(echo "$input" | jq -r '.agent.name // empty')
DURATION_MS=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')
LINES_ADDED=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
LINES_REMOVED=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')

# --- Git branch ---
BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
[ -z "$BRANCH" ] && BRANCH="detached"

# --- Format tokens ---
TOKENS_K=$(( ${USED_TOKENS%.*} / 1000 ))
CTX_SIZE_K=$(( ${CTX_SIZE%.*} / 1000 ))

# --- Format duration ---
TOTAL_SEC=$(( ${DURATION_MS%.*} / 1000 ))
MINS=$(( TOTAL_SEC / 60 ))
SECS=$(( TOTAL_SEC % 60 ))
DURATION="${MINS}m ${SECS}s"

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

# --- Build Line 1: branch | model | agent | duration | code metrics ---
SEP="${DIM} | ${RESET}"
LINE1="${CYAN}${BRANCH}${RESET}${SEP}${BOLD}${MODEL}${RESET}"

if [ -n "$AGENT" ]; then
    LINE1="${LINE1}${SEP}${MAGENTA}@${AGENT}${RESET}"
fi

LINE1="${LINE1}${SEP}${DIM}${DURATION}${RESET}"

LA=${LINES_ADDED%.*}
LR=${LINES_REMOVED%.*}
if [ "$LA" -gt 0 ] 2>/dev/null || [ "$LR" -gt 0 ] 2>/dev/null; then
    METRICS=""
    [ "$LA" -gt 0 ] 2>/dev/null && METRICS="${GREEN}+${LA}${RESET}"
    if [ "$LA" -gt 0 ] 2>/dev/null && [ "$LR" -gt 0 ] 2>/dev/null; then
        METRICS="${METRICS} "
    fi
    [ "$LR" -gt 0 ] 2>/dev/null && METRICS="${METRICS}${RED}-${LR}${RESET}"
    LINE1="${LINE1}${SEP}${METRICS}"
fi

# --- Build Line 2: progress bar with token counts ---
BAR_WIDTH=20
FILLED=$(( PERCENT_INT * BAR_WIDTH / 100 ))
[ "$FILLED" -gt "$BAR_WIDTH" ] && FILLED=$BAR_WIDTH
EMPTY=$(( BAR_WIDTH - FILLED ))

BAR_FILLED=""
BAR_EMPTY=""
[ "$FILLED" -gt 0 ] && BAR_FILLED=$(printf "%${FILLED}s" | tr ' ' '█')
[ "$EMPTY" -gt 0 ] && BAR_EMPTY=$(printf "%${EMPTY}s" | tr ' ' '░')

LINE2="${CTX_COLOR}${BAR_FILLED}${DIM}${BAR_EMPTY}${RESET} ${CTX_COLOR}${PERCENT_INT}%${RESET} ${DIM}(${TOKENS_K}k/${CTX_SIZE_K}k)${RESET}"

# --- Output both lines ---
echo -e "$LINE1"
echo -e "$LINE2"
