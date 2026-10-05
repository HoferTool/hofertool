# =================================================================
#  SOLARANLAGE — Solar-Log → Hofer Tool
#
#  Läuft auf einem Rechner im Betrieb, der den Solar-Log im Netz
#  erreicht, alle fünf Minuten über die Aufgabenplanung. Liest die
#  aktuellen Werte vom Solar-Log und liefert sie an die App (neues
#  Supabase-Projekt). Die Startseite zeigt sie als Solaranzeige.
#
#  Aufruf:
#     .\solarlog.ps1            normaler Durchlauf
#     .\solarlog.ps1 -Probe     liest den Solar-Log und prüft den
#                               Schlüssel, schreibt aber nichts
#
#  Braucht daneben die Datei solar-einstellungen.json mit der Adresse
#  des Solar-Log und dem Solar-Schlüssel (aus sql/solar.sql). Den
#  geheimen Hauptschlüssel des Projekts braucht es nicht mehr.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
#  Anleitung: anleitungen/Solar-Anleitung.md
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "solar-einstellungen.json"
$protDatei  = Join-Path $ordnerHier "solarlog.log"

# Adresse und öffentlicher Schlüssel der App (stehen auch im Code der
# Website, sind also nicht geheim). In den Einstellungen überschreibbar.
$U   = "https://lzhqwbxfwqamauntehof.supabase.co"
$KEY = "sb_publishable_MLN71MehUtWldj_GVLDBvw_OCJODSCW"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  if ($Probe) { Write-Host $zeile }
  try {
    Add-Content -Path $protDatei -Value $zeile -Encoding UTF8
    $alle = Get-Content -Path $protDatei -Encoding UTF8
    if ($alle.Count -gt 2000) { $alle | Select-Object -Last 1500 | Set-Content -Path $protDatei -Encoding UTF8 }
  } catch { }
}

# ---------- Einstellungen ----------
if (-not (Test-Path $einstDatei)) { Schreibe "solar-einstellungen.json fehlt neben dem Skript"; exit 1 }
$E = Get-Content -Raw -Path $einstDatei -Encoding UTF8 | ConvertFrom-Json
if ($E.supabase_url)    { $U = ($E.supabase_url).TrimEnd("/") }
if ($E.publishable_key) { $KEY = $E.publishable_key }
$adresse = ([string]$E.solarlog_adresse).Trim().TrimEnd("/")
if ($adresse -and $adresse -notmatch "^https?://") { $adresse = "http://" + $adresse }
$schluessel = ([string]$E.solar_schluessel).Trim()
if (-not $adresse -or $adresse -match "HIER") { Schreibe "In solar-einstellungen.json fehlt die Adresse des Solar-Log"; exit 1 }
if (-not $schluessel -or $schluessel -match "HIER") { Schreibe "In solar-einstellungen.json fehlt der Solar-Schlüssel"; exit 1 }

# ---------- Solar-Log lesen ----------
# Der Solar-Log gibt seine Live-Werte über /getjp heraus (Abfrage 801/170).
# Ist dort der Zugangsschutz an, braucht es vorher eine Anmeldung mit
# dem Benutzer-Passwort des Solar-Log.
$abfrage = '{"801":{"170":null}}'
$sitzung = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$koerper = $abfrage
$pw = [string]$E.solarlog_passwort
if ($pw) {
  try {
    Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$adresse/login" -WebSession $sitzung `
      -ContentType "application/x-www-form-urlencoded" `
      -Body ("u=user&p=" + [Uri]::EscapeDataString($pw)) -TimeoutSec 20 | Out-Null
  } catch { Schreibe "Anmeldung am Solar-Log fehlgeschlagen: $($_.Exception.Message)"; exit 1 }
  $keks = $sitzung.Cookies.GetCookies([Uri]$adresse) | Where-Object { $_.Name -eq "SolarLog" } | Select-Object -First 1
  if ($keks) { $koerper = "token=" + $keks.Value + ";preval=none;" + $abfrage }
}

try {
  $antw = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$adresse/getjp" -WebSession $sitzung `
    -ContentType "text/plain" -Body $koerper -TimeoutSec 20
} catch { Schreibe "Solar-Log unter $adresse nicht erreichbar: $($_.Exception.Message)"; exit 1 }

# Ohne Inhaltstyp in der Antwort liefert PowerShell Bytes statt Text
$roh = $antw.Content
if ($roh -is [byte[]]) { $text = [Text.Encoding]::UTF8.GetString($roh) } else { $text = [string]$roh }
if ($text -match "DENIED") {
  Schreibe "Der Solar-Log verlangt ein Passwort. In solar-einstellungen.json bei solarlog_passwort eintragen."
  exit 1
}
try { $d = ($text | ConvertFrom-Json).'801'.'170' } catch { $d = $null }
if (-not $d) { Schreibe "Unerwartete Antwort vom Solar-Log: $($text.Substring(0, [Math]::Min(200, $text.Length)))"; exit 1 }

# 101 = Leistung der Anlage (W), 110 = Verbrauch des Betriebs (W),
# 105 = Ertrag heute (Wh). Netz = Verbrauch minus Erzeugung: positiv
# heisst Bezug aus dem Netz, negativ Einspeisung.
$produktion = [double]$d.'101'
$verbrauch  = [double]$d.'110'
$werte = [ordered]@{
  produktion_w   = [Math]::Round($produktion)
  verbrauch_w    = [Math]::Round($verbrauch)
  netz_w         = [Math]::Round($verbrauch - $produktion)
  ertrag_tag_kwh = [Math]::Round(([double]$d.'105') / 1000, 1)
  quelle         = "Solar-Log direkt"
}
$kurz = "Erzeugung $($werte.produktion_w) W, Verbrauch $($werte.verbrauch_w) W, Netz $($werte.netz_w) W, heute $($werte.ertrag_tag_kwh) kWh"

# ---------- An die App liefern ----------
$body = @{ schluessel = $schluessel; werte = $werte; nur_pruefen = [bool]$Probe } | ConvertTo-Json -Depth 4 -Compress
try {
  $erg = Invoke-RestMethod -Method Post -Uri "$U/rest/v1/rpc/solar_melden" `
    -Headers @{ apikey = $KEY } -ContentType "application/json; charset=utf-8" `
    -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 30
} catch {
  $meld = $_.Exception.Message
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $meld = $_.ErrorDetails.Message }
  if ($meld -match "Schl") { Schreibe "Die App lehnt den Solar-Schlüssel ab. Wert in solar-einstellungen.json prüfen." }
  elseif ($meld -match "solar_melden") { Schreibe "Die Funktion solar_melden fehlt. sql/solar.sql im Supabase SQL Editor ausführen." }
  else { Schreibe "Senden an die App fehlgeschlagen: $meld" }
  exit 1
}

if ($Probe) {
  Schreibe "Probe: $kurz"
  Schreibe "Probe: $erg. Nichts geschrieben."
} else {
  Schreibe "$erg  $kurz"
}
exit 0
