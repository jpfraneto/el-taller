# El Taller · instalador del día 0 (Windows, PowerShell 5.1 o más nuevo). Versión 0.2.0
#   irm https://jpfraneto.com/taller.ps1 | iex     (taller.ps1 es un arranque ASCII que baja este archivo: ver os/taller.ps1)
#   Ensayo (muestra todo, no cambia nada):  $env:TALLER_ENSAYO=1; irm https://jpfraneto.com/taller.ps1 | iex
#   Desde un archivo:  powershell -ExecutionPolicy Bypass -File install.ps1 -Ensayo
# Pruebas: $env:TALLER_AUTO=1; $env:TALLER_NEGOCIO="Mi Negocio"; [$env:TALLER_DUENO, $env:TALLER_HOME]
# Otras: $env:TALLER_FUENTE (carpeta con plantilla\), $env:TALLER_URL (os.tar.gz)
# Todo va dentro de funciones y se llama al final: una descarga cortada no ejecuta medio script.

$script:TallerVersion = '0.2.0'
$script:UrlPaquete = 'https://jpfraneto.com/taller/os.tar.gz'

# ───────────────────────── ayudantes ─────────────────────────
function Paso($n, $t) { Write-Host ''; Write-Host "── Paso $n · $t" -ForegroundColor Cyan }
function Di { foreach ($l in $args) { Write-Host "  $l" } }
function Ok($t) { Write-Host '  OK ' -ForegroundColor Green -NoNewline; Write-Host $t }
function Ojo($t) { Write-Host '  !  ' -ForegroundColor Yellow -NoNewline; Write-Host $t }
function Cmd($t) { Write-Host "    $t" -ForegroundColor DarkGray }
function Es-Ensayo { return $script:Ensayo }
function Es-Auto { return $script:Auto }

