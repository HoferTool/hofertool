# =================================================================
#  NEUER RECHNER — Solaranlage, WBG-Pool, Einrichtblätter, Zeichnungen, Sicherung
#
#  Richtet auf einem Windows-Rechner im Betrieb fünf Aufgaben ein:
#    - Solar: holt alle fünf Minuten die Werte vom Solar-Log und
#      liefert sie an die App (solarlog.ps1)
#    - Pool:  leert alle fünf Minuten die WBGs aus C:\Hofer\Pool in
#      die App (dokumente-pool.ps1)
#    - Einrichtblätter: liest alle fünf Minuten die Excel-Dateien aus
#      den Typ-Ordnern, die in der App eingetragen sind, und lädt neue
#      und geänderte hoch (einrichtblaetter.ps1). Liest nur, löscht nie.
#      Bis der Schalter in der App an ist, nur Probelauf. Läuft unter
#      dem angemeldeten Windows-Konto (wegen der Netzlaufwerke), ohne
#      dass ein Passwort eingegeben werden muss.
#    - Zeichnungen: liest alle fünf Minuten den Zeichnungs-Ordner aus der
#      App und lädt je HOCO Nr. die PDF mit "hofer" (sonst "kunde") im
#      Namen als Zeichnung hoch (zeichnungen.ps1). Liest nur, löscht nie.
#      Bis der Schalter in der App an ist, nur Probelauf. Wie die
#      Einrichtblätter unter dem angemeldeten Konto.
#    - Sicherung: sichert einmal am Tag alle Daten und hochgeladenen
#      Dateien in den Ordner aus der App (Einstellungen → Backup) und
#      spielt eine Sicherung zurück, wenn ein Admin es dort anfordert
#      (sicherung.ps1). Unter dem angemeldeten Konto, wegen Netzlaufwerken.
#
#  Was das Skript tut:
#    1. Lädt die Programme von GitHub nach C:\Hofer\Abgleich.
#    2. Sucht den Solar-Log im Netz selbst (oder fragt nach der Adresse).
#    3. Fragt nach dem Solar-Schlüssel und dem Dienstkonto und trägt
#       sie in die Einstellungsdateien ein.
#    4. Probiert beides aus, ohne etwas zu schreiben.
#    5. Legt die Aufgaben in der Aufgabenplanung an. Sonst bleibt
#       nichts zurück: kein Dienst, kein Autostart, kein Programm, das
#       im Hintergrund wartet. Das Einrichten selbst endet danach.
#
#  Start (PowerShell, am besten "Als Administrator ausführen"):
#     [Net.ServicePointManager]::SecurityProtocol='Tls12'; iwr -UseBasicParsing https://raw.githubusercontent.com/HoferTool/hofertool/main/skripte/einrichten.ps1?t=$(Get-Random) -OutFile $env:TEMP\einrichten.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\einrichten.ps1
#
#  Nochmals ausführen ist gefahrlos: Was schon eingetragen ist, bleibt
#  mit Enter stehen, die Programme werden neu geholt, die Aufgaben
#  ersetzt. Mit Administratorrechten laufen die Aufgaben immer, auch
#  wenn niemand angemeldet ist; sonst nur, solange du angemeldet bist.
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

Write-Host "Hofer Tool: Solaranlage, Pool, Einrichtblätter, Zeichnungen und Sicherung einrichten" -ForegroundColor Cyan
Write-Host "Ordner: $Ziel"
if (-not $istAdmin) {
  Warn "Ohne Administratorrechte laufen die Aufgaben nur, solange du angemeldet bist."
  Warn "Besser: PowerShell mit Rechtsklick -> 'Als Administrator ausführen' öffnen und nochmals starten."
}

# ---------- 1. Programme holen ----------
Titel "1. Programme holen"
New-Item -ItemType Directory -Force -Path $Ziel | Out-Null
foreach ($n in @("solarlog.ps1", "dokumente-pool.ps1", "dokumente-teile.ps1", "pool-einplanen.ps1", "einrichtblaetter.ps1", "zeichnungen.ps1", "sicherung.ps1", "unsichtbar.vbs")) {
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
  if ($poolDa) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Ziel "dokumente-pool.ps1") -Probe }
  Write-Host ""
  Info "Einrichtblätter, Probelauf (lädt nichts hoch, ändert in den Ordnern nichts):"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Ziel "einrichtblaetter.ps1") -Probe
  Write-Host ""
  Info "Zeichnungen, Probelauf (lädt nichts hoch, ändert im Ordner nichts):"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Ziel "zeichnungen.ps1") -Probe
}

