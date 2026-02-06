# Claude Code Status Line for PowerShell
# Shows: git branch | model | agent | context usage (% + tokens)

$input_json = [Console]::In.ReadToEnd()
$data = $input_json | ConvertFrom-Json

# --- Extract fields ---
$model = if ($data.model.display_name) { $data.model.display_name } else { "?" }
$modelId = if ($data.model.id) { $data.model.id } else { "" }
$percent = if ($null -ne $data.context_window.used_percentage) { [int]$data.context_window.used_percentage } else { 0 }
$remaining = 100 - $percent
$ctxSize = if ($data.context_window.context_window_size) { $data.context_window.context_window_size } else { 200000 }
$usedTokens = if ($data.context_window.total_input_tokens) { $data.context_window.total_input_tokens } else { 0 }
$agent = if ($data.agent.name) { $data.agent.name } else { $null }

# --- Git branch (fast, suppresses errors) ---
$branch = try { git branch --show-current 2>$null } catch { $null }
if (-not $branch) { $branch = "detached" }

# --- Format token count as "42k" or "142k" ---
$tokensK = [math]::Round($usedTokens / 1000)
$ctxSizeK = [math]::Round($ctxSize / 1000)

# --- ANSI colors (use [char]27 for PS 5.x compatibility) ---
$esc     = [char]27
$dim     = "${esc}[2m"
$bold    = "${esc}[1m"
$green   = "${esc}[32m"
$yellow  = "${esc}[33m"
$red     = "${esc}[31m"
$cyan    = "${esc}[36m"
$magenta = "${esc}[35m"
$blue    = "${esc}[34m"
$reset   = "${esc}[0m"

# --- Context color based on usage ---
$ctxColor = $green
if ($percent -gt 70) {
    $ctxColor = $red
} elseif ($percent -gt 40) {
    $ctxColor = $yellow
}

# --- Build status line segments ---
$segments = @()

# 1. Git branch
$segments += "${cyan}${branch}${reset}"

# 2. Model (bold)
$segments += "${bold}${model}${reset}"

# 3. Agent persona (if active)
if ($agent) {
    $segments += "${magenta}@${agent}${reset}"
}

# 4. Context: remaining% + used tokens / max tokens
$segments += "${ctxColor}${remaining}% left${reset} ${dim}(${tokensK}k/${ctxSizeK}k)${reset}"

# --- Join with separator and output ---
$separator = "${dim} | ${reset}"
$line = $segments -join $separator
Write-Output $line
