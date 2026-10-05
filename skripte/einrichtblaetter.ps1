# =================================================================
#  EINRICHTBLÄTTER — Excel-Dateien aus den Typ-Ordnern in die App
#
#  Läuft über die Windows-Aufgabenplanung alle fünf Minuten. Welche
#  Ordner es anschaut und zu welchem Maschinentyp jeder gehört, steht
#  in der App unter Einstellungen → Dokumente → Einrichtblatt-Ordner.
#
#  In den Ordnern liegen auch PDFs, CAD-Dateien und anderes. Das
#  Programm nimmt nur Excel-Dateien (.xlsx, .xlsm, .xls) mit einer
#  HOCO Nr. im Namen, wie auch immer sie sonst heissen:
#
#     10844-0049.xlsx                    → Einrichtblatt der HOCO Nr.
#     Werkzeugprotokoll 10844-0049.xlsx    10844-0049 auf dem Typ des
#     10844-0049 neu.xlsm                  Ordners
#
#  Hat der Name ausser HOCO Nr., Typ und "Werkzeugprotokoll" noch ein
#  anderes Wort (Toleranzen, Plattenwechsel, Werkzeugkosten …), ist es
#  kein Einrichtblatt und bleibt weg. Gibt es für eine HOCO Nr. mehrere,
#  zählt das Werkzeugprotokoll, sonst die zuletzt geänderte Datei. Eine Datei wird nur hochgeladen, wenn
#  sie neu ist oder sich seit dem letzten Mal geändert hat.
#
#  DAS PROGRAMM LIEST NUR. In den Ordnern wird nie etwas gelöscht,
#  verschoben, umbenannt oder geändert. Zum Hochladen kopiert es die
#  Datei zuerst nach %TEMP% und lädt die Kopie hoch, so stört es auch
#  nicht, wenn die Datei gerade in Excel offen ist.
#
#  Solange in der App der Schalter "Hochladen" aus ist, macht jeder
#  Durchlauf nur einen Probelauf: Er zeigt in der App, was er tun
#  würde, und lädt nichts hoch.
#
#  Aufruf:
#     .\einrichtblaetter.ps1            normaler Durchlauf
#     .\einrichtblaetter.ps1 -Probe     immer nur zeigen, nie hochladen
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "einrichtblaetter-stand.json"
$protDatei  = Join-Path $ordnerHier "einrichtblaetter.log"
$hoechstensJeLauf = 150
$listeHoechstens  = 300

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

# ---------- Einstellungen ----------
if (-not (Test-Path $einstDatei)) { Schreibe "abgleich-einstellungen.json fehlt"; exit 1 }
$E = Get-Content -Raw -Path $einstDatei -Encoding UTF8 | ConvertFrom-Json
$U = ($E.supabase_url).TrimEnd("/")
$KEY = $E.anon_key

# Anmeldung und welche Datei je HOCO Nr. und Typ zuletzt hochgeladen wurde
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

# HOCO Nr. im Namen, gleich wie die App sie erkennt: 10844-0049, 10844 - 0049
function HocoAusName([string]$name) {
  $m = [regex]::Match([IO.Path]::GetFileNameWithoutExtension($name), '(?<!\d)(\d{4,6})\s?-\s?(\d{3,5})(?!\d)')
  if ($m.Success) { return $m.Groups[1].Value + "-" + $m.Groups[2].Value }
  return $null
}

# Ist die Excel-Datei ein Einrichtblatt? Im selben Ordner liegen auch
# Toleranzen, Plattenwechsel, Werkzeugkosten usw. mit derselben HOCO Nr.
#   1 = Werkzeugprotokoll im Namen (auch vertippt: Werkzeuprotokoll …)
#   2 = sonst nur HOCO Nr., Typ, Ziffern oder "Nr"
#   0 = ein anderes Wort im Namen: kein Einrichtblatt, bleibt weg
function Rang([string]$name, [string]$typName) {
  $ohne = [regex]::Replace([IO.Path]::GetFileNameWithoutExtension($name), '\d{4,6}\s?-\s?\d{3,5}', ' ')
  $typWoerter = @(($typName.ToLower() -split '[^a-zäöüß]+') | Where-Object { $_ })
  $fremd = @()
  $prot = $false
  foreach ($w in (($ohne.ToLower() -split '[^a-zäöüß]+') | Where-Object { $_ })) {
    # Alte Fassungen und Kopien nie, auch nicht als Werkzeugprotokoll
    if (@('alt', 'old', 'kopie', 'copy') -contains $w) { return @{ rang = 0; fremd = $w } }
    if ($w -match 'protokol') { $prot = $true; continue }
    if ($typWoerter -contains $w -or $w -eq 'sw' -or $w -eq 'nr') { continue }
    $fremd += $w
  }
  if ($prot) { return @{ rang = 1; fremd = "" } }
  if ($fremd.Count -eq 0) { return @{ rang = 2; fremd = "" } }
  return @{ rang = 0; fremd = ($fremd -join " ") }
}

