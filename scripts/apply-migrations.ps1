<#
Apply all SQL migrations in `supabase/migrations` to a Postgres database.

Usage:
  - Set the environment variable `SUPABASE_DB_CONN` to your Postgres connection string,
    e.g. "postgres://postgres:password@db.host:5432/postgres".
  - Or pass the connection string as the first argument to the script.

Examples (PowerShell):
  $env:SUPABASE_DB_CONN = "postgres://postgres:password@db.host:5432/postgres"
  .\scripts\apply-migrations.ps1

  .\scripts\apply-migrations.ps1 "postgres://postgres:password@db.host:5432/postgres"

Notes:
  - Requires `psql` to be installed and available in PATH.
  - Run against a fresh Supabase database (this script will execute SQL files in order).
  - Review migration files before running.
#>

param(
  [string]$Conn = $env:SUPABASE_DB_CONN
)

if (-not $Conn -or $Conn.Trim() -eq "") {
  Write-Error "Postgres connection string not provided. Set SUPABASE_DB_CONN or pass it as an argument."
  exit 2
}

$migrationsDir = Join-Path -Path $PSScriptRoot -ChildPath "..\supabase\migrations"
if (-not (Test-Path $migrationsDir)) {
  Write-Error "Migrations directory not found: $migrationsDir"
  exit 3
}

# Get SQL files in lexicographic order
$sqlFiles = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name

if ($sqlFiles.Count -eq 0) {
  Write-Host "No SQL files found in $migrationsDir"
  exit 0
}

Write-Host "Applying $($sqlFiles.Count) migration(s) to: $Conn"

foreach ($file in $sqlFiles) {
  Write-Host "\n--- Applying $($file.Name) ---"
  $fullPath = $file.FullName

  $start = Get-Date
  $exitCode = & psql $Conn -f $fullPath
  $duration = (Get-Date) - $start

  if ($LASTEXITCODE -ne 0) {
    Write-Error "psql exited with code $LASTEXITCODE while applying $($file.Name). Stopping."
    exit $LASTEXITCODE
  }

  Write-Host "Applied $($file.Name) in $($duration.TotalSeconds) seconds."
}

Write-Host "\nAll migrations applied successfully."