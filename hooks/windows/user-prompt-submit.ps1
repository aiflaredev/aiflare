$ErrorActionPreference = 'Stop'
$script:HOOK_NAME = 'user-prompt-submit'
. "$PSScriptRoot\_common.ps1"

if (-not (Read-HookInput)) { return }
$obj = $script:INPUT_RAW | ConvertFrom-Json
$prompt = $obj.prompt
if ([string]::IsNullOrEmpty($prompt)) { return }

$gitRoot = Get-GitRoot
if ([string]::IsNullOrEmpty($gitRoot)) { $gitRoot = (Get-Location).Path }
New-ContextDir -GitRoot $gitRoot
$promptFile = Get-PromptFilePath -SessionId $script:SESSION_ID -GitRoot $gitRoot

# Equivalent to bash 'jq -Rs .' byte-for-byte: ConvertTo-Json -Compress serializes the string as quoted JSON
$contentJson = $prompt | ConvertTo-Json -Compress
$line = '{"role":"user","content":' + $contentJson + '}'
Add-Content -LiteralPath $promptFile -Value $line
