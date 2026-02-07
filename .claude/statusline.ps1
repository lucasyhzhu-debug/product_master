# Claude Code Status Line (PowerShell)
# Line 1: git branch | model | agent | duration | code metrics
# Line 2: context progress bar with token counts

$input_json = [Console]::In.ReadToEnd()
$data = $input_json | ConvertFrom-Json

# --- Extract fields ---
$model = if ($data.model.display_name) { $data.model.display_name } else { "?" }
$percent = if ($null -ne $data.context_window.used_percentage) { [int]$data.context_window.used_percentage } else { 0 }
$ctxSize = if ($data.context_window.context_window_size) { $data.context_window.context_window_size } else { 200000 }
$usedTokens = if ($data.context_window.total_input_tokens) { $data.context_window.total_input_tokens } else { 0 }
$agent = if ($data.agent.name) { $data.agent.name } else { $null }
$durationMs = if ($data.cost.total_duration_ms) { [long]$data.cost.total_duration_ms } else { 0 }
$linesAdded = if ($data.cost.total_lines_added) { [int]$data.cost.total_lines_added } else { 0 }
$linesRemoved = if ($data.cost.total_lines_removed) { [int]$data.cost.total_lines_removed } else { 0 }

# --- Git branch (fast, suppresses errors) ---
$branch = try { git branch --show-current 2>$null } catch { $null }
if (-not $branch) { $branch = "detached" }

# --- Format tokens ---
$tokensK = [math]::Round($usedTokens / 1000)
$ctxSizeK = [math]::Round($ctxSize / 1000)

# --- Format duration ---
$totalSec = [math]::Floor($durationMs / 1000)
$mins = [math]::Floor($totalSec / 60)
$secs = $totalSec % 60
$duration = "${mins}m ${secs}s"

# --- ANSI colors ([char]27 for PS 5.x compatibility) ---
$esc     = [char]27
$dim     = "${esc}[2m"
$bold    = "${esc}[1m"
$green   = "${esc}[32m"
$yellow  = "${esc}[33m"
$red     = "${esc}[31m"
$cyan    = "${esc}[36m"
$magenta = "${esc}[35m"
$reset   = "${esc}[0m"

# --- Context color based on usage ---
$ctxColor = $green
if ($percent -gt 70) {
    $ctxColor = $red
} elseif ($percent -gt 40) {
    $ctxColor = $yellow
}

# --- Build Line 1: branch | model | agent | duration | code metrics ---
$sep = "${dim} | ${reset}"
$segments = @()
$segments += "${cyan}${branch}${reset}"
$segments += "${bold}${model}${reset}"
if ($agent) {
    $segments += "${magenta}@${agent}${reset}"
}
$segments += "${dim}${duration}${reset}"
if ($linesAdded -gt 0 -or $linesRemoved -gt 0) {
    $metrics = ""
    if ($linesAdded -gt 0) { $metrics += "${green}+${linesAdded}${reset}" }
    if ($linesAdded -gt 0 -and $linesRemoved -gt 0) { $metrics += " " }
    if ($linesRemoved -gt 0) { $metrics += "${red}-${linesRemoved}${reset}" }
    $segments += $metrics
}
$line1 = $segments -join $sep

# --- Build Line 2: progress bar with token counts ---
$barWidth = 20
$filled = [math]::Floor($percent * $barWidth / 100)
if ($filled -gt $barWidth) { $filled = $barWidth }
$empty = $barWidth - $filled
$barFilled = ([string][char]0x2588) * $filled
$barEmpty = ([string][char]0x2591) * $empty
$line2 = "${ctxColor}${barFilled}${dim}${barEmpty}${reset} ${ctxColor}${percent}%${reset} ${dim}(${tokensK}k/${ctxSizeK}k)${reset}"

# --- Output both lines ---
Write-Output $line1
Write-Output $line2
