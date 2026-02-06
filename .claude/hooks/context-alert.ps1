# Context Window Alert Hook for PowerShell
# Warns when context usage exceeds 40%

$input_json = [Console]::In.ReadToEnd()
$data = $input_json | ConvertFrom-Json

$percent = if ($data.context_window.used_percentage) { $data.context_window.used_percentage } else { 0 }

if ($percent -gt 40) {
    [Console]::Error.WriteLine("⚠️  Context window at ${percent}% - consider /clear, /compact, or /handover")
}
