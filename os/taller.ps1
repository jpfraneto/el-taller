# El Taller - arranque del instalador para Windows:  irm https://jpfraneto.com/taller.ps1 | iex
# Este archivo es ASCII a proposito. Baja el instalador de verdad (install.ps1, UTF-8 con BOM), lo decodifica
# como UTF-8 sin depender de los encabezados del servidor, le quita el BOM (que rompe "irm | iex") y lo corre.
& {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $u = 'https://jpfraneto.com/taller/install.ps1'
    if ($env:TALLER_PS1_URL) { $u = $env:TALLER_PS1_URL }
    try { $b = (New-Object Net.WebClient).DownloadData($u) }
    catch { Write-Host "  No pude descargar el instalador de El Taller ($u). Revisa tu internet y vuelve a intentar." -ForegroundColor Yellow; return }
    $s = [Text.Encoding]::UTF8.GetString($b).TrimStart([char]0xFEFF)
    & ([scriptblock]::Create($s))
}
