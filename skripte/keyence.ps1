# =================================================================
#  KEYENCE — Messberichte vom Bildmessgerät Keyence IM ins Tool
#
#  Läuft alle fünf Minuten in der Aufgabe "HoferTool" (hofertool.ps1),
#  ohne Knopf in der App (Wunsch Patrick 6. November 2026: „wenn man auf
#  Print drückt, in einem Ordner abspeichern zum Hochladen ins Tool,
#  automatisch so benennen, dass das Tool weiss, wohin“).
#
#  Das Keyence IM schreibt je Messung einen „Teilbericht“ als CSV-Datei,
#  etwa "10007-0589 1. Seite M2 SMOBERICHT20261106141005.csv":
#     Teilbericht
#     Name der Messeinstellungsdaten;10007-0589 1. Seite M2 SMO
#     Datum und Uhrzeit der Messung;06.11.2026 14:09:25
#     …
#     Gesamtergebnis;OK
#     Messergebnisse
#     Nr.;Messelemente;Messwert;Einheit;Sollwert;Obergr.;Untergrz.;…
#     3;KONZENTR Ø8 ZU Ø13.95;0,004;;0,000;0,020;0,000;OK;
#
#  Das Programm sucht im Ordner (Vorgabe W:\KONTROLLE\Keyence, sonst was
#  in app_config.keyence_ordner steht), auch in Unterordnern, nach
#  CSV-Dateien, die mit "Teilbericht" beginnen, und legt Kopf und Mess-
#  werte in die Tabelle messberichte. Die HOCO Nr. kommt aus dem Namen der
#  Messeinstellung (sonst aus dem Dateinamen). Nur neue oder geänderte
#  Dateien werden geschickt (keyence-stand.json).
#
#  DAS PROGRAMM LIEST NUR. Im Ordner wird nie etwas gelöscht,
#  verschoben, umbenannt oder geändert.
#
#  Aufruf:
#     .\keyence.ps1            normaler Durchlauf
#     .\keyence.ps1 -Probe     zeigt, was es fände, schickt nichts
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "keyence-stand.json"
$protDatei  = Join-Path $ordnerHier "keyence.log"
$vorgabeOrdner    = "W:\KONTROLLE\Keyence"
$hoechstensJeLauf = 300
$hoechstensGross  = 1MB

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  if ($Probe) { Write-Host $zeile }
  try {
    Add-Content -Path $protDatei -Value $zeile -Encoding UTF8
    $alle = Get-Content -Path $protDatei -Encoding UTF8
    if ($alle.Count -gt 3000) { $alle | Select-Object -Last 2000 | Set-Content -Path $protDatei -Encoding UTF8 }
  } catch { }
}

if (-not (Test-Path $einstDatei)) { Schreibe "abgleich-einstellungen.json fehlt"; exit 1 }
$E = Get-Content -Raw -Path $einstDatei -Encoding UTF8 | ConvertFrom-Json
$U = ($E.supabase_url).TrimEnd("/")
$KEY = $E.anon_key

$stand = @{ token = $null; ablauf = 0; auffrischen = $null; dateien = @{} }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
}

. (Join-Path $ordnerHier "dokumente-teile.ps1")

# Text der Datei, nur lesend geöffnet (auch wenn das Gerät sie gerade
# schreibt). Das Keyence schreibt ANSI (Windows-1252, „Zähler“, „Ø“).
function TextLesen($d) {
  $s = [IO.File]::Open($d.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $ms = New-Object IO.MemoryStream
    $s.CopyTo($ms)
    $bytes = $ms.ToArray()
  } finally { $s.Close() }
  try { $t = (New-Object Text.UTF8Encoding($false, $true)).GetString($bytes) }
  catch { $t = [Text.Encoding]::GetEncoding(1252).GetString($bytes) }
  if ($t.Length -gt 0 -and $t[0] -eq [char]0xFEFF) { $t = $t.Substring(1) }
  return (($t -replace "`0", "") -replace "`r`n", "`n" -replace "`r", "`n")
}

# Eine CSV-Zeile mit Semikolon, ohne leere Felder am Ende
function Felder([string]$zeile) {
  $f = New-Object System.Collections.Generic.List[string]
  foreach ($x in ($zeile -split ';')) { $f.Add($x.Trim().Trim('"')) }
  while ($f.Count -gt 0 -and $f[$f.Count - 1] -eq "") { $f.RemoveAt($f.Count - 1) }
  return ,$f.ToArray()
}

# Teilbericht lesen: Kopf (Name;Wert) bis "Messergebnisse", danach
# eine Zeile mit den Spaltennamen und je Messelement eine Zeile.
function BerichtLesen([string]$text) {
  $zeilen = @($text -split "`n")
  if (-not $zeilen.Count -or $zeilen[0].Trim().Trim('"') -notmatch '^Teilbericht') { return $null }
  $kopf = [ordered]@{}
  $spalten = @()
  $werte = New-Object System.Collections.Generic.List[object]
  $teil = "kopf"
  for ($i = 1; $i -lt $zeilen.Count; $i++) {
    $z = $zeilen[$i]
    if (-not $z.Trim()) { continue }
    if ($teil -eq "kopf") {
      if ($z.Trim().Trim(';') -match '^Messergebnisse') { $teil = "spalten"; continue }
      $f = Felder $z
      if ($f.Count -ge 1 -and $f[0]) { $kopf[$f[0]] = (@($f | Select-Object -Skip 1) -join "; ") }
    } elseif ($teil -eq "spalten") {
      $spalten = Felder $z; $teil = "werte"
    } else {
      $f = Felder $z
      if ($f.Count) { $werte.Add($f) }
    }
  }
  return @{ kopf = $kopf; spalten = $spalten; zeilen = $werte }
}

