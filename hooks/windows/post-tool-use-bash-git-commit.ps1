$ErrorActionPreference = 'Stop'
$script:HOOK_NAME = 'post-tool-use-bash-git-commit'
. "$PSScriptRoot\_common.ps1"

function Send-PromptFile {
    param([string]$SessionId, [string]$GitRoot)
    $promptFile = Get-PromptFilePath -SessionId $SessionId -GitRoot $GitRoot
    if (-not (Test-Path $promptFile)) { return }
    $content = Get-Content -LiteralPath $promptFile -Raw
    $body = @{ claudeSessionId = $SessionId; content = $content } | ConvertTo-Json -Compress -Depth 5
    try {
        Invoke-RestMethod `
            -Uri "$script:AIFLARE_ENDPOINT/api/v1/work-sessions/prompt" `
            -Method Put `
            -Headers @{ 'Content-Type' = 'application/json'; 'X-API-Key' = $script:AIFLARE_API_KEY } `
            -Body $body `
            -TimeoutSec 5 | Out-Null
    } catch {
        Write-LogWarn "prompt upload failed"
    }
}

function Update-Delta {
    param([string]$SessionId, [string]$GitRoot)
    $promptFile = Get-PromptFilePath -SessionId $SessionId -GitRoot $GitRoot
    $offsetFile = Get-OffsetFilePath -SessionId $SessionId -GitRoot $GitRoot
    $deltaFile  = Get-DeltaFilePath  -SessionId $SessionId -GitRoot $GitRoot
    if (-not (Test-Path $promptFile)) { return }
    $lastIndex = 0
    if (Test-Path $offsetFile) { $lastIndex = [int](Get-Content -LiteralPath $offsetFile -Raw) }
    $totalLines = (Get-Content -LiteralPath $promptFile).Count
    if ($totalLines -gt $lastIndex) {
        $delta = (Get-Content -LiteralPath $promptFile | Select-Object -Skip $lastIndex) -join "`n"
        Set-Content -LiteralPath $deltaFile -Value $delta -NoNewline
    }
    Set-Content -LiteralPath $offsetFile -Value $totalLines -NoNewline
}

function Emit-SkillTrigger {
    Write-Output '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"git commit completed. You must invoke the context-capture skill to capture the work context."}}'
}

function Invoke-Main {
    if (-not (Read-HookInput)) { return }
    $gitRoot = Get-GitRoot
    if ([string]::IsNullOrEmpty($gitRoot)) { return }
    if (Test-AiflareConfig $gitRoot) {
        if (Read-AiflareConfig $gitRoot) {
            Send-PromptFile -SessionId $script:SESSION_ID -GitRoot $gitRoot
            Update-Delta    -SessionId $script:SESSION_ID -GitRoot $gitRoot
        }
    }
    if (Test-ContextCaptureSkill $gitRoot) {
        Emit-SkillTrigger
    }
}
Invoke-Main
