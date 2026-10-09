# =================================================================
#  NEUER RECHNER — eine Aufgabe "HoferTool" für alles
#
#  Richtet auf einem Windows-Rechner im Betrieb die Aufgabe "HoferTool"
#  ein (Wunsch Patrick 8. Oktober 2026: eine Aufgabe für alles, im
#  Hintergrund, ohne Knöpfe). Sie startet alle fünf Minuten unsichtbar
#  hofertool.ps1, und das erledigt nacheinander:
#    - Solar: Werte vom Solar-Log an die App (solarlog.ps1)
#    - WBG: lädt die WBGs aus dem Pool-Ordner hoch und löscht sie dort
#      (dokumente-pool.ps1). Der einzige Ordner, in dem gelöscht wird.
#    - Zeichnungen: lädt neue und geänderte PDFs aus dem Zeichnungs-
#      Ordner hoch (zeichnungen.ps1). Liest nur.
#    - Einrichtblätter: lädt neue und geänderte Excel-Dateien aus den
#      Typ-Ordnern hoch (einrichtblaetter.ps1). Liest nur.
#  Hat sich nichts geändert, tut sie nichts. Sie läuft unter dem
#  angemeldeten Konto, weil nur dieses auf die Netzlaufwerke kommt,
#  ohne dass ein Passwort eingegeben werden muss. Darum läuft sie nur,
#  solange dieses Konto angemeldet ist (gesperrt reicht).
#
#  Die Sicherung macht seit 111.109.0 die App selbst (Einstellungen →
#  Backup), ohne Programm; die frühere Aufgabe "Hofer Sicherung" und
#  sicherung.ps1 räumt dieses Skript weg.
#
#  Was das Skript tut:
#    1. Lädt die Programme von GitHub nach C:\Hofer\Abgleich.
#    2. Sucht den Solar-Log im Netz selbst (oder fragt nach der Adresse).
#    3. Fragt nach dem Solar-Schlüssel und dem Dienstkonto und trägt
#       sie in die Einstellungsdateien ein.
#    4. Probiert beides aus, ohne etwas zu schreiben.
#    5. Legt die Aufgabe "HoferTool" an und entfernt die früheren
#       einzelnen Aufgaben ("Hofer Solar", "Hofer Dokumente", "Hofer
#       Sicherung" usw.). Sonst bleibt nichts zurück:
#       kein Dienst, kein Autostart.
#
#  Start (PowerShell, am besten "Als Administrator ausführen"):
#     [Net.ServicePointManager]::SecurityProtocol='Tls12'; iwr -UseBasicParsing https://raw.githubusercontent.com/HoferTool/hofertool/main/skripte/einrichten.ps1?t=$(Get-Random) -OutFile $env:TEMP\einrichten.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\einrichten.ps1
#
#  Nochmals ausführen ist gefahrlos: Was schon eingetragen ist, bleibt
#  mit Enter stehen, die Programme werden neu geholt, die Aufgaben
#  ersetzt.
#
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([string]$Ziel = "C:\Hofer\Abgleich")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$QUELLE = "https://raw.githubusercontent.com/HoferTool/hofertool/main/skripte"
# Adresse und öffentlicher Schlüssel der App, stehen auch im Code der
# Website und sind nicht geheim
$U   = "https://lzhqwbxfwqamauntehof.supabase.co"
$KEY = "sb_publishable_MLN71MehUtWldj_GVLDBvw_OCJODSCW"
$POOL = "C:\Hofer\Pool"

function Titel([string]$t) { Write-Host ""; Write-Host "== $t ==" -ForegroundColor Cyan }
function Gut([string]$t)   { Write-Host "   $t" -ForegroundColor Green }
function Warn([string]$t)  { Write-Host "   $t" -ForegroundColor Yellow }
function Info([string]$t)  { Write-Host "   $t" }

function Fertig([int]$code) {
  Write-Host ""
  Read-Host "Enter drücken zum Schliessen" | Out-Null
  exit $code
}

