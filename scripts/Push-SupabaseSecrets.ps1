[CmdletBinding()]
param(
  [string]$EnvFile = "",
  [string]$ProjectRef = 'kgcucxqtzqcsskhjfmzl'
)

$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $repoPath 'media-api\.env.production.upload'
}
$fullEnvFile = [IO.Path]::GetFullPath($EnvFile)
if (-not (Test-Path -LiteralPath $fullEnvFile)) {
  throw "Arquivo .env não encontrado: $fullEnvFile"
}

$values = @{}
foreach ($rawLine in [IO.File]::ReadAllLines($fullEnvFile)) {
  $line = $rawLine.Trim()
  if (-not $line -or $line.StartsWith('#')) { continue }
  $separator = $line.IndexOf('=')
  if ($separator -lt 1) { continue }
  $name = $line.Substring(0, $separator).Trim()
  $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
  $values[$name] = $value
}

foreach ($required in @('AUT_MEDIA_SIGNING_SECRET', 'AUTENTIKO_ALLOWED_ORIGINS', 'AUT_DRIVE_SYNC_WORKER_ENABLED')) {
  if (-not $values.ContainsKey($required) -or [string]::IsNullOrWhiteSpace($values[$required])) {
    throw "Variável necessária para a Edge Function ausente: $required"
  }
}

$temporaryFile = New-TemporaryFile
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryPath = [IO.Path]::GetFullPath($temporaryFile.FullName)
if (-not $temporaryPath.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'O arquivo temporário não está dentro do diretório temporário esperado.'
}

$supabaseEnv = @"
AUT_ALLOWED_ORIGINS=$($values['AUTENTIKO_ALLOWED_ORIGINS'])
AUT_MEDIA_SIGNING_SECRET=$($values['AUT_MEDIA_SIGNING_SECRET'])
AUT_DRIVE_SYNC_WORKER_ENABLED=$($values['AUT_DRIVE_SYNC_WORKER_ENABLED'])
"@

try {
  [IO.File]::WriteAllText($temporaryPath, $supabaseEnv, [Text.UTF8Encoding]::new($false))
  Push-Location $repoPath
  try {
    npx supabase secrets set --env-file $temporaryPath --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar os segredos ao Supabase.' }
    npx supabase secrets list --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao listar os segredos do Supabase.' }
  } finally {
    Pop-Location
  }
} finally {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }
}

Write-Host 'Segredos da Edge Function enviados ao Supabase.' -ForegroundColor Green
Write-Host 'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são fornecidas automaticamente às Edge Functions hospedadas.'
