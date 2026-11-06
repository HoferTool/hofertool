# =================================================================
#  KEYENCE — Messberichte vom Bildmessgerät Keyence IM ins Tool
#
#  Läuft dauernd im Hintergrund und schaut jede Minute nach (Wunsch
#  Patrick 6. November 2026: „jede Minute, sonst zu langsam“). Gestartet
#  von hofertool.ps1, wenn die Sperre Global\HoferToolKeyence fehlt; bei
#  neuer Fassung startet es sich selbst neu. Ohne Knopf in der App (Wunsch Patrick 6. November 2026: „wenn man auf
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
#  CSV-Dateien, die mit "Teilbericht" beginnen, dazu die Tagesdateien des
#  Geräts (z. B. 20261107Hofer.csv, je Messung eine Zeile, seit 6. November
#  2026), und legt Kopf und Mess-
#  werte in die Tabelle messberichte. Die HOCO Nr. kommt aus dem Namen der
#  Messeinstellung (sonst aus dem Dateinamen). Nur neue oder geänderte
#  Dateien werden geschickt (keyence-stand-2.json). Berichte bleiben 30 Tage
#  in der Datenbank, danach löscht das Programm sie dort (die Dateien im
#  Ordner bleiben). Ältere Dateien schickt es gar nicht erst.
#
#  DAS PROGRAMM LIEST NUR. Im Ordner wird nie etwas gelöscht,
#  verschoben, umbenannt oder geändert.
#
#  Aufruf:
#     .\keyence.ps1            Dauerlauf, jede Minute
#     .\keyence.ps1 -Probe     zeigt, was es fände, schickt nichts
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
# Seit 6. November 2026 „-2“: die Tagesdateien waren schon als „kein Teilbericht“
# vermerkt und müssen einmal neu gelesen werden
$standDatei = Join-Path $ordnerHier "keyence-stand-2.json"
$protDatei  = Join-Path $ordnerHier "keyence.log"
$vorgabeOrdner    = "W:\KONTROLLE\Keyence"
$hoechstensJeLauf = 300
$hoechstensGross  = 1MB
$tageBehalten     = 30
$ichSelbst = $MyInvocation.MyCommand.Path

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

