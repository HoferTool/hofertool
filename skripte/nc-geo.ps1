# =================================================================
#  NC-GEO — Geometriedaten der SW-Programme ins Einrichtblatt
#
#  Läuft alle fünf Minuten in der Aufgabe "HoferTool" (hofertool.ps1),
#  ohne Knopf in der App (Wunsch Patrick 30. Oktober 2026: "speziell für
#  Typ SW automatisch aus einem Ordner eine NC-Datei nehmen, die immer
#  mit 4 anfängt, und im EB auf Seite zwei mit Überschrift GEO-OFFSET
#  einfügen, ohne Formatieren, einfach als Text").
#
#  Welcher Ordner, steht in der App beim Typ (Seite Maschinen → "⚙ Typ"
#  → "Ordner NC-Programme", machine_types.nc_ordner). Darin, auch in
#  Unterordnern, nimmt das Programm jede Datei, deren Name mit 4 und drei
#  weiteren Ziffern beginnt (4234, 4234.nc, O4234 …). Die Nummer ist die
#  Programm-Nr. der Geometriedaten, die im Einrichtblatt steht (SW: 1234,
#  2234, 3234 für die Paths, 4234 für die Geometrie). Gibt es dieselbe
#  Nummer mehrmals, zählt die zuletzt geänderte Datei.
#
#  Der Text kommt unverändert in die Tabelle nc_geo (je Typ und Nummer),
#  die App zeigt ihn im Einrichtblatt als Seite "GEO-OFFSET". Nur neue
#  oder geänderte Dateien werden geschickt (Kennung aus Name, Grösse und
#  Änderungszeit in nc-geo-stand.json).
#
#  DAS PROGRAMM LIEST NUR. Im Ordner wird nie etwas gelöscht,
#  verschoben, umbenannt oder geändert.
#
#  Aufruf:
#     .\nc-geo.ps1            normaler Durchlauf
#     .\nc-geo.ps1 -Probe     zeigt, was es fände, schickt nichts
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "nc-geo-stand.json"
$protDatei  = Join-Path $ordnerHier "nc-geo.log"
$hoechstensJeLauf = 300
$hoechstensGross  = 512KB

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

# Text der Datei, nur lesend geöffnet (auch wenn sie gerade offen ist).
# NC-Dateien sind meist ANSI (Windows-1252), manche UTF-8: zuerst
# streng UTF-8 versuchen, sonst ANSI. Zeilenenden einheitlich, Nullzeichen
# weg (die Datenbank nimmt keine), sonst bleibt alles, wie es ist.
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
  return (($t -replace "`0", "") -replace "`r`n", "`n" -replace "`r", "`n").TrimEnd()
}

$jetztIso = (Get-Date).ToUniversalTime().ToString("o")
$status = @{ zeit = $jetztIso; rechner = $env:COMPUTERNAME; scharf = (-not $Probe); typen = @();
             geschickt = 0; fehler = $null }

try {
  Anmelden
  $typen = @()
  try { $typen = @(Lesen "machine_types?select=id,name,nc_ordner&nc_ordner=not.is.null") }
  catch { throw "Die Datenbank kennt den NC-Ordner noch nicht (sql/nc-geo-offset.sql)." }
  $nochFrei = $hoechstensJeLauf

  foreach ($t in $typen) {
    $pfad = PfadAufloesen ([string]$t.nc_ordner)
    if (-not $pfad) { continue }
    $info = @{ typ = [string]$t.name; pfad = $pfad; dateien = 0; nummern = 0; neu = 0; fehler = $null; beispiele = @() }
    $status.typen += $info
    if (-not (Test-Path -LiteralPath $pfad)) {
      $info.fehler = "Ordner nicht erreichbar"
      if ($pfad -match '^[D-Zd-z]:') {
        $info.fehler += ". Das Laufwerk " + $pfad.Substring(0, 2) + " kennt die Aufgabe nicht, besser \\Server\Freigabe\... eintragen"
      }
      Schreibe ("Ordner nicht erreichbar: " + $pfad)
      continue
    }
    # Je Nummer die zuletzt geänderte Datei
    $jeNr = @{}
    Get-ChildItem -LiteralPath $pfad -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      $m = [regex]::Match($_.Name, '^[OoØø]?(4\d{3})(?!\d)')
      if (-not $m.Success -or $_.Length -gt $hoechstensGross -or $_.Name -like '~$*') { return }
      $info.dateien++
      $nr = $m.Groups[1].Value
      if (-not $jeNr.ContainsKey($nr) -or $_.LastWriteTimeUtc -gt $jeNr[$nr].LastWriteTimeUtc) { $jeNr[$nr] = $_ }
    }
    $info.nummern = $jeNr.Count
    $info.beispiele = @($jeNr.Values | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 8 |
      ForEach-Object { $_.FullName.Substring($pfad.TrimEnd("\").Length).TrimStart("\") })

    foreach ($nr in @($jeNr.Keys | Sort-Object)) {
      $d = $jeNr[$nr]
      $k = [string]$t.id + "|" + $nr
      $kennung = Kennung $d
      if ($stand.dateien[$k] -eq $kennung) { continue }
      if ($nochFrei -le 0) { break }
      if ($Probe) { Schreibe ("würde schicken: " + $t.name + " " + $nr + " ← " + $d.FullName); $info.neu++; continue }
      try {
        $text = TextLesen $d
        Anmelden
        Aendern "Post" "nc_geo?on_conflict=type_id,nr" @{ type_id = [string]$t.id; nr = $nr; datei = $d.Name;
          inhalt = $text; geaendert = $d.LastWriteTimeUtc.ToString("o"); gelesen_am = $jetztIso } "resolution=merge-duplicates"
        $stand.dateien[$k] = $kennung
        $info.neu++; $status.geschickt++; $nochFrei--
      } catch {
        Schreibe ("Nicht geschickt: " + $d.FullName + " — " + $_.Exception.Message)
        if (-not $info.fehler) { $info.fehler = $_.Exception.Message }
      }
    }
    StandSichern
  }
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

if ($status.geschickt -gt 0) { Schreibe ([string]$status.geschickt + " Geometrie-Programme geschickt") }
try {
  Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "nc_geo_status";
    wert = ($status | ConvertTo-Json -Compress -Depth 4) } "resolution=merge-duplicates"
} catch { Schreibe ("Stand nicht an die App gemeldet: " + $_.Exception.Message) }
StandSichern

if ($Probe) {
  Write-Host ""
  foreach ($i in $status.typen) {
    $z = "  " + $i.typ + ": " + $i.pfad + " — " + $i.dateien + " Dateien mit 4…, " + $i.nummern + " Nummern, " + $i.neu + " würden geschickt"
    if ($i.fehler) { $z += " — " + $i.fehler }
    Write-Host $z
  }
  if (-not $status.typen.Count) { Write-Host "  Bei keinem Typ ist ein Ordner NC-Programme eingetragen." }
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
