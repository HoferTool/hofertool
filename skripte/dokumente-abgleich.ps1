# =================================================================
#  DOKUMENTE-ABGLEICH — Netzlaufwerk → Hofer Tool
#
#  Läuft auf einem Rechner, der dauernd an ist (etwa MGMT01), jede
#  Minute über die Aufgabenplanung. Holt sich aus der App den Ordner,
#  schaut nach neuen oder geänderten Dateien, lädt sie hoch und legt
#  sie nach denselben Regeln ab wie die App:
#
#     10844-0049.pdf            → Zeichnung der HOCO Nr.
#     10844-0049_WBG.pdf        → WBG an den offenen Aufträgen
#     20268566 10007-0381.pdf   → WBG mit FA Nr. an den nächsten Auftrag
#     10844-0049 SW-20.xlsx     → Excel ist immer ein Einrichtblatt
#     10844-0049_EB_SW-20.pdf   → Einrichtblatt dieser Nummer auf SW-20
#     EB_SW-20.pdf              → Einrichtblatt-Vorlage des Typs
#     10844-0049 Foto.pdf       → Allgemein zur HOCO Nr.
#
#  Was an derselben Stelle lag, wird ersetzt. Die Dateien im Ordner
#  bleiben liegen, das Skript merkt sich nur, was es schon kennt.
#
#  Aufruf:
#     .\dokumente-abgleich.ps1            normaler Durchlauf
#     .\dokumente-abgleich.ps1 -Probe     zeigt nur, was es tun würde
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "abgleich-stand.json"
$protDatei  = Join-Path $ordnerHier "abgleich.log"
$hoechstensJeLauf = 100

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
if (-not (Test-Path $einstDatei)) { Schreibe "abgleich-einstellungen.json fehlt"; exit 1 }
$E = Get-Content -Raw -Path $einstDatei -Encoding UTF8 | ConvertFrom-Json
$U = ($E.supabase_url).TrimEnd("/")
$KEY = $E.anon_key

$stand = @{ dateien = @{}; token = $null; ablauf = 0; auffrischen = $null }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = $_.Value } }
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
}

# ---------- Anmelden, Regeln, Erkennen, Hochladen ----------
. (Join-Path $ordnerHier "dokumente-teile.ps1")

# ---------- Durchlauf ----------
$status = @{ zeit = (Get-Date).ToUniversalTime().ToString("o"); rechner = $env:COMPUTERNAME;
             dateien = 0; neu = 0; fehler = $null; ohne = @() }
try {
  Anmelden

  $konf = @{}
  Lesen "app_config?select=schluessel,wert&schluessel=in.(dok_pfad,dok_pfad_unterordner,dok_regeln)" |
    ForEach-Object { $konf[$_.schluessel] = $_.wert }
  $pfad = [string]$konf["dok_pfad"]
  if (-not $pfad) { throw "In der App ist noch kein Pfad eingetragen." }
  if (-not (Test-Path -LiteralPath $pfad)) { throw "Der Pfad $pfad ist von $env:COMPUTERNAME aus nicht erreichbar." }

  $regeln = @{}
  $VORGABE.Keys | ForEach-Object { $regeln[$_] = $VORGABE[$_] }
  if ($konf["dok_regeln"]) {
    $g = $konf["dok_regeln"] | ConvertFrom-Json
    $g.PSObject.Properties | ForEach-Object { $regeln[$_.Name] = $_.Value }
  }
  $typen = @(Lesen "machine_types?select=id,name")

  $rek = ($konf["dok_pfad_unterordner"] -eq "ja")
  $dateien = @(Get-ChildItem -LiteralPath $pfad -File -Recurse:$rek |
    Where-Object { $_.Extension -match '^\.(pdf|png|jpe?g|webp|tiff?|xlsx|xlsm|xls)$' })
  $status.dateien = $dateien.Count

  $erledigt = 0
  foreach ($d in $dateien) {
    $kennung = $d.LastWriteTimeUtc.Ticks.ToString() + "|" + $d.Length
    if ($stand.dateien[$d.FullName] -eq $kennung) { continue }       # schon bekannt
    if ($erledigt -ge $hoechstensJeLauf) { break }                    # den Rest beim nächsten Mal

    $z = Erkennen $d.Name $typen $regeln
    if (BrauchtZiel $z) { $z = ZielSuchen $z $typen }
    if (-not $z.passt) {
      $status.ohne += $d.Name
      if (-not $Probe) { $stand.dateien[$d.FullName] = $kennung }    # nicht jede Minute neu melden
      Schreibe ("übersprungen, nicht zuzuordnen: " + $d.Name)
      continue
    }
    if ($Probe) { Schreibe ($d.Name + "  →  " + (ZielText $z)); continue }

    try {
      Hochladen $d $z "pfad"
      $stand.dateien[$d.FullName] = $kennung
      $status.neu++; $erledigt++
      Schreibe ($d.Name + "  →  " + (ZielText $z))
    } catch {
      Schreibe ("Fehler bei " + $d.Name + ": " + $_.Exception.Message)
      $status.fehler = "Fehler bei " + $d.Name + ": " + $_.Exception.Message
    }
    StandSichern
  }
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

if (-not $Probe) {
  try {
    Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "dok_pfad_status";
      wert = ($status | ConvertTo-Json -Compress -Depth 3) } "resolution=merge-duplicates"
  } catch { Schreibe ("Stand nicht gemeldet: " + $_.Exception.Message) }
  StandSichern
} else {
  Write-Host ""
  Write-Host ("Probelauf: " + $status.dateien + " Dateien im Ordner, nichts hochgeladen.")
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
