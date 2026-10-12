$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskBackend = Join-Path $taskRoot 'dictate-app/backend'
$taskFrontend = Join-Path $taskRoot 'dictate-app/frontend'
$taskPython = Join-Path $taskBackend '.venv/Scripts/python.exe'

if (-not (Test-Path -LiteralPath $taskPython)) {
    throw 'Backend virtual environment is missing. Follow the setup steps in README.md first.'
}
if (-not (Test-Path -LiteralPath (Join-Path $taskFrontend 'node_modules'))) {
    throw 'Frontend packages are missing. Run npm ci in dictate-app/frontend first.'
}

$taskSettingNames = 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'
$taskSavedSettings = @{}
foreach ($taskName in $taskSettingNames) {
    $taskSavedSettings[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process')
}

Push-Location $taskBackend
try {
    # Unit tests replace all external providers. Local values allow provider
    # clients to import without reading credentials or making network requests.
    if (-not $env:SUPABASE_URL) { $env:SUPABASE_URL = 'https://127.0.0.1.invalid' }
    if (-not $env:SUPABASE_ANON_KEY) { $env:SUPABASE_ANON_KEY = 'local-unit-test-anon-key' }
    if (-not $env:SUPABASE_SERVICE_ROLE_KEY) { $env:SUPABASE_SERVICE_ROLE_KEY = 'local-unit-test-service-key' }

    & $taskPython -m pyright --project (Join-Path $taskRoot 'pyrightconfig.json')
    if ($LASTEXITCODE -ne 0) { throw 'Python type checking failed.' }
    & $taskPython -m unittest discover -s tests
    if ($LASTEXITCODE -ne 0) { throw 'Backend unit tests failed.' }
    & $taskPython -m pip check
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependency check failed.' }
}
finally {
    Pop-Location
    foreach ($taskName in $taskSettingNames) {
        [Environment]::SetEnvironmentVariable($taskName, $taskSavedSettings[$taskName], 'Process')
    }
}

Push-Location $taskFrontend
try {
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'Frontend lint, tests or production build failed.' }
}
finally { Pop-Location }

Write-Output 'All standard project checks passed.'