function KopfWert($kopf, [string]$muster) {
  foreach ($k in $kopf.Keys) { if ($k -match $muster) { return [string]$kopf[$k] } }
  return ""
}

function ZeitIso([string]$t) {
  foreach ($f in @("dd.MM.yyyy HH:mm:ss", "dd.MM.yyyy H:mm:ss", "yyyy/MM/dd HH:mm:ss", "dd.MM.yyyy HH:mm")) {
    try {
      $d = [DateTime]::ParseExact($t.Trim(), $f, [Globalization.CultureInfo]::InvariantCulture)
      return $d.ToUniversalTime().ToString("o")
    } catch { }
  }
  return $null
}

# HOCO Nr. wie in der App: 10007-0589 (fünf Ziffern, Strich, vier Ziffern)
function HocoAus([string]$t) {
  $m = [regex]::Match($t, '(?<!\d)(\d{5})\s?[-–]\s?(\d{1,4})(?!\d)')
  if ($m.Success) { return $m.Groups[1].Value + "-" + $m.Groups[2].Value.PadLeft(4, "0") }
  return $null
}

$jetztIso = (Get-Date).ToUniversalTime().ToString("o")
$status = @{ zeit = $jetztIso; rechner = $env:COMPUTERNAME; scharf = (-not $Probe); pfad = $null;
             dateien = 0; berichte = 0; geschickt = 0; ohneHoco = 0; fehler = $null; beispiele = @() }

try {
  Anmelden
  $ordner = $vorgabeOrdner
  try {
    Lesen "app_config?select=wert&schluessel=eq.keyence_ordner" | ForEach-Object {
      $w = [string]$_.wert
      try { $j = $w | ConvertFrom-Json; if ($j -is [string]) { $w = $j } elseif ($j.ordner) { $w = [string]$j.ordner } } catch { }
      if ($w.Trim()) { $ordner = $w.Trim() }
    }
  } catch { }
  $pfad = PfadAufloesen $ordner
  $status.pfad = $pfad
  if (-not (Test-Path -LiteralPath $pfad)) {
    $status.fehler = "Ordner nicht erreichbar: " + $pfad
    Schreibe $status.fehler
  } else {
    $dateien = @(Get-ChildItem -LiteralPath $pfad -Filter *.csv -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.Length -le $hoechstensGross -and $_.Name -notlike '~$*' } |
      Sort-Object LastWriteTimeUtc)
    $status.dateien = $dateien.Count
    $nochFrei = $hoechstensJeLauf
    foreach ($d in $dateien) {
      $kennung = Kennung $d
      if ($stand.dateien[$d.FullName] -eq $kennung) { continue }
      if ($nochFrei -le 0) { break }
      try {
        $text = TextLesen $d
        $b = BerichtLesen $text
        if (-not $b) { $stand.dateien[$d.FullName] = $kennung; continue }   # keine Teilbericht-Datei
        $status.berichte++
        $einst = KopfWert $b.kopf '^Name der Messeinstellung'
        $hoco = HocoAus $einst
        if (-not $hoco) { $hoco = HocoAus $d.BaseName }
        if (-not $hoco) { $status.ohneHoco++ }
        $zeit = ZeitIso (KopfWert $b.kopf '^Datum und Uhrzeit')
        if (-not $zeit) { $zeit = $d.LastWriteTimeUtc.ToString("o") }
        if ($status.beispiele.Count -lt 8) { $status.beispiele += ($d.Name + " → " + $(if ($hoco) { $hoco } else { "ohne HOCO Nr." })) }
        if ($Probe) { Schreibe ("würde schicken: " + $d.FullName + " → " + $hoco); $nochFrei--; continue }
        Anmelden
        Aendern "Post" "messberichte?on_conflict=datei" @{ datei = $d.FullName; hoco_nr = $hoco; einstellung = $einst;
          gemessen_am = $zeit; ergebnis = (KopfWert $b.kopf '^Gesamtergebnis'); kopf = $b.kopf;
          spalten = @($b.spalten); zeilen = @($b.zeilen.ToArray()); roh = $text; gelesen_am = $jetztIso } "resolution=merge-duplicates"
        $stand.dateien[$d.FullName] = $kennung
        $status.geschickt++; $nochFrei--
      } catch {
        Schreibe ("Nicht geschickt: " + $d.FullName + " — " + $_.Exception.Message)
        if (-not $status.fehler) { $status.fehler = $_.Exception.Message }
      }
    }
    StandSichern
  }
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

if ($status.geschickt -gt 0) { Schreibe ([string]$status.geschickt + " Messberichte geschickt") }
if (-not $Probe) {
  try {
    Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "keyence_status";
      wert = ($status | ConvertTo-Json -Compress -Depth 4) } "resolution=merge-duplicates"
  } catch { Schreibe ("Stand nicht an die App gemeldet: " + $_.Exception.Message) }
}
StandSichern

if ($Probe) {
  Write-Host ""
  Write-Host ("  Ordner: " + $status.pfad + " — " + $status.dateien + " CSV-Dateien, " + $status.berichte + " neue Teilberichte, " + $status.ohneHoco + " ohne HOCO Nr.")
  if ($status.fehler) { Write-Host ("  Fehler: " + $status.fehler) }
}