# ---------- 5. Aufgabenplanung ----------
Titel "5. Aufgaben anlegen"
function Einplanen([string]$name, [string]$skript, [string]$text, [switch]$nurAngemeldet) {
  # Über unsichtbar.vbs, damit kein PowerShell-Fenster aufblitzt
  # (powershell.exe direkt zeigt trotz -WindowStyle Hidden kurz eines).
  # -Force beim Anlegen ersetzt die bisherige Aufgabe gleichen Namens.
  $aktion = New-ScheduledTaskAction -Execute "wscript.exe" -WorkingDirectory $Ziel `
    -Argument ('//B //Nologo "' + (Join-Path $Ziel "unsichtbar.vbs") + '" ' + $skript)
  $ausloeser = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
  $einst = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  if ($nurAngemeldet) {
    # Läuft unter dem angemeldeten Windows-Konto, ohne Passwort. So kommt
    # die Aufgabe auf die Netzlaufwerke, die dieses Konto öffnen darf
    # (SYSTEM käme dort nicht hinein). Dafür nur, solange es angemeldet ist.
    $wer = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
    Register-ScheduledTask -TaskName $name -Action $aktion -Trigger $ausloeser -Settings $einst `
      -Principal $wer -Description $text -Force | Out-Null
    Gut "Aufgabe '$name': alle 5 Minuten, solange $([Security.Principal.WindowsIdentity]::GetCurrent().Name) angemeldet ist"
    return
  }
  if ($istAdmin) {
    # Läuft auch ohne Anmeldung, nach einem Neustart von selbst
    $wer = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  } else {
    $wer = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
  }
  Register-ScheduledTask -TaskName $name -Action $aktion -Trigger $ausloeser -Settings $einst `
    -Principal $wer -Description $text -Force | Out-Null
  Gut "Aufgabe '$name': alle 5 Minuten"
}
if ($solarAn) { Einplanen "Hofer Solar" "solarlog.ps1" "Liefert alle 5 Minuten die Werte des Solar-Log ans Hofer Tool." }
if ($poolAn)  {
  Einplanen "Hofer Dokumente-Pool" "dokumente-pool.ps1" "Lädt alle 5 Minuten die WBGs aus dem Pool-Ordner ins Hofer Tool und leert ihn." -nurAngemeldet
  Einplanen "Hofer Einrichtblätter" "einrichtblaetter.ps1" "Liest alle 5 Minuten die Excel-Einrichtblätter aus den Typ-Ordnern und lädt neue ins Hofer Tool. Löscht und ändert in den Ordnern nie etwas." -nurAngemeldet
  Einplanen "Hofer Zeichnungen" "zeichnungen.ps1" "Liest alle 5 Minuten die Zeichnungs-PDFs (hofer, sonst kunde) aus dem Zeichnungs-Ordner und lädt neue ins Hofer Tool. Löscht und ändert im Ordner nie etwas." -nurAngemeldet
  Einplanen "Hofer Sicherung" "sicherung.ps1" "Sichert einmal am Tag alle Daten des Hofer Tools in den Ordner aus der App (Einstellungen -> Backup) und spielt auf Wunsch eine Sicherung zurück." -nurAngemeldet
}

Titel "Fertig"
if ($solarAn) { Info "Solar-Protokoll: $(Join-Path $Ziel 'solarlog.log')" }
if ($poolAn)  {
  Info "Pool-Protokoll:  $(Join-Path $Ziel 'pool.log')"; Info "WBGs hineinlegen in: $POOL"
  Info "Einrichtblätter-Protokoll: $(Join-Path $Ziel 'einrichtblaetter.log')"
  Info "Einrichtblätter: Bis du in der App den Schalter 'Hochladen' einschaltest, nur Probelauf."
  Info "Zeichnungen-Protokoll: $(Join-Path $Ziel 'zeichnungen.log')"
  Info "Zeichnungen: ebenso nur Probelauf, bis der Schalter beim Zeichnungs-Ordner an ist."
  Info "Sicherung-Protokoll: $(Join-Path $Ziel 'sicherung.log')"
  Info "Sicherung: sobald in der App unter Einstellungen -> Backup ein Speicherort steht, einmal am Tag."
}
Fertig 0