# Tagesdatei des Geräts (z. B. 20261107Hofer.csv im Ordner der Messeinstellung,
# seit 6. November 2026: so kam Patricks Messung an der 128 an). Aufbau:
#   Name der Messeinstellungsdaten;Messzeit;Losnummer;laufenden Zähler;OK/N.i.O.;Verantwortliche/r;Nummer;<Element>;…
#   Sollwert;;;;;;;<Soll je Element>
#   Obergrenze;…  (Abweichung nach oben)
#   Untergrenze;… (Abweichung nach unten, negativ)
#   je Messung eine Zeile mit den Messwerten
# Jede Messung wird ein eigener Bericht, im selben Aufbau wie ein Teilbericht.
function ZahlAus([string]$t) {
  $z = $t.Trim() -replace ',', '.'
  $d = 0.0
  if ([double]::TryParse($z, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d }
  return $null
}
function SammelLesen([string]$text) {
  $zeilen = @($text -split "`n" | Where-Object { $_.Trim() })
  if ($zeilen.Count -lt 2) { return @() }
  $kopfZ = Felder $zeilen[0]
  if (-not $kopfZ.Count -or $kopfZ[0] -notmatch '^Name der Messeinstellung') { return @() }
  $soll = @(); $ober = @(); $unter = @()
  $daten = New-Object System.Collections.Generic.List[object]
  for ($i = 1; $i -lt $zeilen.Count; $i++) {
    $f = Felder $zeilen[$i]
    if (-not $f.Count) { continue }
    switch -regex ($f[0]) {
      '^Sollwert$'    { $soll = $f; continue }
      '^Obergrenze$'  { $ober = $f; continue }
      '^Untergrenze$' { $unter = $f; continue }
      default         { $daten.Add(@{ f = $f; roh = $zeilen[$i] }) }
    }
  }
  # Feste Spalten bis „Nummer“, danach die Messelemente
  $erstesElement = 7
  for ($k = 0; $k -lt $kopfZ.Count; $k++) { if ($kopfZ[$k] -match '^Nummer$') { $erstesElement = $k + 1; break } }
  $spalten = @("Nr.", "Messelemente", "Messwert", "Einheit", "Sollwert", "Obergr.", "Untergrz.", "Auflsg.")
  $aus = @()
  foreach ($d in $daten) {
    $f = $d.f
    $kopf = [ordered]@{}
    for ($k = 0; $k -lt [Math]::Min($erstesElement, $kopfZ.Count); $k++) {
      $name = $kopfZ[$k]
      if ($name -match '^Messzeit$') { $name = "Datum und Uhrzeit der Messung" }
      if ($name -match '^OK/N') { $name = "Gesamtergebnis" }
      $kopf[$name] = $(if ($k -lt $f.Count) { $f[$k] } else { "" })
    }
    $werte = New-Object System.Collections.Generic.List[object]
    $nr = 0
    for ($k = $erstesElement; $k -lt $kopfZ.Count; $k++) {
      $nr++
      $w = $(if ($k -lt $f.Count) { $f[$k] } else { "" })
      $s = $(if ($k -lt $soll.Count) { $soll[$k] } else { "" })
      $o = $(if ($k -lt $ober.Count) { $ober[$k] } else { "" })
      $u = $(if ($k -lt $unter.Count) { $unter[$k] } else { "" })
      # Urteil je Element nur, wenn eine Toleranz da ist (0 / 0 = nur messen)
      $ok = ""
      $wz = ZahlAus $w; $sz = ZahlAus $s; $oz = ZahlAus $o; $uz = ZahlAus $u
      if ($wz -ne $null -and $sz -ne $null -and $oz -ne $null -and $uz -ne $null -and -not ($oz -eq 0 -and $uz -eq 0)) {
        $ok = $(if ($wz -ge $sz + $uz - 0.00005 -and $wz -le $sz + $oz + 0.00005) { "OK" } else { "NG" })
      } elseif (-not $w) { $ok = "Fehler" }
      $werte.Add(@([string]$nr, $kopfZ[$k].Trim(), $w, "", $s, $o, $u, $ok))
    }
    $rohTeile = @($zeilen[0]) + @($zeilen | Where-Object { $_ -match '^(Sollwert|Obergrenze|Untergrenze);' }) + @($d.roh)
    $aus += ,@{ kopf = $kopf; spalten = $spalten; zeilen = $werte; roh = ($rohTeile -join "`n") }
  }
  return ,$aus
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

function Durchlauf {
  $script:jetztIso = (Get-Date).ToUniversalTime().ToString("o")
  $script:status = @{ zeit = $jetztIso; rechner = $env:COMPUTERNAME; scharf = (-not $Probe); pfad = $null;
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
      # Zur Kontrolle alle CSV-Dateien (jüngste zuerst) mit erster Zeile melden,
      # damit man sieht, was das Gerät wirklich schreibt (Patrick 6. November 2026:
      # „Messung bei 128 gespeichert, sehe es nicht“)
      $status.alle = @($dateien | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 25 | ForEach-Object {
        $erste = ""
        try { $erste = [string](Get-Content -LiteralPath $_.FullName -TotalCount 1 -Encoding Default -ErrorAction Stop) } catch { }
        if ($erste.Length -gt 60) { $erste = $erste.Substring(0, 60) }
        $_.FullName.Substring($pfad.Length).TrimStart('\') + " | " + $_.LastWriteTime.ToString("dd.MM. HH:mm") + " | " + $erste })
      # Inhalt der jüngsten Datei, die kein Teilbericht ist (Tagesdatei des Geräts),
      # damit das Format bekannt ist
      $probeDatei = $dateien | Sort-Object LastWriteTimeUtc -Descending | Where-Object {
        try { -not ([string](Get-Content -LiteralPath $_.FullName -TotalCount 1 -Encoding Default -ErrorAction Stop)).StartsWith("Teilbericht") } catch { $false } } | Select-Object -First 1
      if ($probeDatei) {
        $status.probeDatei = $probeDatei.FullName
        $status.probe = @(Get-Content -LiteralPath $probeDatei.FullName -TotalCount 12 -Encoding Default -ErrorAction SilentlyContinue | ForEach-Object {
          $z = [string]$_; if ($z.Length -gt 1500) { $z.Substring(0, 1500) } else { $z } })
      }
      $status.ordnerListe = @(Get-ChildItem -LiteralPath $pfad -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 25 | ForEach-Object {
          $_.Name + " | " + $_.LastWriteTime.ToString("dd.MM. HH:mm") + " | " + (@(Get-ChildItem -LiteralPath $_.FullName -File -ErrorAction SilentlyContinue | Group-Object Extension | ForEach-Object { $_.Name + ":" + $_.Count }) -join " ") })
      $nochFrei = $hoechstensJeLauf
      foreach ($d in $dateien) {
        $kennung = Kennung $d
        if ($stand.dateien[$d.FullName] -eq $kennung) { continue }
        if ($nochFrei -le 0) { break }
        try {
          $text = TextLesen $d
          $b = BerichtLesen $text
          if (-not $b) {
            # Tagesdatei des Geräts: je Zeile eine Messung
            $sammel = SammelLesen $text
            foreach ($sb in $sammel) {
              $status.berichte++
              $einst = KopfWert $sb.kopf '^Name der Messeinstellung'
              if (-not $einst) { $einst = $d.Directory.Name }
              $hoco = HocoAus $einst
              if (-not $hoco) { $hoco = HocoAus $d.Directory.Name }
              if (-not $hoco) { $status.ohneHoco++ }
              $zeit = ZeitIso (KopfWert $sb.kopf '^Datum und Uhrzeit')
              if (-not $zeit) { $zeit = $d.LastWriteTimeUtc.ToString("o") }
              if ([DateTime]::Parse($zeit).ToUniversalTime() -lt (Get-Date).ToUniversalTime().AddDays(-$tageBehalten)) { continue }
              # Eindeutig je Messung: Datei, Messzeit und Nummer
              $schluessel = $d.FullName + "#" + (KopfWert $sb.kopf '^Datum und Uhrzeit') + "#" + (KopfWert $sb.kopf '^Nummer$')
              if ($status.beispiele.Count -lt 8) { $status.beispiele += ($d.Name + " → " + $(if ($hoco) { $hoco } else { "ohne HOCO Nr." })) }
              if ($Probe) { Schreibe ("würde schicken: " + $schluessel + " → " + $hoco); continue }
              Anmelden
              Aendern "Post" "messberichte?on_conflict=datei" @{ datei = $schluessel; hoco_nr = $hoco; einstellung = $einst;
                gemessen_am = $zeit; ergebnis = (KopfWert $sb.kopf '^Gesamtergebnis'); kopf = $sb.kopf;
                spalten = @($sb.spalten); zeilen = @($sb.zeilen.ToArray()); roh = $sb.roh; gelesen_am = $jetztIso } "resolution=merge-duplicates"
              $status.geschickt++; $nochFrei--
            }
            $stand.dateien[$d.FullName] = $kennung; continue
          }
          $status.berichte++
          $einst = KopfWert $b.kopf '^Name der Messeinstellung'
          $hoco = HocoAus $einst
          if (-not $hoco) { $hoco = HocoAus $d.BaseName }
          if (-not $hoco) { $status.ohneHoco++ }
          $zeit = ZeitIso (KopfWert $b.kopf '^Datum und Uhrzeit')
          if (-not $zeit) { $zeit = $d.LastWriteTimeUtc.ToString("o") }
          # Älter als die Aufbewahrung: gar nicht erst schicken
          if ([DateTime]::Parse($zeit).ToUniversalTime() -lt (Get-Date).ToUniversalTime().AddDays(-$tageBehalten)) {
            $stand.dateien[$d.FullName] = $kennung; continue }
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
}

# Berichte älter als 30 Tage aus der Datenbank (Wunsch Patrick)
function Aufraeumen {
  $grenze = (Get-Date).ToUniversalTime().AddDays(-$tageBehalten).ToString("o")
  Anmelden
  Aendern "Delete" ("messberichte?gemessen_am=lt." + (W $grenze)) $null ""
}

if ($Probe) {
  Durchlauf
  Write-Host ""
  Write-Host ("  Ordner: " + $status.pfad + " — " + $status.dateien + " CSV-Dateien, " + $status.berichte + " neue Teilberichte, " + $status.ohneHoco + " ohne HOCO Nr.")
  if ($status.fehler) { Write-Host ("  Fehler: " + $status.fehler) }
  exit 0
}

# ---------- Dauerlauf ----------
$sperre = New-Object Threading.Mutex($false, "Global\HoferToolKeyence")
try { $frei = $sperre.WaitOne(20000) } catch [Threading.AbandonedMutexException] { $frei = $true }
if (-not $frei) { Schreibe "Läuft schon"; exit 0 }
$start = Get-Date
$eigeneFassung = (Get-Item -LiteralPath $ichSelbst).LastWriteTimeUtc
$naechstesAufraeumen = Get-Date
Schreibe "Gestartet"
try {
  while ($true) {
    Durchlauf
    if ((Get-Date) -ge $naechstesAufraeumen) {
      try { Aufraeumen } catch { Schreibe ("Aufräumen ging nicht: " + $_.Exception.Message) }
      $naechstesAufraeumen = (Get-Date).AddHours(1)
    }
    Start-Sleep -Seconds 60
    # Neue Fassung von GitHub (hofertool.ps1 legt sie hin) oder nach
    # zwölf Stunden: sich selbst neu starten
    $neu = $false
    try { $neu = (Get-Item -LiteralPath $ichSelbst).LastWriteTimeUtc -ne $eigeneFassung } catch { }
    if ($neu -or ((Get-Date) - $start).TotalHours -ge 12) {
      Schreibe $(if ($neu) { "Neue Fassung, starte neu" } else { "Starte nach zwölf Stunden neu" })
      try { $sperre.ReleaseMutex() } catch { }
      Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -WorkingDirectory $ordnerHier `
        -ArgumentList @("-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", ('"' + $ichSelbst + '"'))
      exit 0
    }
  }
} finally {
  try { $sperre.ReleaseMutex() } catch { }
}
