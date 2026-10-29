# =================================================================
#  INFOBOARD: ECHTE CHROME-FENSTER
#
#  Läuft am Infoboard-PC (Wunsch Patrick 29. Oktober 2026: „kannst du
#  nicht den Browser anzeigen?“). Viele Webseiten lassen sich nicht in
#  der App einbetten. Für Webseiten-Felder mit dem Häkchen „Als echtes
#  Chrome-Fenster am Infoboard-PC“ meldet die Anzeige, wo sie auf dem
#  Bildschirm liegen (sql/infoboard-fenster.sql). Dieses Programm liest
#  das alle 5 Sekunden und legt je Feld ein Chrome-Fenster ohne Rahmen
#  genau darüber, immer im Vordergrund. Fehlt die Meldung länger als
#  drei Minuten (Anzeige zu, PC ohne Netz), schliesst es die Fenster.
#
#  Programmfenster (Wunsch Patrick 29. Oktober 2026, Tapo-Kamera mit
#  BlueStacks): Felder mit „programm“ meinen ein Fenster, das schon
#  läuft, gefunden am Titel. Es wird nie geschlossen, nur darüber gelegt
#  und die gemeldeten Ränder weggeschnitten (Leisten von BlueStacks).
#  Fehlt es, startet die Desktop-Verknüpfung mit dem gemeldeten Namen
#  (höchstens alle zwei Minuten). Ohne Meldung kommt es in die Taskleiste.
#
#  Jedes Feld hat ein eigenes Chrome-Profil unter
#  C:\Hofer\InfoboardFenster\profile, so bleibt eine Anmeldung auf
#  der Seite erhalten.
#
#  Aufruf:
#     .\infoboard-fenster.ps1 -Einrichten   einmal: kopiert sich nach
#                                           C:\Hofer\InfoboardFenster und
#                                           startet ab jetzt mit Windows
#     .\infoboard-fenster.ps1 -Probe        zeigt, was die Anzeige meldet
#     .\infoboard-fenster.ps1               läuft (unsichtbar beim Start)
#
#  Windows PowerShell 5.1 reicht, nichts zu installieren, kein Passwort.
# =================================================================

param([switch]$Einrichten, [switch]$Probe)

$ErrorActionPreference = "Stop"
$U   = "https://lzhqwbxfwqamauntehof.supabase.co"
$KEY = "sb_publishable_MLN71MehUtWldj_GVLDBvw_OCJODSCW"
$BOARD = "haupt"
$ZIEL = "C:\Hofer\InfoboardFenster"
$protDatei = Join-Path $ZIEL "infoboard-fenster.log"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  Write-Host $zeile
  try {
    if (-not (Test-Path $ZIEL)) { New-Item -ItemType Directory -Path $ZIEL | Out-Null }
    Add-Content -Path $protDatei -Value $zeile -Encoding UTF8
    $alle = Get-Content -Path $protDatei -Encoding UTF8
    if ($alle.Count -gt 2000) { $alle | Select-Object -Last 1500 | Set-Content -Path $protDatei -Encoding UTF8 }
  } catch { }
}

function Lesen {
  $kopf = @{ apikey = $KEY; Authorization = "Bearer $KEY"; "Content-Type" = "application/json" }
  $body = '{"p_board":"' + $BOARD + '"}'
  return Invoke-RestMethod -Method Post -Uri "$U/rest/v1/rpc/infoboard_fenster_lesen" -Headers $kopf -Body $body -TimeoutSec 15
}

# ---------- Einrichten ----------
if ($Einrichten) {
  if (-not (Test-Path $ZIEL)) { New-Item -ItemType Directory -Path $ZIEL | Out-Null }
  $quelle = $MyInvocation.MyCommand.Path
  $ziel = Join-Path $ZIEL "infoboard-fenster.ps1"
  if ($quelle -ne $ziel) { Copy-Item -Path $quelle -Destination $ziel -Force }
  # Verknüpfung im Autostart: startet bei jeder Anmeldung unsichtbar
  $autostart = [Environment]::GetFolderPath("Startup")
  $wsh = New-Object -ComObject WScript.Shell
  $lnk = $wsh.CreateShortcut((Join-Path $autostart "Infoboard Fenster.lnk"))
  $lnk.TargetPath = "powershell.exe"
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ziel`""
  $lnk.WorkingDirectory = $ZIEL
  $lnk.WindowStyle = 7
  $lnk.Save()
  Write-Host "Eingerichtet: startet ab jetzt bei jeder Anmeldung an diesem PC."
  try { $d = Lesen; Write-Host ("Verbindung ok, gemeldete Fenster: " + @($d.fenster).Count) } catch { Write-Host ("Verbindung ging nicht: " + $_.Exception.Message) }
  Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ziel`"" -WindowStyle Hidden
  Write-Host "Läuft jetzt im Hintergrund."
  exit 0
}

