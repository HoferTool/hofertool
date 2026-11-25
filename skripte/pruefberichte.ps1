# =================================================================
#  PRÜFBERICHTE — Excel-Prüfberichte aus den Ordnern in die App
#
#  Läuft alle fünf Minuten in der Aufgabe "HoferTool" (hofertool.ps1),
#  ohne Knopf in der App (Wunsch Patrick 24. November 2026: "will das bei
#  hofertool als pfad hinterlegen und dort ist es nach ordner"). Welche
#  Ordner, steht in der App unter Einstellungen → Dokumente →
#  Prüfbericht-Ordner. Die App zeigt die Berichte unter
#  Qualitätssicherung → Prüfberichte und macht daraus Prüfprotokolle.
#
#  Genommen wird jede Excel-Datei (.xlsx, .xlsm, .xls) in den Ordnern,
#  mit Unterordnern, wenn das Häkchen gesetzt ist. Die HOCO Nr. ist der
#  Kundenordner (5 Ziffern) plus die letzten vier Ziffern der Nummer im
#  Dateinamen, sonst wie bei den Zeichnungen aus Kunden- und Teilordner.
#  Genommen werden nur HOCO Nummern, die es im Tool gibt (hoco_parts).
#  Aus dem Excel liest das Programm den Index (neben oder unter "Index",
#  auch "Ind. B" in derselben Zelle); je HOCO Nr. und Index bleibt nur der
#  neuste Bericht als Vorlage, ältere kommen aus der App. Ein Bericht über
#  mehrere Dateien (Name mit "S 2", "Seite 2", "_Seite_2") bleibt zusammen:
#  alle Seiten des neusten Berichts kommen mit, eine .xlsx gilt vor der
#  gleichen .xls (Wunsch Patrick 25. November 2026: „mehrere Seiten
#  zusammenfassen zu einem Punkt“, „Index wichtig“).
#
#  Unveränderte Dateien (Name, Grösse, Änderungszeit) bleiben in Ruhe.
#  Eine geänderte Datei ersetzt ihre frühere in der App. Ist eine Datei
#  aus dem Ordner verschwunden, nimmt das Programm sie in der App weg,
#  aber nur, wenn der Ordner erreichbar war.
#
#  DAS PROGRAMM LIEST NUR. In den Ordnern wird nie etwas gelöscht,
#  verschoben, umbenannt oder geändert. Hochgeladen wird eine Kopie aus
#  %TEMP%, so stört auch eine gerade offene Datei nicht.
#
#  Höchstens 150 Dateien je Durchlauf, der nächste macht weiter.
#
#  Aufruf:
#     .\pruefberichte.ps1            normaler Durchlauf
#     .\pruefberichte.ps1 -Probe     Probelauf, nie hochladen
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "pruefberichte-stand.json"
$protDatei  = Join-Path $ordnerHier "pruefberichte.log"
$hoechstensJeLauf = 150

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

# dateien: voller Pfad → Kennung der zuletzt hochgeladenen Fassung
# index: Kennung der Datei → Index aus dem Excel (gemerkt, damit jede Datei nur einmal geöffnet wird)
$stand = @{ token = $null; ablauf = 0; auffrischen = $null; dateien = @{}; zuletzt = $null; index = @{}; neu = $null }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
    $stand.zuletzt = $g.zuletzt; $stand.neu = $g.neu
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
    if ($g.index) { $g.index.PSObject.Properties | ForEach-Object { $stand.index[$_.Name] = [string]$_.Value } }
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
}

. (Join-Path $ordnerHier "dokumente-teile.ps1")

function HocoAusText([string]$text) {
  $m = [regex]::Match([string]$text, '(?<!\d)(\d{4,6})\s?-\s?(\d{3,5})(?!\d)')
  if ($m.Success) { return $m.Groups[1].Value + "-" + $m.Groups[2].Value }
  return $null
}