# Eine Frage mit Vorgabe: Enter behält, was schon da ist
function Frage([string]$text, [string]$vorgabe) {
  if ($vorgabe) { $a = Read-Host "$text [Enter = behalten]" } else { $a = Read-Host $text }
  $a = ([string]$a).Trim()
  if (-not $a) { return $vorgabe }
  return $a
}

function Leer($wert) { return (-not $wert) -or ([string]$wert -match "HIER|DEIN-PROJEKT") }

function JsonLesen([string]$datei) {
  if (-not (Test-Path $datei)) { return $null }
  try { return Get-Content -Raw -Path $datei -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

# UTF-8 mit BOM, wie alle Dateien in skripte/
function JsonSchreiben([string]$datei, $objekt) {
  $text = $objekt | ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText($datei, $text, (New-Object Text.UTF8Encoding($true)))
}

$istAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
            ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host "Hofer Tool: Aufgabe HoferTool einrichten (Solar, WBG, Zeichnungen, Einrichtblätter)" -ForegroundColor Cyan
Write-Host "Ordner: $Ziel"
if (-not $istAdmin) {
  Warn "Ohne Administratorrechte lassen sich frühere Aufgaben unter SYSTEM (Hofer Solar) nicht entfernen."
  Warn "Besser: PowerShell mit Rechtsklick -> 'Als Administrator ausführen' öffnen und nochmals starten."
}

# ---------- 1. Programme holen ----------
Titel "1. Programme holen"
New-Item -ItemType Directory -Force -Path $Ziel | Out-Null
foreach ($n in @("hofertool.ps1", "solarlog.ps1", "dokumente-pool.ps1", "zeichnungen.ps1", "einrichtblaetter.ps1", "drucken.ps1", "dokumente-teile.ps1", "unsichtbar.vbs")) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri ("$QUELLE/${n}?t=" + [DateTime]::UtcNow.Ticks) -OutFile (Join-Path $Ziel $n) -TimeoutSec 60
    Unblock-File -Path (Join-Path $Ziel $n) -ErrorAction SilentlyContinue
    Gut "$n geholt"
  } catch {
    Warn "$n liess sich nicht holen: $($_.Exception.Message)"
    if (-not (Test-Path (Join-Path $Ziel $n))) { Warn "Ohne Internet geht es nicht weiter."; Fertig 1 }
    Info "Die vorhandene Fassung bleibt."
  }
}

# ---------- 2. Solar-Log suchen ----------
Titel "2. Solar-Log im Netz suchen"
$solarDatei = Join-Path $Ziel "solar-einstellungen.json"
$S = JsonLesen $solarDatei
$adresse = ""; $solarPw = ""; $solarKey = ""
if ($S) {
  if (-not (Leer $S.solarlog_adresse)) { $adresse = [string]$S.solarlog_adresse }
  $solarPw = [string]$S.solarlog_passwort
  if (-not (Leer $S.solar_schluessel)) { $solarKey = [string]$S.solar_schluessel }
}

# Antwortet unter dieser Adresse ein Solar-Log? Er gibt seine Werte über
# /getjp heraus; mit Zugangsschutz antwortet er dort mit "DENIED".
# Rückgabe: "" = kein Solar-Log, "offen" oder "passwort"
function SolarLogArt([string]$adr, [int]$sek) {
  if ($adr -notmatch "^https?://") { $adr = "http://" + $adr }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$adr/getjp" -ContentType "text/plain" `
      -Body '{"801":{"170":null}}' -TimeoutSec $sek
    $roh = $r.Content
    if ($roh -is [byte[]]) { $roh = [Text.Encoding]::UTF8.GetString($roh) }
    if ([string]$roh -match "DENIED") { return "passwort" }
    if ([string]$roh -match '"801"') { return "offen" }
  } catch { }
  return ""
}
function IstSolarLog([string]$adr, [int]$sek) { return [bool](SolarLogArt $adr $sek) }

