param(
  [Parameter(Mandatory = $true)][string]$CliPath,
  [Parameter(Mandatory = $true)][string]$TokenFile,
  [Parameter(Mandatory = $true)][string]$SecretsFile,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z]{20}$')][string]$ProjectRef
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $CliPath -PathType Leaf)) {
  throw 'Executável do Supabase CLI não encontrado.'
}
if (-not (Test-Path -LiteralPath $TokenFile -PathType Leaf)) {
  throw 'Token temporário do Supabase não encontrado.'
}
if (-not (Test-Path -LiteralPath $SecretsFile -PathType Leaf)) {
  throw 'Arquivo temporário de secrets não encontrado.'
}

try {
  $env:SUPABASE_ACCESS_TOKEN = [IO.File]::ReadAllText($TokenFile).Trim()
  if ($env:SUPABASE_ACCESS_TOKEN.Length -lt 32) {
    throw 'Token temporário do Supabase inválido.'
  }

  & $CliPath secrets set --env-file $SecretsFile --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & $CliPath functions deploy media-api --project-ref $ProjectRef --no-verify-jwt --workdir .
  exit $LASTEXITCODE
}
finally {
  $env:SUPABASE_ACCESS_TOKEN = $null
  if (Test-Path -LiteralPath $TokenFile) {
    Remove-Item -LiteralPath $TokenFile -Force
  }
}
