[CmdletBinding()]
param(
  [string]$EnvFile = "",
  [ValidateSet('production', 'preview', 'development')]
  [string]$Environment = 'production'
)

$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$mediaPath = Join-Path $repoPath 'media-api'
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $mediaPath '.env.production.upload'
}
$fullEnvFile = [IO.Path]::GetFullPath($EnvFile)

if (-not (Test-Path -LiteralPath $fullEnvFile)) {
  throw "Arquivo .env não encontrado: $fullEnvFile"
}
if (-not (Test-Path -LiteralPath (Join-Path $mediaPath '.vercel\project.json'))) {
  throw "A pasta media-api não está vinculada a um projeto Vercel. Execute npx vercel link dentro dela."
}

function Read-DotEnv([string]$Path) {
  $items = @()
  foreach ($rawLine in [IO.File]::ReadAllLines($Path)) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $separator = $line.IndexOf('=')
    if ($separator -lt 1) { throw "Linha inválida no .env: $rawLine" }
    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if ($name -notmatch '^[A-Z][A-Z0-9_]*$') {
      throw "Nome de variável inválido: $name"
    }
    $items += [pscustomobject]@{ Name = $name; Value = $value }
  }
  return $items
}

$items = @(Read-DotEnv $fullEnvFile)
$byName = @{}
foreach ($item in $items) { $byName[$item.Name] = $item.Value }

$requiredNames = @(
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AUT_MEDIA_SIGNING_SECRET',
  'AUTENTIKO_ALLOWED_ORIGINS',
  'DATABASE_URL',
  'AUT_DATA_API_KEY',
  'AUT_DATA_SYNC_SECRET',
  'AUT_DATA_ALLOWED_ORIGINS'
)
foreach ($name in $requiredNames) {
  if (-not $byName.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($byName[$name])) {
    throw "Preencha a variável obrigatória $name no arquivo $fullEnvFile"
  }
}
if ($byName['SUPABASE_URL'] -notmatch '^https://[a-z0-9]+\.supabase\.co/?$') {
  throw 'SUPABASE_URL inválida. Use https://kgcucxqtzqcsskhjfmzl.supabase.co'
}
if ($byName['DATABASE_URL'] -notmatch '^postgresql://') {
  throw 'DATABASE_URL inválida. Use a connection string pooled do Neon iniciando por postgresql://'
}

$sensitiveNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
@(
  'SUPABASE_SERVICE_ROLE_KEY', 'AUT_MEDIA_SIGNING_SECRET', 'DATABASE_URL',
  'AUT_DATA_API_KEY', 'AUT_DATA_SYNC_SECRET', 'TRANSPARENCIA_API_KEY',
  'DATAJUD_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY',
  'ADOBE_CLIENT_SECRET', 'ADOBE_WEBHOOK_SECRET'
) | ForEach-Object { [void]$sensitiveNames.Add($_) }

$npxCommand = Get-Command npx -ErrorAction Stop
Push-Location $mediaPath
try {
  foreach ($item in $items) {
    if ([string]::IsNullOrWhiteSpace($item.Value)) {
      Write-Host "[IGNORADA] $($item.Name) está vazia." -ForegroundColor DarkYellow
      continue
    }
    $arguments = @('vercel', 'env', 'add', $item.Name, $Environment, '--force')
    if ($sensitiveNames.Contains($item.Name)) { $arguments += '--sensitive' }

    # Windows PowerShell transforma algumas mensagens informativas do npx
    # escritas em stderr em NativeCommandError quando ErrorActionPreference=Stop.
    # Capture a saída e decida pelo exit code real do processo.
    $previousErrorPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $commandOutput = $item.Value | & $npxCommand.Source @arguments 2>&1 | Out-String
      $commandExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorPreference
    }
    if ($commandExitCode -ne 0) {
      throw "Falha ao enviar $($item.Name) ao Vercel.`n$commandOutput"
    }
    Write-Host "[OK] $($item.Name)" -ForegroundColor Green
  }
  & $npxCommand.Source vercel env ls $Environment
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao listar as variáveis do Vercel.' }
} finally {
  Pop-Location
}

Write-Host "Envio ao Vercel concluído. Faça um novo deploy para aplicar as alterações." -ForegroundColor Green