function SolarLogSuchen {
  foreach ($name in @("solar-log", "solarlog")) {
    Info "Versuche $name ..."
    if (IstSolarLog $name 4) { return $name }
  }
  # Sonst das eigene Netz absuchen: alle Adressen mit offenem Anschluss 80
  $netze = @()
  try {
    $netze = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" } |
      ForEach-Object { ($_.IPAddress -split "\.")[0..2] -join "." } | Select-Object -Unique
  } catch { }
  foreach ($netz in $netze) {
    Info "Suche im Netz $netz.x ..."
    $versuche = @()
    for ($i = 1; $i -le 254; $i++) {
      $c = New-Object Net.Sockets.TcpClient
      $versuche += [pscustomobject]@{ ip = "$netz.$i"; client = $c; aufgabe = $c.ConnectAsync("$netz.$i", 80) }
    }
    Start-Sleep -Milliseconds 2000
    $offen = @($versuche | Where-Object { $_.aufgabe.Status -eq "RanToCompletion" -and $_.client.Connected } |
               ForEach-Object { $_.ip })
    $versuche | ForEach-Object { try { $_.client.Close() } catch { } }
    foreach ($ip in $offen) {
      if (IstSolarLog $ip 3) { return $ip }
    }
  }
  return ""
}

if ($adresse -and (IstSolarLog $adresse 5)) {
  Gut "Solar-Log antwortet unter $adresse"
} else {
  if ($adresse) { Warn "Unter $adresse antwortet kein Solar-Log, ich suche neu." }
  $gefunden = SolarLogSuchen
  if ($gefunden) {
    $adresse = $gefunden
    Gut "Solar-Log gefunden: $adresse"
  } else {
    Warn "Kein Solar-Log gefunden. Die Adresse steht am Solar-Log selbst (Display oder Aufkleber)"
    Warn "oder im Router unter den verbundenen Geräten."
    $adresse = Frage "Adresse des Solar-Log, z.B. 192.168.1.50 (leer = Solar überspringen)" ""
  }
}
$solarAn = [bool]$adresse
if ($solarAn -and (SolarLogArt $adresse 5) -eq "passwort") {
  Warn "Der Solar-Log ist mit einem Passwort geschützt (Benutzer-Passwort des Solar-Log)."
  $solarPw = Frage "Passwort des Solar-Log" $solarPw
}

# ---------- 3. Schlüssel und Dienstkonto ----------
if ($solarAn) {
  Titel "3a. Solar-Schlüssel"
  Info "Steht nach dem SQL im Supabase SQL Editor in der Zeile 'DEIN SOLAR-SCHLÜSSEL'."
  Info "Dort doppelklicken, Strg + C, hier mit Rechtsklick einfügen."
  do {
    $solarKey = Frage "Solar-Schlüssel" $solarKey
    $ok = $solarKey -match "^[0-9a-f]{40,}$"
    if (-not $ok) { Warn "Das sieht nicht nach dem Schlüssel aus (lange Reihe aus 0-9 und a-f)."; $solarKey = "" }
  } until ($ok)
  JsonSchreiben $solarDatei ([ordered]@{
    solarlog_adresse  = $adresse
    solarlog_passwort = $solarPw
    solar_schluessel  = $solarKey
  })
  Gut "solar-einstellungen.json gespeichert"
}

Titel "3b. Dienstkonto für den Pool"
Info "Das Konto, mit dem das Programm Dateien in die App lädt (Rolle 'Dienstkonto')."
$abgDatei = Join-Path $Ziel "abgleich-einstellungen.json"
$A = JsonLesen $abgDatei
$mail = "abgleich@hoferco.ch"; $pw = ""
if ($A) {
  if (-not (Leer $A.email)) { $mail = [string]$A.email }
  if (-not (Leer $A.passwort)) { $pw = [string]$A.passwort }
}
$mail = Frage "E-Mail des Dienstkontos" $mail

function Anmelden([string]$m, [string]$p) {
  $b = @{ email = $m; password = $p } | ConvertTo-Json -Compress
  try {
    $r = Invoke-RestMethod -Method Post -Uri "$U/auth/v1/token?grant_type=password" `
      -Headers @{ apikey = $KEY } -ContentType "application/json; charset=utf-8" `
      -Body ([Text.Encoding]::UTF8.GetBytes($b)) -TimeoutSec 30
    return $r
  } catch { return $null }
}

