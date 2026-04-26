$ErrorActionPreference = 'Stop'
$script:HOOK_NAME = 'stop'
. "$PSScriptRoot\_common.ps1"

if (-not (Read-HookInput)) { return }
$obj = $script:INPUT_RAW | ConvertFrom-Json
$stopActive = "$($obj.stop_hook_active)"
if ($stopActive -eq 'true') { return }
$lastMsg = $obj.last_assistant_message
if ([string]::IsNullOrEmpty($lastMsg)) { return }

$gitRoot = Get-GitRoot
if ([string]::IsNullOrEmpty($gitRoot)) { $gitRoot = (Get-Location).Path }
New-ContextDir -GitRoot $gitRoot
$promptFile = Get-PromptFilePath -SessionId $script:SESSION_ID -GitRoot $gitRoot

$contentJson = $lastMsg | ConvertTo-Json -Compress
$line = '{"role":"assistant","content":' + $contentJson + '}'
Add-Content -LiteralPath $promptFile -Value $line
