# =================================================================
#  DOKUMENTE-POOL — WBGs aus dem Ordner in die App, Ordner leeren
#
#  Läuft über die Windows-Aufgabenplanung alle fünf Minuten. Im
#  Pool-Ordner liegen nur WBGs. Das Programm ordnet jede am Namen zu
#  wie die App, lädt sie hoch und löscht sie danach aus dem Ordner:
#
#     20268566 10007-0381.pdf   → WBG an den nächsten offenen Auftrag
#                                 der HOCO Nr. 10007-0381 ohne FA Nr.,
#                                 die FA Nr. 20268566 wird eingetragen
#     10007-0381 WBG.pdf        → WBG an die offenen Aufträge der Nr.
#
#  Alles andere (Excel, Zeichnungen, …) löscht es nicht, sondern
#  schiebt es in den Unterordner "nicht zugeordnet". Einrichtblätter
#  holt einrichtblaetter.ps1 aus den Typ-Ordnern, nur lesend.
#
#  Steht die FA Nr. schon auf einem Auftrag, ersetzt die neue WBG dort
#  die alte. Eine WBG, deren Auftrag noch nicht geplant ist, bleibt bis
#  zu sieben Tage liegen und wird bei jedem Durchlauf neu versucht.
#  Was gar nicht passt, kommt in den Unterordner "nicht zugeordnet".
#
#  Aufruf:
#     .\dokumente-pool.ps1            normaler Durchlauf
#     .\dokumente-pool.ps1 -Probe     zeigt nur, was es tun würde
#
#  Der Ordner: -Ordner "D:\Pool", sonst "pool_ordner" in
#  abgleich-einstellungen.json, sonst der Pool-Ordner aus der App
#  (Einstellungen → Dokumente), sonst C:\Hofer\Pool.
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe, [string]$Ordner)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "pool-stand.json"
$protDatei  = Join-Path $ordnerHier "pool.log"
$wartenTage = 7

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

# Anmeldung merken und welche wartenden Dateien schon im Protokoll stehen
$stand = @{ token = $null; ablauf = 0; auffrischen = $null; gemeldet = @{} }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
    if ($g.gemeldet) { $g.gemeldet.PSObject.Properties | ForEach-Object { $stand.gemeldet[$_.Name] = $_.Value } }
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
}

# ---------- Anmelden, Regeln, Erkennen, Hochladen ----------
. (Join-Path $ordnerHier "dokumente-teile.ps1")

# Eine Datei, die gerade noch kopiert wird, lässt sich nicht exklusiv öffnen
function NochInArbeit($datei) {
  try { $s = [IO.File]::Open($datei.FullName, "Open", "Read", "None"); $s.Close(); return $false }
  catch { return $true }
}

# In den Unterordner schieben, ohne eine gleichnamige Datei zu überschreiben
function Beiseite($datei, [string]$ziel) {
  if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Path $ziel | Out-Null }
  $neu = Join-Path $ziel $datei.Name
  if (Test-Path -LiteralPath $neu) {
    $neu = Join-Path $ziel ($datei.BaseName + " (" + (Get-Date -Format "yyyy-MM-dd HHmmss") + ")" + $datei.Extension)
  }
  Move-Item -LiteralPath $datei.FullName -Destination $neu
}

# ---------- Durchlauf ----------
$status = @{ zeit = (Get-Date).ToUniversalTime().ToString("o"); rechner = $env:COMPUTERNAME;
             dateien = 0; neu = 0; fehler = $null; ohne = @(); wartet = @() }
