param([switch]$ApiOnly, [switch]$WithDiscord, [switch]$WebOnly)

$ErrorActionPreference = 'Stop'
$repoPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envPath = Join-Path $repoPath '.env'
$templatePath = Join-Path $repoPath '.env.example'

function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    } finally {
        $generator.Dispose()
    }
}

function Get-MissingValues($Values, [string[]]$Keys) {
    foreach ($key in $Keys) {
        $value = ([string]($Values.$key)).Trim()
        if ([string]::IsNullOrWhiteSpace($value) -or
            $value -match '^(cambia-|TU_TOKEN$|ID_DE_|RELLENA_|<|\.\.\.$)') {
            $key
        } elseif ($key -in @('DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID') -and
                  $value -notmatch '^[1-9][0-9]*$') {
            $key
        }
    }
}

function Show-DiscordHelp {
    Write-Host 'La web es una ayuda opcional para evaluar sin configurar Discord.'
    Write-Host ('Tutorial opcional del bot: ' + (Join-Path $repoPath 'docs/configurar-discord.md'))
    Write-Host 'Para continuar solo con la web, ejecuta scripts/start.ps1 -WebOnly.'
}

try {
    if (([int]$ApiOnly.IsPresent + [int]$WithDiscord.IsPresent + [int]$WebOnly.IsPresent) -gt 1) {
        throw 'Elige solo uno de -ApiOnly, -WithDiscord o -WebOnly.'
    }
    if (-not (Test-Path -LiteralPath $envPath)) {
        if (-not (Test-Path -LiteralPath $templatePath)) {
            throw 'No se encuentra .env.example junto a compose.yaml.'
        }
        $template = [System.IO.File]::ReadAllText($templatePath, [System.Text.Encoding]::UTF8)
        $template = $template.Replace('cambia-esta-contrasena-local', (New-LocalSecret))
        $template = $template.Replace('cambia-este-token-interno', (New-LocalSecret))
        $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($template)
        # CreateNew impide sobrescribir un archivo creado por otro proceso.
        $stream = [System.IO.File]::Open(
            $envPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write
        )
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        Write-Host 'Primera ejecucion: se ha creado el archivo de configuracion:'
        Write-Host $envPath
        Write-Host 'Las claves internas de PostgreSQL y de la API ya estan generadas.'
        Show-DiscordHelp
        if ($WithDiscord) {
            Write-Host 'Completa DISCORD_TOKEN, DISCORD_CLIENT_ID y DISCORD_GUILD_ID.'
            Write-Host 'Guardalo y vuelve a ejecutar con -WithDiscord.'
            Write-Host 'No se ha iniciado ningun contenedor.'
            exit 0
        }
        Write-Host 'Se iniciara el entorno local sin necesitar una cuenta Discord.'
    }

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'No se encuentra Docker. Instala Docker Desktop y vuelve a ejecutar el arranque.'
    }
    & docker info --format '{{.ServerVersion}}' > $null 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'El motor Docker no responde. Inicia Docker Desktop.' }
    & docker compose version > $null 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose no esta disponible.' }

    $composeArgs = @('compose', '--project-directory', $repoPath, '--env-file', $envPath)
    $inspectDiscord = -not ($ApiOnly -or $WebOnly)
    $profileArgs = @()
    if ($inspectDiscord) { $profileArgs = @('--profile', 'discord') }
    # Compose interpreta .env y las variables heredadas; no se imprime su JSON con secretos.
    $configOutput = & docker @composeArgs @profileArgs config --format json 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'La configuracion Compose no es valida.' }
    try {
        $config = ($configOutput -join [Environment]::NewLine) | ConvertFrom-Json
    } catch {
        throw 'No se pudo interpretar la configuracion Compose.'
    }
    $missing = @(Get-MissingValues $config.services.'radio-service'.environment @('POSTGRES_PASSWORD', 'SERVICE_TOKEN'))
    $botKeys = @('DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID')
    $botMissing = $botKeys
    if ($inspectDiscord) {
        $botMissing = @(Get-MissingValues $config.services.'discord-service'.environment $botKeys)
    }
    $enableDiscord = $inspectDiscord -and $botMissing.Count -eq 0
    if ($WithDiscord) { $missing += $botMissing }
    if ($missing.Count) {
        Write-Host ('Completa o corrige estos campos en ' + $envPath + ':')
        foreach ($key in $missing) { Write-Host ('- ' + $key) }
        Write-Host 'No se ha iniciado ningun contenedor. Tu archivo no se ha modificado.'
        if ($missing | Where-Object { $_ -like 'DISCORD_*' }) { Show-DiscordHelp }
        exit 1
    }
    if ($enableDiscord) {
        Write-Host 'Configuracion de Discord completa: se incluira el bot en el arranque.'
    } elseif ($inspectDiscord) {
        Write-Host 'Discord sin configurar o incompleto: se iniciaran web, API y PostgreSQL.'
        Write-Host ('Campos pendientes de Discord: ' + ($botMissing -join ', '))
    }

    if ($ApiOnly) {
        & docker @composeArgs up -d --build --wait radio-service
    } elseif ($enableDiscord) {
        & docker @composeArgs --profile discord up -d --build --wait web-service discord-service
    } else {
        & docker @composeArgs up -d --build --wait web-service
    }
    if ($LASTEXITCODE -ne 0) {
        if ($enableDiscord) { Show-DiscordHelp }
        throw 'No se pudo completar el arranque. Revisa el estado de Docker.'
    }
    Write-Host 'Entorno arrancado. API local: http://127.0.0.1:8000/docs (puerto configurable).'
    if (-not $ApiOnly) {
        Write-Host 'Escucha compartida: http://127.0.0.1:8080 (WEB_PORT configurable).'
        Write-Host 'Tutorial opcional de Discord: /ayuda/discord en esa web.'
    }
} catch {
    Write-Host ('Error: ' + $_.Exception.Message)
    exit 1
}
