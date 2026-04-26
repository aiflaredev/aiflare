# AIFlare Capture Script (PowerShell)
# capture.sh PowerShell version
#
# Usage:
#   capture.ps1 -Title "title" -Intent "intent" -CommitHash "abc123" -AgentType "CLAUDE_CODE" `
#     -ClaudeSessionId "SESSION_ID" -ChangedFiles "file1.kt,file2.kt" -Tag "FEATURE" `
#     [-Alternatives "alternatives"] [-DiffSummary "diff summary"]

param(
    [string]$Title = $env:CB_TITLE,
    [string]$Intent = $env:CB_INTENT,
    [string]$CommitHash = $env:CB_COMMIT_HASH,
    [string]$AgentType = $(if ($env:CB_AGENT_TYPE) { $env:CB_AGENT_TYPE } else { "CLAUDE_CODE" }),
    [string]$ClaudeSessionId = $env:CB_CLAUDE_SESSION_ID,
    [string]$ChangedFiles = $env:CB_CHANGED_FILES,
    [string]$Tag = $env:CB_TAG,
    [string]$Alternatives = $env:CB_ALTERNATIVES,
    [string]$DiffSummary = $env:CB_DIFF_SUMMARY,
    [string]$ConversationSnippet = $env:CB_CONVERSATION_SNIPPET
)

$ErrorActionPreference = "Stop"

# --- Find config file (relative to git root) ---
$GitRoot = git rev-parse --show-toplevel 2>$null
if (-not $GitRoot) {
    Write-Host "AIFlare capture skipped: not a git repository."
    exit 0
}

$ConfigFile = Join-Path $GitRoot "aiflare.yml"
if (-not (Test-Path $ConfigFile)) {
    Write-Host "AIFlare capture skipped: aiflare.yml not found."
    exit 0
}

# --- Extract config values ---
$ApiKey = ""
$Endpoint = ""
foreach ($line in (Get-Content $ConfigFile)) {
    if ($line -match '^\s*api_key\s*:\s*(.+)$') {
        $ApiKey = $Matches[1].Trim().Trim('"').Trim("'")
    }
    if ($line -match '^\s*endpoint\s*:\s*(.+)$') {
        $Endpoint = $Matches[1].Trim().Trim('"').Trim("'")
    }
}

if (-not $Endpoint) { $Endpoint = "https://api.aiflare.dev" }

if (-not $ApiKey) {
    Write-Host "AIFlare capture skipped: api_key missing in aiflare.yml."
    exit 0
}

# --- claude-session-id fallback: extract from most recent prompt file ---
if (-not $ClaudeSessionId) {
    $CaptureDir = Join-Path $GitRoot ".context-capture"
    $LatestPrompt = Get-ChildItem -Path $CaptureDir -Filter ".claude-prompts-*" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($LatestPrompt) {
        $ClaudeSessionId = $LatestPrompt.Name -replace '^\.claude-prompts-', ''
    }
}

# --- conversation-snippet fallback: read from delta file ---
if (-not $ConversationSnippet -and $ClaudeSessionId) {
    $DeltaFile = Join-Path $GitRoot ".context-capture" ".claude-conversation-delta-$ClaudeSessionId"
    if (Test-Path $DeltaFile) {
        $ConversationSnippet = Get-Content $DeltaFile -Raw
        Remove-Item $DeltaFile -Force -ErrorAction SilentlyContinue
    }
}

# --- continuation flag: true if the commit happens right after an AskUserQuestion ---
$Continuation = $false
if ($ClaudeSessionId) {
    $PendingQuestionFile = Join-Path $GitRoot ".context-capture" ".pending-question-$ClaudeSessionId"
    if (Test-Path $PendingQuestionFile) {
        $Continuation = $true
        Remove-Item $PendingQuestionFile -Force -ErrorAction SilentlyContinue
    }
}

# --- Required field validation ---
if (-not $Title -or -not $Intent -or -not $CommitHash -or -not $ClaudeSessionId -or -not $ChangedFiles -or -not $Tag) {
    Write-Error "Error: -Title, -Intent, -CommitHash, -ClaudeSessionId, -ChangedFiles, -Tag are required."
    exit 1
}

# --- Build payload ---
$ChangedFilesArray = ($ChangedFiles -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$Branch = git rev-parse --abbrev-ref HEAD 2>$null

$Payload = @{
    title           = $Title
    intent          = $Intent
    alternatives    = $Alternatives
    diffSummary     = $DiffSummary
    commitHash      = $CommitHash
    agentType       = $AgentType
    claudeSessionId = $ClaudeSessionId
    changedFiles    = @($ChangedFilesArray)
    tag             = $Tag
    branch          = $Branch
    continuation    = $Continuation
}

if ($ConversationSnippet) {
    $Payload["conversationSnippet"] = $ConversationSnippet
}

$JsonBody = $Payload | ConvertTo-Json -Depth 10 -Compress

# --- API call ---
$Headers = @{
    "Content-Type" = "application/json"
    "X-API-Key"    = $ApiKey
}

# --- Error log helper ---
$ErrLogDir = Join-Path $GitRoot ".context-capture"
if (-not (Test-Path $ErrLogDir)) { New-Item -ItemType Directory -Path $ErrLogDir -Force | Out-Null }

function Write-ErrorLog {
    param([string]$Msg)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogFile = Join-Path $ErrLogDir "capture-error-$(Get-Date -Format 'yyyyMMddHHmmss').log"
    "[$Timestamp] $Msg | commit=$CommitHash title=$Title" | Out-File -FilePath $LogFile -Encoding utf8 -Append
}

try {
    $Response = Invoke-RestMethod -Uri "$Endpoint/api/v1/captures" -Method Post -Headers $Headers -Body $JsonBody -ErrorAction Stop
    Write-Host "AIFlare capture complete: $Title"
} catch {
    $StatusCode = $_.Exception.Response.StatusCode.value__
    switch ($StatusCode) {
        400 { Write-Host "AIFlare capture failed: invalid request data";               Write-ErrorLog "HTTP 400: invalid request data" }
        401 { Write-Host "AIFlare capture failed: API Key is invalid.";                Write-ErrorLog "HTTP 401: API Key is invalid" }
        404 { Write-Host "AIFlare capture failed: no project found for this API Key."; Write-ErrorLog "HTTP 404: no project found for this API Key" }
        429 { Write-Host "AIFlare capture failed: rate limit exceeded.";               Write-ErrorLog "HTTP 429: rate limit exceeded" }
        default { Write-Host "AIFlare capture failed: HTTP $StatusCode — server error."; Write-ErrorLog "HTTP ${StatusCode}: $($_.Exception.Message)" }
    }
}
