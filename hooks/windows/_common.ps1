# Claude Code hook PowerShell common library. Dot-source only.
# Usage: . "$PSScriptRoot\_common.ps1"
# Variables set after call: $script:INPUT_RAW, $script:SESSION_ID

function Read-HookInput {
    $script:INPUT_RAW = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrEmpty($script:INPUT_RAW)) { return $false }
    try {
        $obj = $script:INPUT_RAW | ConvertFrom-Json
    } catch {
        return $false
    }
    $script:SESSION_ID = $obj.session_id
    if ([string]::IsNullOrEmpty($script:SESSION_ID)) { return $false }
    return $true
}

function Get-GitRoot {
    $root = (git rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($root)) { return "" }
    return $root.Trim()
}

function New-ContextDir {
    param([Parameter(Mandatory)][string]$GitRoot)
    $dir = Join-Path $GitRoot ".context-capture"
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}

function Get-PromptFilePath {
    param([string]$SessionId, [string]$GitRoot)
    Join-Path $GitRoot (Join-Path ".context-capture" ".claude-prompts-$SessionId")
}
function Get-OffsetFilePath {
    param([string]$SessionId, [string]$GitRoot)
    Join-Path $GitRoot (Join-Path ".context-capture" ".claude-offset-$SessionId")
}
function Get-DeltaFilePath {
    param([string]$SessionId, [string]$GitRoot)
    Join-Path $GitRoot (Join-Path ".context-capture" ".claude-conversation-delta-$SessionId")
}
function Get-PendingQuestionPath {
    param([string]$SessionId, [string]$GitRoot)
    Join-Path $GitRoot (Join-Path ".context-capture" ".pending-question-$SessionId")
}

function Test-AiflareConfig {
    param([string]$GitRoot)
    Test-Path (Join-Path $GitRoot "aiflare.yml")
}

function Read-AiflareConfig {
    param([string]$GitRoot)
    $cfg = Join-Path $GitRoot "aiflare.yml"
    if (-not (Test-Path $cfg)) { return $false }
    $script:AIFLARE_API_KEY  = ""
    $script:AIFLARE_ENDPOINT = ""
    foreach ($line in Get-Content -LiteralPath $cfg) {
        if ($line -match '^api_key:\s*(.+)$') {
            $script:AIFLARE_API_KEY = $Matches[1].Trim().Trim('"').Trim("'")
        } elseif ($line -match '^endpoint:\s*(.+)$') {
            $script:AIFLARE_ENDPOINT = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    if ([string]::IsNullOrEmpty($script:AIFLARE_API_KEY)) { return $false }
    if ([string]::IsNullOrEmpty($script:AIFLARE_ENDPOINT)) {
        $script:AIFLARE_ENDPOINT = "https://api.aiflare.dev"
    }
    return $true
}

function Test-ContextCaptureSkill {
    param([string]$GitRoot)
    Test-Path (Join-Path $GitRoot ".claude/skills/context-capture")
}

function _Write-Log {
    param([string]$Level, [string]$Message)
    $sidShort = ""
    if (-not [string]::IsNullOrEmpty($script:SESSION_ID)) {
        $sidShort = $script:SESSION_ID.Substring(0, [Math]::Min(8, $script:SESSION_ID.Length))
    }
    $hookName = if ($script:HOOK_NAME) { $script:HOOK_NAME } else { "unknown" }
    [Console]::Error.WriteLine("[$Level] [hook=$hookName session=$sidShort] $Message")
}
function Write-LogInfo  { param([string]$Msg) _Write-Log "INFO"  $Msg }
function Write-LogWarn  { param([string]$Msg) _Write-Log "WARN"  $Msg }
function Write-LogError { param([string]$Msg) _Write-Log "ERROR" $Msg }