# Gleich wie bei den Zeichnungen (zeichnungen.ps1)
# Prüfberichte heissen fast immer wie das Teil, nur mit den letzten drei Ziffern
# des Kunden: 10007\007-0710.xlsx = 10007-0710. Darüber stehen Ordner mit
# Bereichen wie „10000-10020“ oder „0501 bis 0600“, die keine HOCO Nr. sind
# (vorher landeten so 426 Berichte bei „10000-10020“).
function HocoAusDateiname($d, [string]$wurzel) {
  $w = $wurzel.TrimEnd('\').ToLower()
  $m = [regex]::Match([string]$d.Name, '^\s*(\d{3,5})\s?-\s?(\d{4})(?!\d)')
  if (-not $m.Success) { return $null }
  $k = $m.Groups[1].Value; $t = $m.Groups[2].Value
  if ($k.Length -eq 5) { return "$k-$t" }
  # Kundenordner: fünf Ziffern, die auf die Ziffern aus dem Namen enden
  $o = $d.Directory
  while ($o -and $o.FullName.TrimEnd('\').Length -gt $w.Length) {
    $kn = [regex]::Match([string]$o.Name, '^\s*(\d{5})\s*$')
    if ($kn.Success -and $kn.Groups[1].Value.EndsWith($k)) { return $kn.Groups[1].Value + "-" + $t }
    $o = $o.Parent
  }
  if ($k.Length -eq 3) { return "10$k-$t" }
  return $null
}

function IstBereich([string]$name) {
  return ($name -match '(?i)\bbis\b') -or ($name -match '^\s*\d{5}\s?-\s?\d{5}\s*$')
}

function HocoAusPfad($d, [string]$wurzel) {
  $h = HocoAusDateiname $d $wurzel
  if ($h) { return $h }
  $w = $wurzel.TrimEnd('\').ToLower()
  $o = $d.Directory
  while ($o -and $o.FullName.TrimEnd('\').Length -gt $w.Length) {
    $t = [regex]::Match([string]$o.Name, '^\s*(\d{3,5})(?!\d)')
    if (IstBereich $o.Name) { $t = [regex]::Match("", "x") }
    $k = $o.Parent
    if ($t.Success -and $k -and $k.FullName.TrimEnd('\').Length -gt $w.Length) {
      $kn = [regex]::Match([string]$k.Name, '^\s*(\d{4,6})\s*$')
      if ($kn.Success) { return $kn.Groups[1].Value + "-" + $t.Groups[1].Value }
    }
    $o = $o.Parent
  }
  $h = HocoAusName $d.Name
  if ($h) { return $h }
  $o = $d.Directory
  while ($o -and $o.FullName.TrimEnd('\').Length -gt $w.Length) {
    $h = $null
    if (-not (IstBereich $o.Name)) { $h = HocoAusText $o.Name }
    if ($h) { return $h }
    $o = $o.Parent
  }
  return $null
}

# Aufbau der Ordner laut Patrick (25. November 2026): Kundenübersicht →
# Kundenordner (fünf Ziffern) → Ordner je Gruppe von Teilen → Bericht.
# Die letzten vier Ziffern der Nummer im Dateinamen sind die Artikel-Nr.
# der HOCO Nr. Gibt alle möglichen HOCO Nummern, die erste bekannte gilt.
function HocoKandidaten($d, [string]$wurzel) {
  $liste = @()
  $h = HocoAusPfad $d $wurzel
  if ($h) { $liste += $h }
  $w = $wurzel.TrimEnd('\').ToLower()
  $kunde = $null
  $o = $d.Directory
  while ($o -and $o.FullName.TrimEnd('\').Length -gt $w.Length) {
    $kn = [regex]::Match([string]$o.Name, '^\s*(\d{5})(?!\d)')
    if ($kn.Success -and -not (IstBereich $o.Name)) { $kunde = $kn.Groups[1].Value; break }
    $o = $o.Parent
  }
  if ($kunde) {
    $n = [regex]::Match([IO.Path]::GetFileNameWithoutExtension($d.Name), '\d+(?:\s?-\s?\d+)?')
    if ($n.Success) {
      $ziffern = ($n.Value -replace '\D', '')
      if ($ziffern.Length -ge 4) { $liste += ($kunde + "-" + $ziffern.Substring($ziffern.Length - 4)) }
    }
  }
  return @($liste | Select-Object -Unique)
}

# Index aus dem Excel lesen, wie die App (pruefbericht.js): die Zelle unter
# dem Wort "Index" im Kopf des ersten Blatts. Nur .xlsx/.xlsm, .xls gibt "".
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
function ZipText($zip, [string]$name) {
  $e = $zip.GetEntry($name)
  if (-not $e) { return $null }
  $r = New-Object IO.StreamReader($e.Open())
  try { return $r.ReadToEnd() } finally { $r.Close() }
}
# Index wie in der App (indexNorm in pruefbericht.js): "Index:" vorne weg,
# leer, Striche und Beschriftungen ("Datum:") gelten als kein Index
function IndexNorm([string]$t) {
  $s = ([string]$t).Trim() -replace '^(?i)ind(ex)?\.?\s*:?\s*', ''
  $s = $s.Trim()
  if (-not $s -or $s -match '^[\s\-–—_./]+$' -or $s -match ':$') { return "" }
  $s = $s.ToUpper()
  if ($s.Length -gt 12) { $s = $s.Substring(0, 12) }
  return $s
}
# Name ohne Endung und ohne Seitenangabe am Schluss ("S 2", "Seite 1+2", "_Seite_2")
$seiteMuster = '[\s_\-]*\(?(s|seite|page|blatt)[\s_.]*\d+(\s*[+&,]\s*\d+)*\)?\s*$'
function Grundname([string]$name) {
  $b = [IO.Path]::GetFileNameWithoutExtension($name).ToLower()
  $b = [regex]::Replace($b, $seiteMuster, '')
  return ([regex]::Replace($b, '[\s_\-.]+', ' ')).Trim()
}
function SeiteAusName([string]$name) {
  $b = [IO.Path]::GetFileNameWithoutExtension($name).ToLower()
  $m = [regex]::Match($b, $seiteMuster)
  if (-not $m.Success) { return 1 }
  $z = [regex]::Match($m.Value, '\d+')
  return [int]$z.Value
}
function IndexAusExcel([string]$datei) {
  if ($datei -notmatch '(?i)\.xls[xm]$') { return "" }
  $zip = [IO.Compression.ZipFile]::OpenRead($datei)
  try {
    $teile = @()
    $ss = ZipText $zip "xl/sharedStrings.xml"
    if ($ss) {
      $x = New-Object Xml.XmlDocument; $x.LoadXml($ss)
      foreach ($si in $x.DocumentElement.ChildNodes) { if ($si.LocalName -eq "si") { $teile += [string]$si.InnerText } }
    }
    # erstes Blatt über workbook.xml und seine Verweise
    $blatt = "xl/worksheets/sheet1.xml"
    try {
      $wb = New-Object Xml.XmlDocument; $wb.LoadXml((ZipText $zip "xl/workbook.xml"))
      $erstes = @($wb.GetElementsByTagName("sheet"))[0]
      $rid = $erstes.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
      $rel = New-Object Xml.XmlDocument; $rel.LoadXml((ZipText $zip "xl/_rels/workbook.xml.rels"))
      foreach ($r in $rel.DocumentElement.ChildNodes) {
        if ($r.GetAttribute("Id") -eq $rid) {
          $z = $r.GetAttribute("Target").TrimStart('/')
          if ($z -notlike "xl/*") { $z = "xl/" + $z }
          $blatt = $z
        }
      }
    } catch { }
    $txt = ZipText $zip $blatt
    if (-not $txt) { return "" }
    $x = New-Object Xml.XmlDocument; $x.LoadXml($txt)
    # Zellen als "Zeile:Spalte"; Fehlerzellen (#WERT!) zählen nicht
    $werte = @{}; $tab = 99999
    foreach ($c in $x.GetElementsByTagName("c")) {
      $m = [regex]::Match($c.GetAttribute("r"), '^([A-Z]+)(\d+)$')
      if (-not $m.Success) { continue }
      if ($c.GetAttribute("t") -eq "e") { continue }
      $v = $null
      foreach ($k in $c.ChildNodes) { if ($k.LocalName -eq "v" -or $k.LocalName -eq "is") { $v = [string]$k.InnerText } }
      if ($null -eq $v) { continue }
      if ($c.GetAttribute("t") -eq "s") { $i = [int]$v; if ($i -lt $teile.Count) { $v = $teile[$i] } }
      $v = $v.Trim()
      if (-not $v) { continue }
      $sp = 0; foreach ($ch in $m.Groups[1].Value.ToCharArray()) { $sp = $sp * 26 + ([int]$ch - 64) }
      $zl = [int]$m.Groups[2].Value
      $werte["" + $zl + ":" + $sp] = $v
      if ($sp -eq 1 -and $v -match '^(?i)nr\.?$' -and $zl -lt $tab) { $tab = $zl }
    }
    # "Index" vor der Tabelle in Spalte 1 bis 14: Wert in derselben Zelle,
    # rechts daneben (bis 3 Spalten, keine andere Beschriftung) oder darunter
    $zeilen = @($werte.Keys | ForEach-Object { [int]($_.Split(":")[0]) } | Sort-Object -Unique)
    foreach ($zl in $zeilen) {
      if ($zl -ge $tab) { break }
      for ($sp = 1; $sp -le 14; $sp++) {
        $v = $werte["" + $zl + ":" + $sp]
        if (-not $v -or $v -notmatch '^(?i)ind(ex)?\.?(\s|:|$)') { continue }
        $n = IndexNorm $v
        if ($n) { return $n }
        for ($r = 1; $r -le 3; $r++) {
          $w = $werte["" + $zl + ":" + ($sp + $r)]
          if ($w) { if ($w -notmatch ':\s*$') { $n = IndexNorm $w; if ($n) { return $n } }; break }
        }
        $w = $werte["" + ($zl + 1) + ":" + $sp]
        if ($w) { $n = IndexNorm $w; if ($n) { return $n } }
        return ""
      }
    }
    return ""
  } finally { $zip.Dispose() }
}

function LesenAlle([string]$pfad) {
  $alle = @(); $ab = 0
  while ($true) {
    $teil = @(Lesen ($pfad + "&limit=1000&offset=" + $ab))
    $alle += $teil
    if ($teil.Count -lt 1000) { break }
    $ab += 1000
  }
  return $alle
}

function AusAblageWeg($pfade) {
  $p = @($pfade | Where-Object { $_ })
  if ($p.Count -eq 0) { return }
  try {
    Invoke-RestMethod -Method Delete -Uri "$U/storage/v1/object/zeichnungen" -Headers (Kopf) `
      -ContentType "application/json" -Body (Json @{ prefixes = $p }) | Out-Null
  } catch { Schreibe ("Alte Datei nicht gelöscht: " + $_.Exception.Message) }
}

function ZeilenWeg($zeilen) {
  $z = @($zeilen)
  if ($z.Count -eq 0) { return }
  try {
    Aendern "Delete" ("pruefbericht_dateien?id=in.(" + (($z | ForEach-Object { $_.id }) -join ",") + ")") $null $null
    AusAblageWeg @($z | ForEach-Object { [string]$_.ablage })
  } catch { Schreibe ("Nicht entfernt: " + $_.Exception.Message) }
}

$jetztIso = (Get-Date).ToUniversalTime().ToString("o")
$status = @{ immer = $true; zeit = $jetztIso; gesehen = $jetztIso; rechner = $env:COMPUTERNAME; scharf = (-not $Probe);
             ordner = @(); excel = 0; ohneNr = 0; rest = 0; hochgeladen = 0; entfernt = 0; abgeloest = 0; umgestellt = 0; doppelt = 0; unbekannt = 0; aelter = 0; fehler = $null }

try {
  Anmelden
  $konf = $null
  Lesen "app_config?select=wert&schluessel=eq.pruefbericht_ordner" |
    ForEach-Object { if ($_.wert) { try { $konf = $_.wert | ConvertFrom-Json } catch { } } }
  if (-not $konf -or -not $konf.ordner -or @($konf.ordner | Where-Object { $_.pfad }).Count -eq 0) {
    throw "In der App sind noch keine Prüfbericht-Ordner eingetragen (Einstellungen → Dokumente)."
  }

  # Alles neu: steht in app_config "pruefbericht_neu" ein neuer Wert (etwa
  # Datum und Zeit), löscht die Aufgabe einmal alle aus den Ordnern
  # hochgeladenen Berichte samt Dateien in der Ablage und lädt danach sauber
  # neu hoch (Wunsch Patrick 25. November 2026: „alles löschen und neu sauber
  # hochladen“). Welcher Wert erledigt ist, merkt sich der Stand.
  $neu = $null
  Lesen "app_config?select=wert&schluessel=eq.pruefbericht_neu" |
    ForEach-Object { if ($_.wert) { $neu = [string]$_.wert } }
  if ($neu -and $neu -ne [string]$stand.neu -and $status.scharf) {
    $weg = @(LesenAlle "pruefbericht_dateien?select=id,ablage&quelle=eq.ordner&order=id")
    for ($i = 0; $i -lt $weg.Count; $i += 100) {
      $ende = [Math]::Min($i + 99, $weg.Count - 1)
      ZeilenWeg @($weg[$i..$ende])
    }
    $stand.dateien = @{}
    $stand.index = @{}
    $stand.neu = $neu
    StandSichern
    $status.geleert = $weg.Count
    Schreibe ("Alles neu: " + $weg.Count + " Berichte gelöscht")
  }

  # Was in der App schon aus den Ordnern kam
  # Seitenweise lesen: die Datenbank gibt je Abfrage höchstens 1'000 Zeilen.
  # Vorher sah die Aufgabe nur die ersten 1'000, hielt den Rest für neu und
  # lud dieselben Dateien bei jedem Durchlauf nochmals hoch (25. November 2026:
  # 7'648 Zeilen für 1'152 Dateien).
  $inApp = @{}
  foreach ($r in (LesenAlle "pruefbericht_dateien?select=id,pfad,ablage,kennung,hoco_nr,index_nr&quelle=eq.ordner&order=id")) {
    $k = [string]$r.pfad
    if (-not $inApp.ContainsKey($k)) { $inApp[$k] = @() }
    $inApp[$k] += $r
  }

  # Doppelte derselben Datei (gleicher Pfad, gleiche Kennung) aufräumen,
  # die zuerst angelegte bleibt
  if ($status.scharf) {
    foreach ($k in @($inApp.Keys)) {
      $zeilen = @($inApp[$k])
      if ($zeilen.Count -lt 2) { continue }
      $bleibt = @(); $weg = @(); $kenn = @{}
      foreach ($z in $zeilen) {
        $kk = [string]$z.kennung + "|" + [string]$z.hoco_nr
        if ($kenn.ContainsKey($kk)) { $weg += $z } else { $kenn[$kk] = $true; $bleibt += $z }
      }
      if ($weg.Count -eq 0) { continue }
      try {
        for ($i = 0; $i -lt $weg.Count; $i += 100) {
          $teil = @($weg[$i..([Math]::Min($i + 99, $weg.Count - 1))])
          Aendern "Delete" ("pruefbericht_dateien?id=in.(" + (($teil | ForEach-Object { $_.id }) -join ",") + ")") $null $null
          AusAblageWeg @($teil | ForEach-Object { [string]$_.ablage })
        }
        $status.doppelt += $weg.Count
        $inApp[$k] = $bleibt
      } catch { Schreibe ("Doppelte nicht entfernt: " + $k + ": " + $_.Exception.Message) }
    }
  }

  # HOCO Nummern mit Prüfprotokoll in der App (seit 1.799.0, Wunsch Patrick
  # 24. November 2026: „sobald eine neuere dazu kommt, soll das Original weg“):
  # dort gilt nur noch die App, das Excel aus dem Ordner kommt aus der App weg
  # und wird nie mehr hochgeladen. Der Ordner selbst wird nie angefasst.
  $mitApp = @{}
  foreach ($r in (Lesen "pruefprotokolle?select=hoco_nr")) {
    if ($r.hoco_nr) { $mitApp[[string]$r.hoco_nr] = $true }
  }

  # HOCO Nummern, die es im Tool gibt
  $bekannt = @{}
  foreach ($r in (LesenAlle "hoco_parts?select=hoco_nr&order=hoco_nr")) { if ($r.hoco_nr) { $bekannt[[string]$r.hoco_nr] = $true } }

  $gesehen = @{}
  $erreichbar = @()
  $nochFrei = $hoechstensJeLauf
  $leseFrei = 300      # so viele Excel je Durchlauf öffnen, um den Index zu lesen
  $eintraege = @()
  $gruppen = @{}       # "HOCO|Index" → Dateien
  $offen = @{}         # HOCO Nr., bei denen noch nicht alle Indexe gelesen sind
  foreach ($o in @($konf.ordner)) {
    if (-not $o.pfad) { continue }
    $pfad = PfadAufloesen ([string]$o.pfad)
    $info = @{ pfad = $pfad; excel = 0; fehler = $null }
    $status.ordner += $info
    if (-not (Test-Path -LiteralPath $pfad)) {
      $info.fehler = "Ordner nicht erreichbar"
      if ($pfad -match '^[D-Zd-z]:') { $info.fehler += ". Besser \\Server\Freigabe\... eintragen" }
      Schreibe ("Ordner nicht erreichbar: " + $pfad)
      continue
    }
    $erreichbar += $pfad.TrimEnd('\').ToLower() + '\'
    $unter = $true
    if ($o.PSObject.Properties.Name -contains "unter") { $unter = [bool]$o.unter }
    $alle = @(Get-ChildItem -LiteralPath $pfad -File -Filter "*.xls*" -Recurse:$unter -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -match '^\.(xlsx|xlsm|xls)$' -and $_.Name -notlike '~$*' })
    $info.excel = $alle.Count
    $status.excel += $alle.Count

    foreach ($d in $alle) {
      $gesehen[$d.FullName] = $true
      $kand = @(HocoKandidaten $d $pfad)
      $vorher = @()
      if ($inApp.ContainsKey($d.FullName)) { $vorher = @($inApp[$d.FullName]) }
      if ($kand.Count -eq 0) {
        # Ohne Teil-Nr. (Vorlagen, Infos): früher Hochgeladenes wieder weg
        $status.ohneNr++
        if ($vorher.Count -gt 0 -and $status.scharf) { ZeilenWeg $vorher; $status.entfernt++ }
        continue
      }
      # Nur HOCO Nummern, die es im Tool gibt (Wunsch Patrick 25. November 2026)
      $h = $null
      foreach ($k in $kand) { if ($bekannt.ContainsKey($k)) { $h = $k; break } }
      if (-not $h) {
        $status.unbekannt++
        if ($vorher.Count -gt 0 -and $status.scharf) { ZeilenWeg $vorher; $status.entfernt++ }
        continue
      }
      if ($mitApp.ContainsKey($h)) {
        if ($vorher.Count -gt 0 -and $status.scharf) {
          ZeilenWeg $vorher; $status.abgeloest++
          Schreibe ("Original abgelöst (Protokoll in der App): " + $d.FullName)
        }
        continue
      }
      $kennung = Kennung $d
      # Index: gemerkt, sonst aus der schon hochgeladenen Zeile, sonst aus dem Excel
      $idx = $null
      if ($stand.index.ContainsKey($kennung)) { $idx = $stand.index[$kennung] }
      if ($null -eq $idx) {
        $z = @($vorher | Where-Object { [string]$_.kennung -eq $kennung -and $null -ne $_.index_nr })
        if ($z.Count -gt 0) { $idx = [string]$z[0].index_nr; $stand.index[$kennung] = $idx }
      }
      if ($null -eq $idx) {
        if ($d.Extension -notmatch '(?i)^\.xls[xm]$') { $idx = "" }
        elseif ($leseFrei -gt 0) {
          $leseFrei--
          $kopie = $null
          try { $kopie = LesendKopieren $d; $idx = IndexAusExcel $kopie.FullName }
          catch { Schreibe ("Index nicht gelesen: " + $d.FullName + ": " + $_.Exception.Message); $idx = "" }
          finally { if ($kopie) { Remove-Item -LiteralPath (Split-Path -Parent $kopie.FullName) -Recurse -Force -ErrorAction SilentlyContinue } }
          $stand.index[$kennung] = $idx
        } else { $offen[$h] = $true; $status.rest++; continue }
      }
      $eintraege += @{ d = $d; h = $h; idx = (IndexNorm $idx); kennung = $kennung; vorher = $vorher;
        grund = (Grundname $d.Name); seite = (SeiteAusName $d.Name); xlsx = ($d.Extension -match '(?i)^\.xls[xm]$') }
    }
  }

  # Seiten ohne eigenen Index (Seite 2, alte .xls neben der .xlsx) bekommen
  # den Index der anderen Seite desselben Berichts
  $idxJeBericht = @{}
  foreach ($e in $eintraege) { if ($e.idx) { $idxJeBericht[$e.h + "|" + $e.grund] = $e.idx } }
  foreach ($e in $eintraege) {
    if (-not $e.idx -and $idxJeBericht.ContainsKey($e.h + "|" + $e.grund)) { $e.idx = $idxJeBericht[$e.h + "|" + $e.grund] }
    $sch = $e.h + "|" + $e.idx
    if (-not $gruppen.ContainsKey($sch)) { $gruppen[$sch] = @() }
    $gruppen[$sch] += $e
  }

  # Je HOCO Nr. und Index nur ein Bericht, der neuste gilt als Vorlage
  # (Wunsch Patrick 25. November 2026: „je Index ein Bericht, weil die nicht ganz identisch sind“)
  foreach ($sch in @($gruppen.Keys)) {
    $liste = @($gruppen[$sch])
    if ($offen.ContainsKey($liste[0].h)) { continue }
    $liste = @($liste | Sort-Object { $_.d.LastWriteTimeUtc } -Descending)
    # Alle Seiten des neusten Berichts, je Seite eine Datei (.xlsx vor .xls, sonst die neuste)
    $grund = $liste[0].grund
    $jeSeite = @{}
    foreach ($e in @($liste | Where-Object { $_.grund -eq $grund } | Sort-Object { -not $_.xlsx }, { -$_.d.LastWriteTimeUtc.Ticks })) {
      if (-not $jeSeite.ContainsKey($e.seite)) { $jeSeite[$e.seite] = $e }
    }
    $nehmen = @($jeSeite.Values)
    foreach ($e in $liste) {
      if ($nehmen -contains $e) { continue }
      $status.aelter++
      if ($e.vorher.Count -gt 0 -and $status.scharf) { ZeilenWeg $e.vorher }
    }
    foreach ($e in $nehmen) {
    $d = $e.d; $h = $e.h; $kennung = $e.kennung; $vorher = @($e.vorher)
    $gleich = @($vorher | Where-Object { [string]$_.kennung -eq $kennung })
    if ($gleich.Count -gt 0) {
      $falsch = @($gleich | Where-Object { [string]$_.hoco_nr -ne $h -or [string]$_.index_nr -ne $e.idx -or $null -eq $_.index_nr })
      if ($falsch.Count -gt 0 -and $status.scharf) {
        try {
          Aendern "Patch" ("pruefbericht_dateien?id=in.(" + (($falsch | ForEach-Object { $_.id }) -join ",") + ")") @{ hoco_nr = $h; index_nr = $e.idx } $null
          $status.umgestellt++
        } catch { Schreibe ("Fehler beim Zuordnen von " + $d.FullName + ": " + $_.Exception.Message) }
      }
      continue
    }
    if (-not $status.scharf) { Schreibe ("Probe: " + $d.FullName + "  →  " + $h + " Index " + $e.idx); continue }
    if ($nochFrei -le 0) { $status.rest++; continue }
    $kopie = $null
    try {
      $kopie = LesendKopieren $d
      $endung = $d.Extension.TrimStart(".").ToLower()
      $mime = @{ xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                 xlsm = "application/vnd.ms-excel.sheet.macroEnabled.12"; xls = "application/vnd.ms-excel" }[$endung]
      $ablage = "pruefberichte/" + $h + "/" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + "-" +
                [Guid]::NewGuid().ToString("N").Substring(0, 6) + "." + $endung
      $hd = Kopf; $hd["x-upsert"] = "true"
      Invoke-RestMethod -Method Post -Uri "$U/storage/v1/object/zeichnungen/$ablage" -Headers $hd `
        -ContentType $mime -InFile $kopie.FullName | Out-Null
      $adresse = "$U/storage/v1/object/public/zeichnungen/$ablage"
      Aendern "Post" "pruefbericht_dateien" @{ hoco_nr = $h; index_nr = $e.idx; name = $d.Name; pfad = $d.FullName; url = $adresse;
        ablage = $ablage; kennung = $kennung; quelle = "ordner"; geaendert = $d.LastWriteTimeUtc.ToString("o") } $null
      # Die frühere Fassung derselben Datei kommt erst jetzt weg
      if ($vorher.Count -gt 0) { ZeilenWeg $vorher }
      $status.hochgeladen++
      $nochFrei--
      Schreibe ($d.FullName + "  →  " + $h + " Index " + $e.idx)
    } catch {
      Schreibe ("Fehler bei " + $d.FullName + ": " + $_.Exception.Message)
      $status.fehler = "Fehler bei " + $d.Name + ": " + $_.Exception.Message
    } finally {
      if ($kopie) { Remove-Item -LiteralPath (Split-Path -Parent $kopie.FullName) -Recurse -Force -ErrorAction SilentlyContinue }
    }
    }
  }

  # Verschwundene Dateien, nur aus erreichbaren Ordnern
  if ($status.scharf) {
    foreach ($k in @($inApp.Keys)) {
      if ($gesehen.ContainsKey($k)) { continue }
      $kl = $k.ToLower()
      if (@($erreichbar | Where-Object { $kl.StartsWith($_) }).Count -eq 0) { continue }
      try {
        Aendern "Delete" ("pruefbericht_dateien?id=in.(" + (($inApp[$k] | ForEach-Object { $_.id }) -join ",") + ")") $null $null
        AusAblageWeg @($inApp[$k] | ForEach-Object { [string]$_.ablage })
        $status.entfernt++
        Schreibe ("nicht mehr im Ordner, aus der App genommen: " + $k)
      } catch { Schreibe ("Nicht entfernt: " + $k + ": " + $_.Exception.Message) }
    }
  }
  $status.anzahl = @(LesenAlle "pruefbericht_dateien?select=id&quelle=eq.ordner&order=id").Count
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

if ($status.hochgeladen -gt 0) { $stand.zuletzt = @{ zeit = $jetztIso; anzahl = $status.hochgeladen } }
if ($stand.zuletzt) { $status.zuletzt = $stand.zuletzt }
try {
  Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "pruefbericht_status";
    wert = ($status | ConvertTo-Json -Compress -Depth 4) } "resolution=merge-duplicates"
} catch { Schreibe ("Stand nicht an die App gemeldet: " + $_.Exception.Message) }
StandSichern

if ($Probe) {
  Write-Host ""
  Write-Host ("Probelauf: " + $status.excel + " Excel-Dateien gefunden, " + $status.ohneNr + " ohne HOCO Nr. Nichts hochgeladen.")
  foreach ($o in $status.ordner) { Write-Host ("  " + $o.pfad + ": " + $o.excel + $(if ($o.fehler) { " — " + $o.fehler } else { "" })) }
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