$poolAn = $false
for ($versuch = 1; $versuch -le 3; $versuch++) {
  if (-not $pw -or $versuch -gt 1) {
    $sec = Read-Host "Passwort des Dienstkontos (wird nicht angezeigt)" -AsSecureString
    $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  }
  if (-not $pw) { break }
  $anm = Anmelden $mail $pw
  if ($anm -and $anm.access_token) {
    $token = $anm.access_token
    # Ist es wirklich ein Dienstkonto?
    $rolle = $null
    try {
      $p = Invoke-RestMethod -Uri "$U/rest/v1/profiles?select=role&id=eq.$($anm.user.id)" -TimeoutSec 30 `
        -Headers @{ apikey = $KEY; Authorization = "Bearer $token" }
      $rolle = @($p)[0].role
    } catch { }
    Gut "Anmeldung als $mail klappt."
    if ($rolle -and $rolle -ne "dienst" -and $rolle -ne "admin") {
      Warn "Das Konto hat die Rolle '$rolle'. In der App unter Einstellungen -> Nutzer auf 'Dienstkonto' stellen."
    }
    $poolAn = $true
    break
  }
  Warn "Anmeldung mit $mail klappt nicht (E-Mail oder Passwort falsch, oder das Konto gibt es noch nicht)."
}
if ($poolAn) {
  JsonSchreiben $abgDatei ([ordered]@{
    supabase_url = $U
    anon_key     = $KEY
    email        = $mail
    passwort     = $pw
  })
  # Den Pool-Ordner bestimmt die App (Einstellungen -> Dokumente ->
  # Pool-Ordner), darum steht er nicht in der Datei. Für die Probe muss
  # es ihn geben.
  try {
    $k = Invoke-RestMethod -Uri "$U/rest/v1/app_config?select=wert&schluessel=eq.dok_pool_pfad" -TimeoutSec 30 `
      -Headers @{ apikey = $KEY; Authorization = "Bearer $token" }
    $w = [string](@($k)[0].wert)
    if ($w.Trim()) { $POOL = $w.Trim() }
  } catch { }
  Gut "abgleich-einstellungen.json gespeichert (enthält das Passwort, niemandem schicken)"
} else {
  Warn "Pool wird übersprungen. Dienstkonto anlegen (Anleitung Schritt 2) und dieses Skript nochmals starten."
}

# Laufwerksbuchstaben wie G: gibt es nur in der eigenen Anmeldung. Im
# Administrator-Fenster und in der Aufgabenplanung fehlen sie oft. Dann
# den Netzpfad nehmen, den Windows sich für dieses Laufwerk merkt
# (HKCU:\Network\G → \\Server\Freigabe).
function PfadAufloesen([string]$p) {
  $p = ([string]$p).Trim()
  $m = [regex]::Match($p, '^([A-Za-z]):(.*)$')
  if (-not $m.Success) { return $p }
  if (Test-Path -LiteralPath ($m.Groups[1].Value + ":\")) { return $p }
  try {
    $netz = (Get-ItemProperty -Path ("HKCU:\Network\" + $m.Groups[1].Value.ToUpper()) -ErrorAction Stop).RemotePath
    if ($netz) { return ($netz.TrimEnd("\") + $m.Groups[2].Value) }
  } catch { }
  return $p
}

# ---------- 4. Probe ----------
Titel "4. Ausprobieren (schreibt nichts)"
if ($solarAn) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Ziel "solarlog.ps1") -Probe
  if ($LASTEXITCODE -ne 0) {
    Warn "Solar klappt noch nicht, siehe Meldung oben. Die Aufgabe wird trotzdem angelegt,"
    Warn "nach einer Korrektur in solar-einstellungen.json läuft sie von selbst."
  }
}
if ($poolAn) {
  $poolEcht = PfadAufloesen $POOL
  if ($poolEcht -ne $POOL) { Info "Laufwerk $($POOL.Substring(0, 2)) ist $poolEcht" }
  $poolDa = $false
  try { New-Item -ItemType Directory -Force -Path $poolEcht -ErrorAction Stop | Out-Null; $poolDa = $true }
  catch { Warn "Den Pool-Ordner $POOL erreiche ich von hier aus nicht. Die Aufgabe wird trotzdem angelegt." }
  Info "WBG, Probe (lädt nichts hoch, löscht nichts):"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Ziel "dokumente-pool.ps1") -Probe
  Write-Host ""
  Info "Zeichnungen, Probe (lädt nichts hoch, ändert im Ordner nichts):"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Ziel "zeichnungen.ps1") -Probe
  Write-Host ""
  Info "Einrichtblätter, Probe (lädt nichts hoch, ändert in den Ordnern nichts):"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Ziel "einrichtblaetter.ps1") -Probe
}

# ---------- 5. Aufgabenplanung ----------
Titel "5. Aufgabe anlegen"
# Die früheren einzelnen Aufgaben, ersetzt durch "HoferTool"; die
# Sicherung macht seit 111.109.0 die App selbst
foreach ($alt in @("Hofer Solar", "Hofer Dokumente", "Hofer Einrichtblätter", "Hofer Dokumente-Pool", "Hofer Zeichnungen", "Hofer Sicherung")) {
  if (Get-ScheduledTask -TaskName $alt -ErrorAction SilentlyContinue) {
    try { Unregister-ScheduledTask -TaskName $alt -Confirm:$false -ErrorAction Stop; Gut "Frühere Aufgabe '$alt' entfernt" }
    catch { Warn "Frühere Aufgabe '$alt' liess sich nicht entfernen (als Administrator nochmals starten)." }
  }
}
foreach ($alt in @("dokumente-abruf.ps1", "abruf.log", "sicherung.ps1", "sicherung-stand.json")) {
  Remove-Item -LiteralPath (Join-Path $Ziel $alt) -Force -ErrorAction SilentlyContinue
}

$wer = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($solarAn -or $poolAn) {
  # Über unsichtbar.vbs, damit kein PowerShell-Fenster aufblitzt
  # (powershell.exe direkt zeigt trotz -WindowStyle Hidden kurz eines).
  # -Force ersetzt eine bisherige Aufgabe gleichen Namens.
  $aktion = New-ScheduledTaskAction -Execute "wscript.exe" -WorkingDirectory $Ziel `
    -Argument ('//B //Nologo "' + (Join-Path $Ziel "unsichtbar.vbs") + '" hofertool.ps1')
  $ausloeser = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
  # Läuft noch einer, fällt der nächste Start aus (IgnoreNew)
  $einst = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 40)
  # Unter dem angemeldeten Konto, ohne Passwort: So kommt die Aufgabe auf
  # die Netzlaufwerke, die dieses Konto öffnen darf (SYSTEM käme dort
  # nicht hinein). Dafür nur, solange es angemeldet ist.
  $prinzipal = New-ScheduledTaskPrincipal -UserId $wer -LogonType Interactive
  Register-ScheduledTask -TaskName "HoferTool" -Action $aktion -Trigger $ausloeser -Settings $einst `
    -Principal $prinzipal -Force -Description ("Alle 5 Minuten im Hintergrund: Solar-Log an das Hofer Tool, WBGs aus dem " +
    "Pool-Ordner hochladen und dort löschen, neue und geänderte Zeichnungen und Einrichtblätter hochladen (dort nur lesen).") | Out-Null
  try { Start-ScheduledTask -TaskName "HoferTool" } catch { }
  Gut "Aufgabe 'HoferTool': alle 5 Minuten, solange $wer angemeldet ist"
} else {
  Warn "Weder Solar noch Dienstkonto eingerichtet, darum keine Aufgabe angelegt."
}

Titel "Fertig"
Info "Protokoll: $(Join-Path $Ziel 'hofertool.log'), dazu je Teil eines (solarlog.log, pool.log, zeichnungen.log, einrichtblaetter.log)"
if ($poolAn) { Info "WBGs hineinlegen in: $POOL" }
Info "Den Stand zeigt die App unter Einstellungen -> Dokumente."
Fertig 0