if ($Probe) {
  $d = Lesen
  Write-Host ("Meldung vor " + [math]::Round($d.alter_s) + " Sekunden")
  foreach ($f in @($d.fenster)) { Write-Host ("  " + $(if ($f.programm) { "Programm " + $f.programm } else { $f.adresse }) + "  bei " + $f.x + "," + $f.y + "  " + $f.w + " x " + $f.h) }
  exit 0
}

# Nur einmal laufen
$sperre = New-Object System.Threading.Mutex($false, "Global\HoferInfoboardFenster")
if (-not $sperre.WaitOne(0)) { exit 0 }

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class IbFenster {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr nach, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern int SetWindowRgn(IntPtr h, IntPtr rgn, bool neu);
  [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int l, int o, int r, int u);
}
"@
# Pixel wie die Anzeige sie meldet, nicht von Windows hochgerechnet
[IbFenster]::SetProcessDPIAware() | Out-Null

function ChromePfad {
  foreach ($p in @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                   "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
                   "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
                   "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}
$chrome = ChromePfad
if (-not $chrome) { Schreibe "Chrome nicht gefunden"; exit 1 }

$laufend = @{}   # id -> @{ proc, adresse, zoom, start, hwnd }

function Schliessen($id) {
  $e = $laufend[$id]
  if ($e -and $e.proc -and -not $e.proc.HasExited) { try { $e.proc.Kill() } catch { } }
  $laufend.Remove($id)
}

function Starten($f) {
  $profil = Join-Path $ZIEL ("profile\" + ($f.id -replace "[^a-zA-Z0-9]", ""))
  $faktor = [double]$f.f * [double]$f.zoom / 100
  if ($faktor -le 0) { $faktor = 1 }
  $argumente = @("--app=`"" + $f.adresse + "`"", "--user-data-dir=`"$profil`"", "--no-first-run", "--no-default-browser-check",
    "--disable-session-crashed-bubble", "--hide-crash-restore-bubble",
    ("--force-device-scale-factor=" + $faktor.ToString([Globalization.CultureInfo]::InvariantCulture)),
    ("--window-position=" + $f.x + "," + $f.y), ("--window-size=" + $f.w + "," + $f.h))
  $p = Start-Process -FilePath $chrome -ArgumentList $argumente -PassThru
  $laufend[$f.id] = @{ proc = $p; adresse = $f.adresse; zoom = $f.zoom; start = Get-Date; hwnd = [IntPtr]::Zero }
  Schreibe ("Geöffnet: " + $f.adresse)
}

function Legen($e, $f) {
  if ($e.hwnd -eq [IntPtr]::Zero -or -not [IbFenster]::IsWindow($e.hwnd)) {
    try { $e.proc.Refresh(); $e.hwnd = $e.proc.MainWindowHandle } catch { return }
    if ($e.hwnd -eq [IntPtr]::Zero) { return }
  }
  # Ohne Titelleiste und Rand (GWL_STYLE: WS_CAPTION und WS_THICKFRAME weg)
  $stil = [IbFenster]::GetWindowLong($e.hwnd, -16)
  $neu = $stil -band (-bnot 0x00C00000) -band (-bnot 0x00040000)
  if ($neu -ne $stil) { [IbFenster]::SetWindowLong($e.hwnd, -16, $neu) | Out-Null }
  # Immer im Vordergrund (HWND_TOPMOST), genau aufs Feld, ohne den Fokus zu nehmen
  [IbFenster]::SetWindowPos($e.hwnd, [IntPtr](-1), [int]$f.x, [int]$f.y, [int]$f.w, [int]$f.h, 0x0010 -bor 0x0020 -bor 0x0040) | Out-Null
}

# ---------- Programmfenster (BlueStacks usw.) ----------
$programme = @{}   # id -> @{ hwnd, start, rgn }

function ProgrammSuchen([string]$titel) {
  $p = Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle -like ("*" + $titel + "*") } | Select-Object -First 1
  if ($p) { return $p.MainWindowHandle }
  return [IntPtr]::Zero
}

function VerknuepfungStarten([string]$name) {
  if (-not $name) { return }
  foreach ($ort in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("CommonDesktopDirectory"))) {
    $lnk = Join-Path $ort ($name + ".lnk")
    if (Test-Path $lnk) { Start-Process -FilePath $lnk; Schreibe ("Gestartet: " + $lnk); return }
  }
  Schreibe ("Verknüpfung nicht gefunden: " + $name + ".lnk auf dem Desktop")
}

function ProgrammLegen($f) {
  $id = [string]$f.id
  $e = $programme[$id]
  if (-not $e) { $e = @{ hwnd = [IntPtr]::Zero; start = [datetime]::MinValue; rgn = "" }; $programme[$id] = $e }
  if ($e.hwnd -eq [IntPtr]::Zero -or -not [IbFenster]::IsWindow($e.hwnd)) {
    $e.hwnd = ProgrammSuchen ([string]$f.programm)
    $e.rgn = ""
    if ($e.hwnd -eq [IntPtr]::Zero) {
      if (((Get-Date) - $e.start).TotalMinutes -ge 2) { $e.start = Get-Date; VerknuepfungStarten ([string]$f.verknuepfung) }
      return
    }
    Schreibe ("Gefunden: " + $f.programm)
  }
  if ([IbFenster]::IsIconic($e.hwnd)) { [IbFenster]::ShowWindow($e.hwnd, 9) | Out-Null }
  $s = $f.schnitt
  $o = [int]$s.oben; $r = [int]$s.rechts; $u = [int]$s.unten; $l = [int]$s.links
  $stil = [IbFenster]::GetWindowLong($e.hwnd, -16)
  $neu = $stil -band (-bnot 0x00C00000) -band (-bnot 0x00040000)
  if ($neu -ne $stil) { [IbFenster]::SetWindowLong($e.hwnd, -16, $neu) | Out-Null }
  # Fenster um die Ränder grösser, die Ränder liegen ausserhalb des Felds und werden weggeschnitten
  $bw = [int]$f.w + $l + $r; $bh = [int]$f.h + $o + $u
  [IbFenster]::SetWindowPos($e.hwnd, [IntPtr](-1), [int]$f.x - $l, [int]$f.y - $o, $bw, $bh, 0x0010 -bor 0x0020 -bor 0x0040) | Out-Null
  $schluessel = "$o,$r,$u,$l,$bw,$bh"
  if ($e.rgn -ne $schluessel) {
    $rgn = [IbFenster]::CreateRectRgn($l, $o, $bw - $r, $bh - $u)
    [IbFenster]::SetWindowRgn($e.hwnd, $rgn, $true) | Out-Null
    $e.rgn = $schluessel
  }
}

function ProgrammWeg($id) {
  $e = $programme[$id]
  if ($e -and $e.hwnd -ne [IntPtr]::Zero -and [IbFenster]::IsWindow($e.hwnd)) {
    # Nicht mehr im Vordergrund (HWND_NOTOPMOST), ganzes Fenster zurück, in die Taskleiste
    [IbFenster]::SetWindowPos($e.hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0010) | Out-Null
    [IbFenster]::SetWindowRgn($e.hwnd, [IntPtr]::Zero, $true) | Out-Null
    [IbFenster]::ShowWindow($e.hwnd, 6) | Out-Null
  }
  $programme.Remove($id)
}

Schreibe "Gestartet"
while ($true) {
  try {
    $d = Lesen
    $liste = @()
    $progListe = @()
    if ($d.alter_s -lt 180) {
      $liste = @($d.fenster) | Where-Object { $_ -and $_.adresse -and -not $_.programm }
      $progListe = @($d.fenster) | Where-Object { $_ -and $_.programm }
    }
    $ids = @($liste | ForEach-Object { [string]$_.id })
    foreach ($id in @($laufend.Keys)) { if ($ids -notcontains $id) { Schliessen $id; Schreibe "Geschlossen: $id" } }
    $progIds = @($progListe | ForEach-Object { [string]$_.id })
    foreach ($id in @($programme.Keys)) { if ($progIds -notcontains $id) { ProgrammWeg $id; Schreibe "Weggelegt: $id" } }
    foreach ($f in $progListe) { ProgrammLegen $f }
    foreach ($f in $liste) {
      $id = [string]$f.id
      $e = $laufend[$id]
      $alt = $e -and $f.neuLaden -gt 0 -and ((Get-Date) - $e.start).TotalMinutes -ge $f.neuLaden
      if (-not $e -or $e.proc.HasExited -or $e.adresse -ne $f.adresse -or $e.zoom -ne $f.zoom -or $alt) {
        if ($e) { Schliessen $id }
        Starten $f
        Start-Sleep -Seconds 2
        $e = $laufend[$id]
      }
      Legen $e $f
    }
  } catch {
    Schreibe ("Fehler: " + $_.Exception.Message)
  }
  Start-Sleep -Seconds 5
}