try {
  Anmelden

  $konf = @{}
  Lesen "app_config?select=schluessel,wert&schluessel=in.(dok_pool_pfad,dok_regeln)" |
    ForEach-Object { $konf[$_.schluessel] = $_.wert }
  $pfad = $Ordner
  if (-not $pfad) { $pfad = [string]$E.pool_ordner }
  if (-not $pfad) { $pfad = [string]$konf["dok_pool_pfad"] }
  if (-not $pfad) { $pfad = "C:\Hofer\Pool" }
  if (-not (Test-Path -LiteralPath $pfad)) {
    if ($Probe) { throw "Den Ordner $pfad gibt es nicht." }
    New-Item -ItemType Directory -Path $pfad | Out-Null
    Schreibe ("Ordner angelegt: " + $pfad)
  }
  $beiseite = Join-Path $pfad "nicht zugeordnet"

  $regeln = @{}
  $VORGABE.Keys | ForEach-Object { $regeln[$_] = $VORGABE[$_] }
  if ($konf["dok_regeln"]) {
    $g = $konf["dok_regeln"] | ConvertFrom-Json
    $g.PSObject.Properties | ForEach-Object { $regeln[$_.Name] = $_.Value }
  }
  $typen = @(Lesen "machine_types?select=id,name")

  # Nur der Ordner selbst, nicht "nicht zugeordnet" darunter
  $dateien = @(Get-ChildItem -LiteralPath $pfad -File |
    Where-Object { $_.Extension -match '^\.(pdf|png|jpe?g|webp|tiff?|xlsx|xlsm|xls)$' })
  $status.dateien = $dateien.Count
  $nochDa = @{}

  foreach ($d in $dateien) {
    if (NochInArbeit $d) { continue }                                 # beim nächsten Mal
    $z = Erkennen $d.Name $typen $regeln
    # Nur WBGs: alles andere bleibt unangetastet in "nicht zugeordnet"
    if ($z.art -ne "wbg") {
      $z.passt = $false
      if ($d.Extension -match '^\.(xlsx|xlsm|xls)$') { $z.grund = "Einrichtblätter kommen aus den Einrichtblatt-Ordnern, nicht aus dem Pool" }
      else { $z.grund = "im Pool nur WBGs (FA Nr. oder WBG im Namen)" }
    }
    elseif (BrauchtZiel $z) { $z = ZielSuchen $z $typen }

    if (-not $z.passt) {
      # WBG mit FA Nr., deren Auftrag noch nicht geplant ist: warten
      $alter = ((Get-Date) - $d.CreationTime).TotalDays
      if ($z.art -eq "wbg" -and $z.fa -and $alter -lt $wartenTage) {
        $status.wartet += $d.Name
        $nochDa[$d.Name] = $true
        if (-not $stand.gemeldet[$d.Name]) {
          Schreibe ("wartet: " + $d.Name + " — " + $z.grund)
          $stand.gemeldet[$d.Name] = (Get-Date).ToString("o")
        }
        continue
      }
      $status.ohne += $d.Name
      if ($Probe) { Schreibe ("nicht zuzuordnen: " + $d.Name + "  " + $z.grund); continue }
      Beiseite $d $beiseite
      Schreibe ("nicht zuzuordnen, in 'nicht zugeordnet' verschoben: " + $d.Name + "  " + $z.grund)
      continue
    }
    if ($Probe) { Schreibe ($d.Name + "  →  " + (ZielText $z)); continue }

    try {
      Hochladen $d $z "pool"
      Remove-Item -LiteralPath $d.FullName -Force
      $status.neu++
      Schreibe ($d.Name + "  →  " + (ZielText $z))
    } catch {
      # Datei bleibt liegen, beim nächsten Durchlauf noch einmal
      $nochDa[$d.Name] = $true
      Schreibe ("Fehler bei " + $d.Name + ": " + $_.Exception.Message)
      $status.fehler = "Fehler bei " + $d.Name + ": " + $_.Exception.Message
    }
  }
  # Gemeldete Wartende, die nicht mehr da sind, vergessen
  foreach ($n in @($stand.gemeldet.Keys)) { if (-not $nochDa[$n]) { $stand.gemeldet.Remove($n) } }
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

if (-not $Probe) {
  try {
    Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "dok_pool_status";
      wert = ($status | ConvertTo-Json -Compress -Depth 3) } "resolution=merge-duplicates"
  } catch { Schreibe ("Stand nicht gemeldet: " + $_.Exception.Message) }
  StandSichern
} else {
  Write-Host ""
  Write-Host ("Probelauf: " + $status.dateien + " Dateien im Ordner, nichts hochgeladen, nichts gelöscht.")
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
