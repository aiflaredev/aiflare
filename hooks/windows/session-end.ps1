$ErrorActionPreference = 'Stop'
$script:HOOK_NAME = 'session-end'
. "$PSScriptRoot\_common.ps1"

if (-not (Read-HookInput)) { return }
$gitRoot = Get-GitRoot
if ([string]::IsNullOrEmpty($gitRoot)) { $gitRoot = (Get-Location).Path }

# Clean up the 4 files in .context-capture/ on session end. No-op if files don't exist.
Remove-Item -Force -ErrorAction SilentlyContinue (Get-PromptFilePath        -SessionId $script:SESSION_ID -GitRoot $gitRoot)
Remove-Item -Force -ErrorAction SilentlyContinue (Get-OffsetFilePath        -SessionId $script:SESSION_ID -GitRoot $gitRoot)
Remove-Item -Force -ErrorAction SilentlyContinue (Get-DeltaFilePath         -SessionId $script:SESSION_ID -GitRoot $gitRoot)
Remove-Item -Force -ErrorAction SilentlyContinue (Get-PendingQuestionPath   -SessionId $script:SESSION_ID -GitRoot $gitRoot)
