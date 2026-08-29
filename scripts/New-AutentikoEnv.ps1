[CmdletBinding()]
param(
  [string]$OutputPath = "",
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $repoPath 'media-api\.env.production.upload'
}
$fullOutputPath = [IO.Path]::GetFullPath($OutputPath)

if ((Test-Path -LiteralPath $fullOutputPath) -and -not $Force) {
  throw "O arquivo já existe: $fullOutputPath. Use -Force somente se quiser substituí-lo."
}

function New-CryptoSecret([int]$byteCount = 48) {
  $bytes = New-Object byte[] $byteCount
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes)
}

$mediaSigningSecret = New-CryptoSecret
$dataApiKey = New-CryptoSecret
$dataSyncSecret = New-CryptoSecret

$contents = @"
# AUTENTIKO OK NUVEM - PRODUÇÃO
# Arquivo local ignorado pelo Git. Não envie este arquivo por e-mail/chat.

# Supabase: preencher somente a chave privada do projeto.
SUPABASE_URL=https://kgcucxqtzqcsskhjfmzl.supabase.co
SUPABASE_STORAGE_URL=https://kgcucxqtzqcsskhjfmzl.storage.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# Segredos internos gerados automaticamente.
AUT_MEDIA_SIGNING_SECRET=$mediaSigningSecret
AUTENTIKO_ALLOWED_ORIGINS=https://script.google.com
AUT_DRIVE_SYNC_WORKER_ENABLED=false

# Neon: cole a connection string pooled, iniciando por postgresql://.
DATABASE_URL=
AUT_DATA_API_KEY=$dataApiKey
AUT_DATA_SYNC_SECRET=$dataSyncSecret
AUT_DATA_ALLOWED_ORIGINS=https://script.google.com,https://script.googleusercontent.com
AUT_CONTRACT_FINAL_ENABLED=false

# APIs externas. Deixe vazio para não enviar aquela integração.
TRANSPARENCIA_API_KEY=
DATAJUD_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-latest
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
AUT_DATA_PUBLIC_URL=https://autentikonuvem.vercel.app

# Adobe opcional.
ADOBE_ENABLED=false
ADOBE_CLIENT_ID=
ADOBE_CLIENT_SECRET=
ADOBE_WEBHOOK_SECRET=
ADOBE_MONTHLY_LIMIT=500
"@

$parentPath = Split-Path -Parent $fullOutputPath
if (-not (Test-Path -LiteralPath $parentPath)) {
  [IO.Directory]::CreateDirectory($parentPath) | Out-Null
}
[IO.File]::WriteAllText($fullOutputPath, $contents, [Text.UTF8Encoding]::new($false))

Write-Host "Arquivo criado com segurança:" -ForegroundColor Green
Write-Host $fullOutputPath
Write-Host "Preencha SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL e as API keys desejadas."