# Woran man erkennt, ob sich eine Datei geändert hat
function Kennung($d) { return $d.FullName + "|" + $d.LastWriteTimeUtc.Ticks + "|" + $d.Length }

# Nur lesend öffnen und nach %TEMP% kopieren. FileShare ReadWrite, damit
# eine in Excel offene Datei trotzdem gelesen werden kann und Excel
# nichts merkt.
function LesendKopieren($d) {
  $temp = Join-Path $env:TEMP ("hofer-eb-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
  New-Item -ItemType Directory -Path $temp | Out-Null
  $ziel = Join-Path $temp $d.Name
  $quelle = [IO.File]::Open($d.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $aus = [IO.File]::Create($ziel)
    try { $quelle.CopyTo($aus) } finally { $aus.Close() }
  } finally { $quelle.Close() }
  return Get-Item -LiteralPath $ziel
}

# ---------- Durchlauf ----------
$status = @{ zeit = (Get-Date).ToUniversalTime().ToString("o"); rechner = $env:COMPUTERNAME;
             scharf = $false; ordner = @(); excel = 0; neu = 0; ersetzt = 0; gleich = 0;
             ohneNr = 0; fremd = 0; aelter = 0; hochgeladen = 0; fehler = $null; liste = @() }
function Eintrag($o, [string]$datei, [string]$hoco, [string]$was) {
  if ($status.liste.Count -lt $listeHoechstens) {
    $status.liste += @{ o = $o; d = $datei; h = $hoco; w = $was }
  }
}

try {
  Anmelden

  $konf = $null
  $k = @(Lesen "app_config?select=wert&schluessel=eq.eb_ordner")
  if ($k.Count -gt 0 -and $k[0].wert) { $konf = $k[0].wert | ConvertFrom-Json }
  if (-not $konf -or -not $konf.ordner -or @($konf.ordner).Count -eq 0) {
    throw "In der App sind noch keine Einrichtblatt-Ordner eingetragen (Einstellungen → Dokumente)."
  }
  $scharf = [bool]$konf.scharf -and -not $Probe
  $status.scharf = $scharf
  if (-not $scharf) { Schreibe "Probelauf: es wird nichts hochgeladen." }

  $typen = @(Lesen "machine_types?select=id,name")
  # Welche HOCO Nr. auf welchem Typ hat in der App schon ein Einrichtblatt?
  $vorhanden = @{}
  Lesen "hoco_type_data?select=hoco_nr,type_id,blatt_url&blatt_url=not.is.null" |
    ForEach-Object { $vorhanden[[string]$_.hoco_nr + "|" + [string]$_.type_id] = $true }

  $nochFrei = $hoechstensJeLauf
  $oi = -1
  foreach ($o in @($konf.ordner)) {
    $oi++
    $pfad = PfadAufloesen ([string]$o.pfad)
    $typ = $typen | Where-Object { [string]$_.id -eq [string]$o.typ } | Select-Object -First 1
    $info = @{ pfad = $pfad; typ = $(if ($typ) { $typ.name } else { "" }); excel = 0; fehler = $null }
    $status.ordner += $info
    if (-not $pfad) { continue }
    if (-not $typ) { $info.fehler = "Kein Maschinentyp gewählt"; Schreibe ("Ordner ohne Typ: " + $pfad); continue }
    if (-not (Test-Path -LiteralPath $pfad)) {
      $info.fehler = "Ordner nicht erreichbar"
      if ($pfad -match '^[D-Zd-z]:') {
        $info.fehler += ". Das Laufwerk " + $pfad.Substring(0, 2) + " kennt die Aufgabe nicht, besser \\Server\Freigabe\... eintragen"
      }
      Schreibe ("Ordner nicht erreichbar: " + $pfad)
      continue
    }

    # *.xls* trifft .xls, .xlsx und .xlsm. "~$…" sind Sperrdateien von Excel.
    $alle = @(Get-ChildItem -LiteralPath $pfad -File -Filter "*.xls*" -Recurse:([bool]$o.unter) -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -match '^\.(xlsx|xlsm|xls)$' -and $_.Name -notlike '~$*' })
    $info.excel = $alle.Count
    $status.excel += $alle.Count

    # Je HOCO Nr. das Werkzeugprotokoll, sonst die Datei nur mit Nummer;
    # bei mehreren davon die zuletzt geänderte
    $jeNr = @{}
    foreach ($d in $alle) {
      $h = HocoAusName $d.Name
      if (-not $h) { $status.ohneNr++; Eintrag $oi $d.Name "" "ohne HOCO Nr. im Namen, bleibt weg"; continue }
      $r = Rang $d.Name $typ.name
      if ($r.rang -eq 0) { $status.fremd++; Eintrag $oi $d.Name $h ("kein Einrichtblatt (" + $r.fremd + "), bleibt weg"); continue }
      $d | Add-Member -NotePropertyName HoferRang -NotePropertyValue $r.rang -Force
      if (-not $jeNr[$h]) { $jeNr[$h] = @() }
      $jeNr[$h] += $d
    }
    foreach ($h in ($jeNr.Keys | Sort-Object)) {
      $gruppe = @($jeNr[$h] | Sort-Object @{ Expression = { $_.HoferRang } }, @{ Expression = { $_.LastWriteTimeUtc }; Descending = $true })
      $d = $gruppe[0]
      foreach ($x in ($gruppe | Select-Object -Skip 1)) {
        $status.aelter++; Eintrag $oi $x.Name $h ("weiteres Blatt, es zählt " + $d.Name)
      }
      $schluessel = $h + "|" + [string]$typ.id
      $kennung = Kennung $d
      if ($stand.dateien[$schluessel] -eq $kennung) { $status.gleich++; continue }

      $ersetzt = [bool]$vorhanden[$schluessel]
      if ($ersetzt) { $status.ersetzt++ } else { $status.neu++ }
      $was = $(if ($ersetzt) { "ersetzt das Einrichtblatt in der App" } else { "neu" })
      if (-not $scharf) { Eintrag $oi $d.Name $h ("würde hochladen: " + $was); Schreibe ("Probe: " + $d.FullName + "  →  " + $h + " auf " + $typ.name + ", " + $was); continue }
      if ($nochFrei -le 0) { Eintrag $oi $d.Name $h "kommt beim nächsten Durchlauf"; continue }

      $kopie = $null
      try {
        $kopie = LesendKopieren $d
        $z = @{ hoco = $h; typ = $typ; art = "einrichtblatt"; titel = $h; fa = $null; auftrag = $null; grund = ""; passt = $true }
        Hochladen $kopie $z "eb-ordner"
        $stand.dateien[$schluessel] = $kennung
        $vorhanden[$schluessel] = $true
        $status.hochgeladen++
        $nochFrei--
        Eintrag $oi $d.Name $h ("hochgeladen, " + $was)
        Schreibe ($d.FullName + "  →  " + $h + " auf " + $typ.name)
      } catch {
        Eintrag $oi $d.Name $h ("Fehler: " + $_.Exception.Message)
        Schreibe ("Fehler bei " + $d.FullName + ": " + $_.Exception.Message)
        $status.fehler = "Fehler bei " + $d.Name + ": " + $_.Exception.Message
      } finally {
        # Nur die eigene Kopie in %TEMP% wegräumen, nie das Original
        if ($kopie) { Remove-Item -LiteralPath (Split-Path -Parent $kopie.FullName) -Recurse -Force -ErrorAction SilentlyContinue }
      }
    }
  }
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

try {
  Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "eb_ordner_status";
    wert = ($status | ConvertTo-Json -Compress -Depth 4) } "resolution=merge-duplicates"
} catch { Schreibe ("Stand nicht an die App gemeldet (sql/einrichtblatt-ordner.sql ausgeführt?): " + $_.Exception.Message) }
StandSichern

if ($Probe -or -not $status.scharf) {
  Write-Host ""
  Write-Host ("Probelauf: " + $status.excel + " Excel-Dateien gefunden, " + ($status.neu + $status.ersetzt) +
    " würden hochgeladen (" + $status.neu + " neu, " + $status.ersetzt + " ersetzen ein vorhandenes), " +
    $status.ohneNr + " ohne HOCO Nr., " + $status.fremd + " keine Einrichtblätter (Toleranzen usw.), " + $status.aelter + " weitere Blätter derselben Nummer. Nichts hochgeladen, im Ordner nichts verändert.")
  foreach ($o in $status.ordner) {
    $t = "  " + $o.pfad + "  (Typ " + $o.typ + "): " + $o.excel + " Excel-Dateien"
    if ($o.fehler) { $t += " — " + $o.fehler }
    Write-Host $t
  }
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
