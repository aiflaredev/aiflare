$ErrorActionPreference = 'Stop'
$script:HOOK_NAME = 'post-tool-use-ask-user-question'
. "$PSScriptRoot\_common.ps1"

if (-not (Read-HookInput)) { return }
$gitRoot = Get-GitRoot
if ([string]::IsNullOrEmpty($gitRoot)) { $gitRoot = (Get-Location).Path }
New-ContextDir -GitRoot $gitRoot
$path = Get-PendingQuestionPath -SessionId $script:SESSION_ID -GitRoot $gitRoot
New-Item -ItemType File -Force -Path $path | Out-Null