function Pausa($t = 'Enter para seguir') {
    if (Es-Auto) { return }
    [void](Read-Host "  [$t]")
}
function Preguntar($t, $def = '') {
    if (Es-Auto) { return $def }
    $p = "  $t"; if ($def) { $p += " ($def)" }
    $r = Read-Host $p
    if ([string]::IsNullOrWhiteSpace($r)) { return $def } else { return $r.Trim() }
}
function Si-No($t, $def) {
    $r = Preguntar "$t [s/n]" $def
    return ($r -match '^[sSyY]')
}
function Hacer($desc, [scriptblock]$sb) {  # sin capturar la salida: el dueño ve lo que pasa (y los programas siguen siendo interactivos)
    if (Es-Ensayo) { Write-Host "    (ensayo) haría: $desc" -ForegroundColor DarkGray; return }
    & $sb
}
function Abrir($url) {
    Write-Host "    -> $url" -ForegroundColor Cyan
    if ((Es-Ensayo) -or (Es-Auto)) { return }
    try { Start-Process $url } catch { Ojo 'No pude abrir el navegador: copia el link de arriba.' }
}
$script:Utf8 = New-Object System.Text.UTF8Encoding $false
function En($rel) { return (Join-Path $script:Dir ($rel -replace '[\\/]', [IO.Path]::DirectorySeparatorChar)) }  # ruta dentro de la carpeta del negocio
function Registrar($paso, $estado, $detalle) {
    $o = [ordered]@{ fecha = (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'); paso = $paso; estado = $estado; detalle = "$detalle"; modo = $script:Modo }
    $script:Reg += ($o | ConvertTo-Json -Compress) + "`n"
    if ($estado -eq 'pendiente') { $script:Pendientes += "  · ${paso}: $detalle`n" }
    Volcar
}
function Volcar {
    if ((Es-Ensayo) -or -not $script:Dir -or -not (Test-Path (En '.taller'))) { return }
    [IO.File]::AppendAllText((En '.taller/instalacion.jsonl'), $script:Reg, $script:Utf8); $script:Reg = ''
}
function Hacer-Slug($s) {
    $n = $s.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', ''
    $n = ($n.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
    if ($n.Length -gt 40) { $n = $n.Substring(0, 40).Trim('-') }
    return $n
}
function Rellenar($src, $dst) {
    $t = [IO.File]::ReadAllText($src, [Text.Encoding]::UTF8)
    $t = $t.Replace('{{NEGOCIO}}', $script:Negocio).Replace('{{DUENO}}', $script:Dueno).Replace('{{FECHA}}', $script:Hoy)
    [IO.File]::WriteAllText($dst, $t, $script:Utf8)
}
function Cuenta-Lista($nombre) {
    $f = En 'negocio/cuentas.md'
    if (-not (Test-Path $f)) { return $false }
    return [bool](Select-String -Path $f -Pattern ('^- \[x\] ' + [regex]::Escape($nombre) + ' · ') -Encoding UTF8 -Quiet)
}
function Marcar-Cuenta($nombre, $estado) {
    $f = En 'negocio/cuentas.md'
    $m = ' '; $t = "todavía no (revisado $($script:Hoy))"
    if ($estado -eq 'lista') { $m = 'x'; $t = "lista ($($script:Hoy))" }
    if ((Es-Ensayo) -or -not (Test-Path $f)) { Write-Host "  (anotaría en cuentas.md: $nombre -> $t)" -ForegroundColor DarkGray; return }
    $pat = '^- \[[ x]\] ' + [regex]::Escape($nombre) + ' · '
    $lineas = [IO.File]::ReadAllLines($f, [Text.Encoding]::UTF8) | ForEach-Object {
        if ($_ -match $pat) { $a = ($_.Substring(6)) -split ' · '; "- [$m] $($a[0]) · $($a[1]) · $t" } else { $_ }
    }
    [IO.File]::WriteAllText($f, (($lineas -join "`n") + "`n"), $script:Utf8)
}
function Refrescar-Path {  # suma lo que un instalador recién agregó al PATH, sin abrir otra ventana
    $env:Path = $env:Path + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $bin = Join-Path $script:Perfil '.local\bin'
    if ((Test-Path $bin) -and ($env:Path -notlike "*$bin*")) { $env:Path = "$bin;$env:Path" }
}
function Git-Ok { if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return $false }; & git --version *> $null; return ($LASTEXITCODE -eq 0) }
function Claude-Ok { if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { return $false }; & claude --version *> $null; return ($LASTEXITCODE -eq 0) }
function Claude-Version { return ((& claude --version 2>$null) | Select-Object -First 1) }
function Claude-Sesion {
    if (-not (Claude-Ok)) { return $false }
    try { $j = (& claude auth status --json 2>$null | Out-String) | ConvertFrom-Json; return [bool]$j.loggedIn } catch { return $false }
}

# ───────────────────────── fuente: plantilla\ (con .claude\skills) ─────────────────────────
function Buscar-Fuente {
    if ($env:TALLER_FUENTE) { $script:Src = $env:TALLER_FUENTE; return }
    if ($PSScriptRoot -and (Test-Path (Join-Path (Join-Path (Join-Path $PSScriptRoot 'plantilla') '.claude') 'skills'))) { $script:Src = $PSScriptRoot; return }
    $url = $script:UrlPaquete; if ($env:TALLER_URL) { $url = $env:TALLER_URL }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('eltaller-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile (Join-Path $tmp 'os.tar.gz') -ErrorAction Stop
        & tar -xzf (Join-Path $tmp 'os.tar.gz') -C $tmp
        if (Test-Path (Join-Path (Join-Path (Join-Path $tmp 'plantilla') '.claude') 'skills')) { $script:Src = $tmp; return }
    } catch { }
    Ojo "No pude descargar los archivos de El Taller ($url)."
    if (Es-Ensayo) { $script:Src = ''; return }
    Di 'Revisa tu internet y vuelve a correr el comando. Si sigue, avísale a JP.'
    throw 'sin-fuente'
}

# ───────────────────────── pasos ─────────────────────────
function Paso-Bienvenida {
    $e = ''; if (Es-Ensayo) { $e = ' · ensayo: no cambio nada' }
    Write-Host ''; Write-Host "  El Taller · día 0 (v$($script:TallerVersion)$e)" -ForegroundColor White
    Di '' 'Hoy dejamos a Claude (una inteligencia artificial) trabajando para tu negocio: se acuerda de lo que le cuentas' `
       'y te ayuda a pensar y a hacer. Vive en tu computador y, más adelante, también en el WhatsApp de tu negocio.' `
       '' 'Funciona sobre tres herramientas, todas a tu nombre:' `
       'Meta (WhatsApp + Instagram), Claude (el cerebro) y Mercado Pago (donde entra la plata).' `
       'Tú haces cada paso; yo te explico antes qué es y para qué sirve. Son 8 pasos, unos 30-45 minutos.' `
       'Si algo no se entiende, pregúntale a JP: para eso está al lado tuyo.'
    Pausa 'Enter para empezar'
}

function Paso-Sistema {
    Paso 1 'Tu computador'
    $v = 'Windows'
    try { $v = (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).Caption } catch { }
    $build = [Environment]::OSVersion.Version.Build
    $arq = $env:PROCESSOR_ARCHITECTURE
    Di 'Primero miro qué computador tienes, para instalar lo que corresponde.'
    Ok "Tienes $v (build $build), procesador $arq."
    if ($build -lt 17763) { Ojo 'Claude Code pide Windows 10 versión 1809 o más nuevo. Habla con JP antes de seguir.' }
    Registrar 'sistema' 'ok' "$v $build $arq"
}

function Paso-Carpeta {
    Paso 2 'La carpeta de tu negocio'
    Di 'Todo lo de tu negocio va a vivir en una carpeta de este computador: lo que Claude sabe de ti,' `
       'tus reglas, tus decisiones. Es tuya: la puedes copiar, respaldar o llevarte a otro lado.'
    $script:Negocio = "$env:TALLER_NEGOCIO"
    while (-not $script:Negocio) {
        if (Es-Auto) { throw 'Falta TALLER_NEGOCIO' }
        $script:Negocio = Preguntar '¿Cómo se llama tu negocio?'
    }
    $d = 'Dueño'; if ($env:TALLER_DUENO) { $d = $env:TALLER_DUENO }
    $script:Dueno = Preguntar '¿Y cómo te llamas tú?' $d
    $slug = Hacer-Slug $script:Negocio; if (-not $slug) { $slug = 'mi-negocio' }
    $slug = Hacer-Slug (Preguntar "La carpeta se va a llamar `"$slug`". Enter si está bien, o escribe otro nombre:" $slug)
    if (-not $slug) { $slug = 'mi-negocio' }
    $script:Slug = $slug; $script:Dir = Join-Path $script:Base $slug
    if (Test-Path $script:Dir) { Ok "La carpeta ya existe: $($script:Dir). La uso tal cual, no borro nada." }
    else { Hacer "crear $($script:Dir)" { New-Item -ItemType Directory -Force -Path $script:Dir | Out-Null }; Ok "Carpeta lista: $($script:Dir)" }
    if (-not (Es-Ensayo)) { New-Item -ItemType Directory -Force -Path (En '.taller') | Out-Null }
    Registrar 'carpeta' 'ok' "$($script:Negocio) -> $($script:Dir) (dueño: $($script:Dueno))"
}

function Paso-Git {
    Paso 3 'El historial'
    Di 'Ahora el historial: todo cambio en tu carpeta queda guardado y se puede deshacer.' `
       'Si Claude (o tú) se equivoca, volvemos atrás. La herramienta se llama git.'
    if (-not (Git-Ok)) {
        Di 'Este computador no tiene git. Lo instalo con winget, el instalador oficial de Windows:'
        Cmd 'winget install --id Git.Git -e'
        if (Es-Auto) { Ojo '(modo prueba: no instalo nada)' }
        elseif (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
            Ojo 'No encuentro winget. Descarga Git desde la página oficial e instálalo con las opciones que vienen.'
            Abrir 'https://git-scm.com/downloads/win'; Pausa 'Enter cuando termine la instalación'
        } else {
            Pausa 'Enter para instalar (puede pedirte permiso de administrador: di que sí)'
            Hacer 'winget install --id Git.Git -e' { & winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements }
        }
        Refrescar-Path
    }
    if (-not (Git-Ok) -and -not (Es-Ensayo)) {
        Ojo 'Git todavía no está. Seguimos igual; vuelve a correr este instalador después y lo dejo listo.'
        Registrar 'git' 'pendiente' 'git no instalado'; return
    }
    if (Test-Path (En '.git')) { Ok 'El historial ya estaba activo.' }
    else { Hacer "git init $($script:Dir)" { & git -C $script:Dir init -q }; Ok 'Historial activo en tu carpeta.' }
    Registrar 'git' 'ok' ((& git --version 2>$null) | Out-String).Trim()
}

function Paso-Claude {
    Paso 4 'Claude, el cerebro'
    Di 'Claude es con quien vas a hablar de tu negocio: le preguntas, le pides cosas, y él usa tu carpeta' `
       'como memoria. Es la única herramienta que vas a tener que aprender.' `
       'Necesitas una cuenta tuya con el plan Pro (US$20 al mes, lo pagas tú, con tu tarjeta).'
    Refrescar-Path
    if (Claude-Ok) { Ok "Claude Code ya está instalado ($(Claude-Version))." }
    else {
        Di 'Instalo Claude Code con el instalador oficial de Anthropic:'; Cmd 'irm https://claude.ai/install.ps1 | iex'
        if (Es-Auto) { Ojo '(modo prueba: no instalo nada)' }
        else {
            Pausa 'Enter para instalar'
            # En otro proceso: el instalador oficial termina con "exit" y cerraría esta ventana.
            Hacer 'irm https://claude.ai/install.ps1 | iex' { & powershell -NoProfile -ExecutionPolicy Bypass -Command 'irm https://claude.ai/install.ps1 | iex' }
            Refrescar-Path
        }
        if (Claude-Ok) { Ok 'Claude Code instalado.' } elseif (-not (Es-Ensayo)) { Ojo 'Claude Code no quedó instalado. JP te ayuda; después vuelve a correr esto.' }
    }
    $bin = Join-Path $script:Perfil '.local\bin'
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ((Claude-Ok) -and (Test-Path (Join-Path $bin 'claude.exe')) -and ("$userPath" -notlike "*$bin*") -and -not (Es-Ensayo) -and -not (Es-Auto)) {
        Di 'Para que el comando "claude" funcione en cualquier ventana, hay que agregar su carpeta a tu PATH.'
        if (Si-No '¿La agrego?' 's') { [Environment]::SetEnvironmentVariable('Path', "$userPath;$bin", 'User'); Ok 'Agregada.' }
    }
    if (-not (Claude-Ok)) { Registrar 'claude' 'pendiente' 'Claude Code no instalado'; return }
    if (Claude-Sesion) { Ok 'Ya tienes tu cuenta conectada en este computador.' }
    else {
        if (-not (Si-No '¿Ya tienes cuenta de Claude con plan Pro?' 'n')) {
            Di 'Abro la página de planes: crea tu cuenta (con el correo del negocio) y elige Pro.'; Abrir 'https://claude.com/pricing'
            Pausa 'Enter cuando tengas tu cuenta Pro'
        }
        Di 'Ahora conectamos este computador con tu cuenta. Se abre el navegador: entras, autorizas y vuelves aquí.'
        if (Es-Auto) { Ojo '(modo prueba: no inicio sesión)' } else { Pausa; Hacer 'claude auth login' { & claude auth login } }
        if (Claude-Sesion) { Ok 'Listo: Claude te reconoce.' } else { Ojo 'Todavía no veo la sesión. Después: escribe claude en una terminal y entra.' }
    }
    Di 'Claude también tiene app de escritorio, más cómoda que la terminal para el día a día.'
    if (Si-No '¿Abro la página para descargarla?' 's') { Abrir 'https://claude.com/download'; Pausa 'Enter cuando la tengas (o para seguir sin ella)' }
    if (Claude-Sesion) { Marcar-Cuenta 'Claude' 'lista'; Registrar 'claude' 'ok' "$(Claude-Version), sesión iniciada" }
    else { Registrar 'claude' 'pendiente' 'falta iniciar sesión (claude auth login)' }
}

function Paso-Memoria {
    Paso 5 'La memoria de tu negocio'
    Di 'Ahora le armo a Claude su memoria: una carpeta "negocio" con lo que sabe de ti.' `
       'Quién eres, tus reglas, tus decisiones (con su porqué), tus tareas y lo que falta saber.' `
       'Son archivos de texto simples: los puedes leer y corregir tú.'
    if (-not $script:Src) { Ojo '(ensayo: sin archivos de plantilla a mano)'; Registrar 'memoria' 'saltado' 'sin fuente'; return }
    $n = 0; $k = 0
    foreach ($f in 'CLAUDE.md', 'negocio/amigo.md', 'negocio/identidad.md', 'negocio/decisiones.md', 'negocio/reglas.md', 'negocio/proyectos.md', 'negocio/tareas.md', 'negocio/preguntas.md', 'negocio/cuentas.md', 'gitignore') {
        $rel = $f; if ($f -eq 'gitignore') { $rel = '.gitignore' }
        $dst = En $rel
        if (Test-Path $dst) { $k++; continue }
        if (Es-Ensayo) { Write-Host "  (ensayo) crearía $rel" -ForegroundColor DarkGray }
        else { New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null; Rellenar (Join-Path (Join-Path $script:Src 'plantilla') ($f -replace '/', [IO.Path]::DirectorySeparatorChar)) $dst; $script:Creados += $rel }
        $n++
    }
    $x = ''; if ($k -gt 0) { $x = ", $k ya existían (no los toqué)" }
    Ok "Memoria lista: $n archivos nuevos$x."
    Registrar 'memoria' 'ok' "$n nuevos, $k existentes"
}

function Paso-Skills {
    Paso 6 'Lo que Claude aprende de El Taller'
    Di 'Le enseño a Claude seis cosas (quedan dentro de tu carpeta, en .claude\skills):' `
       '  /dia-cero    te entrevista sobre tu negocio y lo anota en tu carpeta (lo hacemos al final)' `
       '  /plan        le mandas tu plan y lo ordena en proyectos, tareas y decisiones' `
       '  /recordar    guarda una decisión o regla, con fecha y porqué' `
       '  /mi-negocio  te resume cómo vas y qué falta' `
       '  /compartir   abre (y el día 30 cierra) el mes con JP: tu carpeta en un repositorio privado tuyo' `
       '  /reels       tu grabación del día → 1 a 5 reels que salen solos (la primera vez, descubren tu formato)' `
       'Y el plugin oficial de Mercado Pago, para que sepa cobrar con su documentación oficial.'
    $cmds = @(
        @('plugin', 'marketplace', 'add', 'anthropics/claude-plugins-official'),
        @('plugin', 'install', 'mercadopago@claude-plugins-official', '--scope', 'project'))
    if ($script:Src) {  # las skills son de El Taller: se renuevan siempre (las del dueño, si tiene otras, no se tocan)
        $lista = ''
        foreach ($sk in Get-ChildItem -Directory (Join-Path (Join-Path (Join-Path $script:Src 'plantilla') '.claude') 'skills')) {
            $lista += " /$($sk.Name)"; $script:Nuestras += ".claude/skills/$($sk.Name)"; $dst = En ".claude/skills/$($sk.Name)"
            if (Es-Ensayo) { Write-Host "  (ensayo) renovaría .claude/skills/$($sk.Name)" -ForegroundColor DarkGray; continue }
            New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
            if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
            Copy-Item -Recurse -Force $sk.FullName $dst
        }
        Ok "Skills al día:$lista"
    }
    if (Es-Ensayo) {
        Write-Host "  (ensayo) en $($script:Dir) correría:" -ForegroundColor DarkGray
        foreach ($c in $cmds) { Cmd ('claude ' + ($c -join ' ')) }
        Registrar 'skills' 'saltado' 'ensayo'; return
    }
    $fallo = ''
    if (Claude-Ok) {
        $err = En '.taller/plugins.err'
        Push-Location $script:Dir
        try {
            foreach ($c in $cmds) {
                $out = & claude @c 2>&1
                if ($LASTEXITCODE -ne 0) { $fallo = "claude $($c -join ' ')"; ($out | Out-String) | Out-File -Append -Encoding utf8 $err; break }
            }
        } finally { Pop-Location }
    } else { $fallo = 'sin-claude' }
    if (-not $fallo) {
        Ok 'Y conoce Mercado Pago.'
        Registrar 'skills' 'ok' 'dia-cero, plan, recordar, mi-negocio + mercadopago@claude-plugins-official'; return
    }
    $set = En '.claude/settings.json'
    if (-not (Test-Path $set)) {  # dejarlo declarado: Claude avisa que falta instalarlo
        New-Item -ItemType Directory -Force -Path (Split-Path $set) | Out-Null
        $j = [ordered]@{ enabledPlugins = [ordered]@{ 'mercadopago@claude-plugins-official' = $true } }
        [IO.File]::WriteAllText($set, ($j | ConvertTo-Json -Depth 4), $script:Utf8)
    }
    Ojo "No pude instalar el plugin de Mercado Pago ($fallo). Quedó anotado; vuelve a correr esto cuando Claude esté listo."
    Registrar 'skills' 'pendiente' "plugin de Mercado Pago no instalado ($fallo), ver .taller\plugins.err"
}

function Cuenta($nombre, $url, $l1, $l2, $pregunta = '') {  # url vacía = no hay página
    Write-Host ''; Write-Host "  $nombre" -ForegroundColor White; Di $l1 $l2
    if (Cuenta-Lista $nombre) { Ok 'Ya estaba lista.'; return }
    if ($url) {
        if ((Es-Auto) -or (Si-No '¿Abro la página?' 's')) { Abrir $url }
        Pausa 'Enter cuando termines (o si lo dejas para después)'
    }
    if (-not $pregunta) { $pregunta = "¿Quedó lista la cuenta de ${nombre}?" }
    if (Si-No $pregunta 'n') { Marcar-Cuenta $nombre 'lista'; Ok "Anotado: $nombre lista."; Registrar "cuenta $nombre" 'ok' 'lista' }
    else { Marcar-Cuenta $nombre 'pendiente'; Di 'Anotado como pendiente. Sin problema: se puede hacer después.'; Registrar "cuenta $nombre" 'pendiente' 'por crear' }
}
function Paso-Cuentas {
    Paso 7 'Tus cuentas'
    Di 'Tres cuentas y un chip, todo a tu nombre. Las cuentas las creas tú; yo abro la página oficial y te explico.' `
       'Nunca escribas aquí contraseñas ni claves: solo anoto si la cuenta existe o no.'
    Cuenta 'Mercado Pago' 'https://www.mercadopago.cl/developers/panel/app' `
        'Donde entra la plata. Necesitas tu cuenta de Mercado Pago de vendedor (si no tienes, la creas).' `
        'La página es el panel de desarrolladores: ahí después se conectan tus cobros. Hoy basta con entrar.'
    Cuenta 'Meta Business' 'https://business.facebook.com/' `
        'Donde están tus clientes: junta tu Instagram y tu WhatsApp Business en un solo lugar.' `
        'Entra con tu Facebook o Instagram y crea (o elige) el portafolio de tu negocio.'
    Cuenta 'Cloudflare' 'https://dash.cloudflare.com/sign-up' `
        'Donde van a vivir las apps de tu negocio (reservas, pagos, tu página). El plan gratis basta.' `
        'Crea la cuenta con el correo del negocio.'
    Cuenta 'Chip prepago' '' `
        'El WhatsApp de tu negocio: un chip prepago nuevo (Entel, WOM, Movistar, Claro...), con una carga chica al mes (unos $1.000).' `
        'Va en un teléfono de la pega, que se queda en el negocio. No le instales WhatsApp: el número se conecta desde el panel.' `
        '¿Ya tienes el chip?'
}

function Paso-Final {
    Paso 8 'Listo'
    $x = ''; if ($script:Pendientes) { $x = ' con pendientes' }
    Registrar 'final' 'ok' "fin$x"
    if ((Git-Ok) -and (Test-Path (En '.git')) -and -not (Es-Ensayo)) {
        $msg = "Día 0: instalación de El Taller (v$($script:TallerVersion))"
        & git -C $script:Dir rev-parse -q --verify HEAD *> $null
        if ($LASTEXITCODE -eq 0) {  # re-ejecución: solo lo del instalador, no los cambios del dueño
            $msg = "El Taller: instalador corrido de nuevo (v$($script:TallerVersion))"
            $rutas = @(@('.taller', '.claude/settings.json', 'negocio/cuentas.md') + $script:Nuestras | Where-Object { Test-Path (En $_) })
            if ($rutas.Count -gt 0) { & git -C $script:Dir add -A -- @rutas }
            if ($script:Creados.Count -gt 0) { & git -C $script:Dir add -- @($script:Creados) }
        } else { & git -C $script:Dir add -A }
        & git -C $script:Dir diff --cached --quiet
        if ($LASTEXITCODE -ne 0) {
            $who = @()
            & git -C $script:Dir config user.name *> $null; if ($LASTEXITCODE -ne 0) { $who += @('-c', "user.name=$($script:Dueno)") }
            & git -C $script:Dir config user.email *> $null; if ($LASTEXITCODE -ne 0) { $who += @('-c', "user.email=$($script:Slug)@eltaller.local") }
            & git -C $script:Dir @who commit -q -m $msg
            if ($LASTEXITCODE -eq 0) { Ok 'Guardé todo en el historial.' }
        }
    }
    Di 'Para hablar con Claude, de cualquiera de estas dos formas:' `
       "  - App de Claude: pestaña Code, y eliges la carpeta $($script:Dir)" `
       "  - Terminal:  cd `"$($script:Dir)`"; claude" `
       'La primera vez te pregunta si confías en la carpeta: di que sí. Y escríbele:' ''
    Write-Host '      "Hola, hagamos el día cero"' -ForegroundColor White; Write-Host ''
    if ($script:Pendientes) { Di 'Quedó pendiente (vuelve a correr este instalador cuando quieras, no rompe nada):'; Write-Host -NoNewline $script:Pendientes }
    if (Es-Ensayo) { Di '' 'Esto fue un ensayo: no cambié nada en tu computador.' }
}

function Invoke-ElTaller {
    $script:Ensayo = ($env:TALLER_ENSAYO -eq '1') -or ($args -contains '-Ensayo') -or ($args -contains '--ensayo')
    $script:Auto = ($env:TALLER_AUTO -eq '1')
    $script:Reg = ''; $script:Pendientes = ''; $script:Dir = ''; $script:Src = ''; $script:Creados = @(); $script:Nuestras = @()
    $script:Modo = 'normal'; if ($script:Ensayo) { $script:Modo = 'ensayo' }; if ($script:Auto) { $script:Modo += '+auto' }
    $script:Perfil = $env:USERPROFILE; if (-not $script:Perfil) { $script:Perfil = $HOME }
    if ((Test-Path variable:IsWindows) -and -not $IsWindows -and $env:TALLER_FORZAR -ne '1') {  # TALLER_FORZAR=1: solo para probar en Mac/Linux
        Ojo 'Esto no es Windows. En macOS o Linux usa:'; Cmd 'curl -fsSL https://jpfraneto.com/taller.sh | bash'; return
    }
    $script:Base = Join-Path $script:Perfil 'ElTaller'; if ($env:TALLER_HOME) { $script:Base = $env:TALLER_HOME }
    $script:Hoy = Get-Date -Format 'yyyy-MM-dd'
    try {
        Paso-Bienvenida; Buscar-Fuente
        Paso-Sistema; Paso-Carpeta; Paso-Git; Paso-Claude; Paso-Memoria; Paso-Skills; Paso-Cuentas; Paso-Final
    } catch {
        Ojo "Me detuve: $($_.Exception.Message). Puedes volver a correr el comando cuando quieras; no rompe nada."
    }
}

Invoke-ElTaller @args
