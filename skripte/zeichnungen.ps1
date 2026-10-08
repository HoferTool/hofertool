# =================================================================
#  ZEICHNUNGEN — PDFs aus dem Zeichnungs-Ordner in die App
#
#  Läuft alle fünf Minuten in der Aufgabe "HoferTool" (hofertool.ps1),
#  ohne Knopf in der App (Wunsch Patrick 8. Oktober 2026). Unveränderte
#  Dateien erkennt es an Name, Grösse und Änderungszeit und lässt sie in
#  Ruhe. Welcher Ordner es ist, steht in der App unter Einstellungen →
#  Dokumente → Zeichnungs-Ordner.
#
#  App und Programm reden über app_config:
#     zng_ordner        Ordner, Unterordner ja/nein (Admin)
#     dok_pfad_status   was das Programm meldet (Dienstkonto)
#
#  Im Ordner liegen viele PDFs und anderes, und die Zeichnungen heissen
#  "einfach irgendwie" (Patrick, 8. Oktober 2026), meist nach der
#  Zeichnungsnummer des Kunden, etwa "416.4630.02_Kunde.pdf". Die HOCO
#  Nr. steht im Dateinamen oder im Namen eines Ordners darüber: zuerst
#  der Dateiname, dann die Ordner von innen nach aussen bis zum
#  Zeichnungs-Ordner selbst.
#
#     10844-0049 Hofer.pdf                        → HOCO Nr. 10844-0049
#     ...\10844-0049 Deckel\416.4630.02_Kunde.pdf  → HOCO Nr. 10844-0049
#
#  Regel seit 111.114.0 (Wunsch Patrick, 8. Oktober 2026: "es soll mal
#  eine Zeichnung hochladen; wenn es nicht passt, lösche ich sie, und du
#  lädst das nächste Mal ein anderes Dokument hoch; gibt es keine mehr,
#  lässt du es sein; eine manuell per HoferTool hochgeladene ist Master"):
#
#   - Je HOCO Nr., die die App kennt (HOCO Nummern oder Auftrag), kommt
#     EINE PDF hoch: zuerst eine mit "hofer" im Namen, dann "kunde", dann
#     irgendeine; bei mehreren die zuletzt geänderte.
#   - Nimmt jemand die Zeichnung in der App weg ("Zeichnung entfernen" im
#     Betrachter), kommt beim nächsten Durchlauf die nächste Datei. Die
#     weggenommene steht in zeichnungen-stand.json unter "abgelehnt" und
#     kommt nie wieder. Gibt es keine andere mehr, bleibt die Nummer ohne.
#   - Eine Zeichnung, die nicht von diesem Programm stammt (von Hand in
#     der App hochgeladen oder gewählt), ist Master: Sie wird nie ersetzt.
#     Woran man das erkennt: Die Adresse in hoco_parts.zeichnung_url ist
#     nicht die, die das Programm selbst hochgeladen hat ("adressen").
#   - Die eigene Zeichnung wird nur ersetzt, wenn sich die Datei im
#     Ordner geändert hat (Kennung aus Name, Grösse und Änderungszeit).
#
#  Damit man sieht, wie die Dateien wirklich heissen, meldet das Programm
#  der App dazu einige Beispiele von PDFs ohne HOCO Nr. und die Namen der
#  Unterordner (dok_pfad_status: beispiele, ordner).
#
#  DAS PROGRAMM LIEST NUR. Im Ordner wird nie etwas gelöscht,
#  verschoben, umbenannt oder geändert. Zum Hochladen kopiert es die
#  Datei zuerst nach %TEMP% und lädt die Kopie hoch.
#
#  Höchstens 100 Dateien je Durchlauf; sind es mehr, macht der nächste
#  Durchlauf weiter.
#
#  Aufruf:
#     .\zeichnungen.ps1            normaler Durchlauf
#     .\zeichnungen.ps1 -Probe     sofort ein Probelauf, nie hochladen
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "zeichnungen-stand.json"
$protDatei  = Join-Path $ordnerHier "zeichnungen.log"
$hoechstensJeLauf = 100
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

# Anmeldung und welche Datei je HOCO Nr. zuletzt hochgeladen wurde
# dateien: je HOCO Nr. die Kennung der hochgeladenen Datei, adressen: die
# Adresse davon in der App, abgelehnt: je HOCO Nr. die Dateien, die in
# der App wieder weggenommen wurden (volle Pfade)
$stand = @{ token = $null; ablauf = 0; auffrischen = $null; dateien = @{}; adressen = @{}; abgelehnt = @{}; erledigt = $null; letzter = $null }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
    $stand.erledigt = $g.erledigt; $stand.letzter = $g.letzter
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
    if ($g.adressen) { $g.adressen.PSObject.Properties | ForEach-Object { $stand.adressen[$_.Name] = [string]$_.Value } }
    if ($g.abgelehnt) { $g.abgelehnt.PSObject.Properties | ForEach-Object { $stand.abgelehnt[$_.Name] = @($_.Value | ForEach-Object { [string]$_ }) } }
  } catch { }
}
# Was dokumente-abruf.ps1 (111.98.0, Abruf beim Öffnen) hochgeladen hat,
# übernehmen, damit nichts ein zweites Mal kommt; danach ist die Datei weg
$abrufDatei = Join-Path $ordnerHier "abruf-stand.json"
if (Test-Path $abrufDatei) {
  try {
    $g = Get-Content -Raw -Path $abrufDatei -Encoding UTF8 | ConvertFrom-Json
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
  if (Test-Path $abrufDatei) { Remove-Item -LiteralPath $abrufDatei -Force -ErrorAction SilentlyContinue }
}

. (Join-Path $ordnerHier "dokumente-teile.ps1")

# Die Datenbank gibt höchstens 1000 Zeilen auf einmal heraus
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

#   1 = "hofer" im Namen, 2 = "kunde" im Namen, 3 = keins von beiden
#   (seit 111.114.0 zählen auch die: "viele Zeichnungen heissen einfach irgendwie")
function Rang([string]$name) {
  $n = $name.ToLower()
  if ($n.Contains("hofer")) { return 1 }
  if ($n.Contains("kunde")) { return 2 }
  return 3
}

# HOCO Nr. in einem Ordnernamen, ohne dass etwas als Endung abgeschnitten
# wird ("10844-0049 v1.2" hat keine Endung)
function HocoAusText([string]$text) {
  $m = [regex]::Match([string]$text, '(?<!\d)(\d{4,6})\s?-\s?(\d{3,5})(?!\d)')
  if ($m.Success) { return $m.Groups[1].Value + "-" + $m.Groups[2].Value }
  return $null
}

# Die HOCO Nr. der Datei: zuerst im Dateinamen, sonst in den Ordnern von
# innen nach aussen, bis zum Zeichnungs-Ordner (der zählt nicht mit).
# Liefert die Nummer und woher sie kommt ("name" oder "ordner").
function HocoAusPfad($d, [string]$wurzel) {
  $h = HocoAusName $d.Name
  if ($h) { return @{ nr = $h; woher = "name" } }
  $w = $wurzel.TrimEnd('\').ToLower()
  $o = $d.Directory
  while ($o -and $o.FullName.TrimEnd('\').Length -gt $w.Length -and $o.FullName.TrimEnd('\').ToLower() -ne $w) {
    $h = HocoAusText $o.Name
    if ($h) { return @{ nr = $h; woher = "ordner" } }
    $o = $o.Parent
  }
  return $null
}

# Pfad ohne den Zeichnungs-Ordner davor, für die Beispiele in der App
function Relativ([string]$voll, [string]$wurzel) {
  $w = $wurzel.TrimEnd('\')
  if ($voll.Length -gt $w.Length -and $voll.Substring(0, $w.Length).ToLower() -eq $w.ToLower()) { return $voll.Substring($w.Length).TrimStart('\') }
  return $voll
}

# ---------- Durchlauf ----------
# zng = true unterscheidet diesen Stand vom früheren Netzlaufwerk-Programm,
# das denselben Eintrag dok_pfad_status benutzte
# immer = true sagt der App, dass diese Fassung ohne Knopf läuft
$jetztIso = (Get-Date).ToUniversalTime().ToString("o")
$status = @{ zng = $true; immer = $true; zeit = $jetztIso; gesehen = $jetztIso; rechner = $env:COMPUTERNAME;
             scharf = $false; pfad = ""; pdf = 0; nummern = 0; unbekannt = 0; rest = 0;
             neu = 0; ersetzt = 0; gleich = 0; hochgeladen = 0; mb = 0; fehler = $null; liste = @();
             ohneNr = 0; imOrdner = 0; beispiele = @(); ordner = @(); manuell = 0; abgelehnt = 0; keineMehr = 0 }
function Eintrag([string]$datei, [string]$hoco, [string]$was) {
  if ($status.liste.Count -lt $listeHoechstens) { $status.liste += @{ d = $datei; h = $hoco; w = $was } }
}

function Melden($wert) {
  try {
    Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "dok_pfad_status";
      wert = ($wert | ConvertTo-Json -Compress -Depth 4) } "resolution=merge-duplicates"
  } catch { Schreibe ("Stand nicht an die App gemeldet: " + $_.Exception.Message) }
}

try {
  Anmelden

  $werte = @{}
  Lesen "app_config?select=schluessel,wert&schluessel=in.(zng_ordner)" |
    ForEach-Object { if ($_.wert) { try { $werte[$_.schluessel] = $_.wert | ConvertFrom-Json } catch { } } }
  $konf = $werte["zng_ordner"]
  if (-not $konf -or -not ([string]$konf.pfad).Trim()) {
    throw "In der App ist noch kein Zeichnungs-Ordner eingetragen (Einstellungen → Dokumente)."
  }
  $scharf = -not $Probe
  $status.scharf = $scharf
  if (-not $scharf) { Schreibe "Probelauf: es wird nichts hochgeladen." }

  $pfad = PfadAufloesen ([string]$konf.pfad)
  $status.pfad = $pfad
  if (-not (Test-Path -LiteralPath $pfad)) {
    $f = "Ordner nicht erreichbar: " + $pfad
    if ($pfad -match '^[D-Zd-z]:') {
      $f += ". Das Laufwerk " + $pfad.Substring(0, 2) + " kennt die Aufgabe nicht, besser \\Server\Freigabe\... eintragen"
    }
    throw $f
  }

  # Welche HOCO Nr. kennt die App, und welche Zeichnung hat sie jetzt?
  $bekannt = @{}; $adresseVon = @{}; $stamm = @{}
  foreach ($t in (LesenAlle "hoco_parts?select=hoco_nr,zeichnung_url&order=hoco_nr")) {
    $bekannt[[string]$t.hoco_nr] = $true; $stamm[[string]$t.hoco_nr] = $true
    if ($t.zeichnung_url) { $adresseVon[[string]$t.hoco_nr] = [string]$t.zeichnung_url }
  }
  foreach ($j in (LesenAlle "jobs?select=job_number&order=id")) { if ($j.job_number) { $bekannt[[string]$j.job_number] = $true } }

  $alle = @(Get-ChildItem -LiteralPath $pfad -File -Filter "*.pdf" -Recurse:([bool]$konf.unter) -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -eq '.pdf' })
  $status.pdf = $alle.Count

  # Je HOCO Nr. alle PDFs; die Nummer aus dem Dateinamen oder aus einem
  # Ordner darüber
  $jeNr = @{}; $ohneNr = New-Object Collections.ArrayList
  foreach ($d in $alle) {
    $f = HocoAusPfad $d $pfad
    if (-not $f) { [void]$ohneNr.Add((Relativ $d.FullName $pfad)); continue }
    $h = $f.nr
    if ($f.woher -eq "ordner") { $status.imOrdner++ }
    $d | Add-Member -NotePropertyName HoferRang -NotePropertyValue (Rang $d.Name) -Force
    if (-not $jeNr[$h]) { $jeNr[$h] = @() }
    $jeNr[$h] += $d
  }
  $status.nummern = $jeNr.Count
  # Beispiele gleichmässig über den ganzen Ordner verteilt, und die
  # Unterordner der ersten Ebene, damit man in der Datenbank sieht, wie
  # die Dateien wirklich heissen
  $status.ohneNr = $ohneNr.Count
  if ($ohneNr.Count -gt 0) {
    $schritt = [int][Math]::Max(1, [Math]::Floor($ohneNr.Count / 30))
    for ($i = 0; $i -lt $ohneNr.Count -and $status.beispiele.Count -lt 30; $i += $schritt) { $status.beispiele += [string]$ohneNr[$i] }
  }
  try {
    $status.ordner = @(Get-ChildItem -LiteralPath $pfad -Directory -ErrorAction SilentlyContinue | Select-Object -First 60 | ForEach-Object { $_.Name })
  } catch { }

  $nochFrei = $hoechstensJeLauf
  $bytes = [double]0
  foreach ($h in ($jeNr.Keys | Sort-Object)) {
    if (-not $bekannt[$h]) { $status.unbekannt++; continue }
    $jetzt = [string]$adresseVon[$h]
    $eigene = [string]$stand.adressen[$h]

    # Von Hand hochgeladen oder gewählt: Master, bleibt
    if ($jetzt -and ($jetzt -ne $eigene)) { $status.manuell++; continue }

    # Die eigene Zeichnung ist in der App weggenommen worden: diese Datei
    # kommt nie wieder, die nächste ist dran (dateien ohne adressen: aus
    # einer Fassung vor 111.114.0 hochgeladen, zählt genauso)
    if (-not $jetzt -and ($eigene -or $stand.dateien[$h])) {
      $weg = ([string]$stand.dateien[$h]).Split("|")[0]
      if ($weg) {
        if (-not $stand.abgelehnt[$h]) { $stand.abgelehnt[$h] = @() }
        if ($stand.abgelehnt[$h] -notcontains $weg) { $stand.abgelehnt[$h] += $weg }
      }
      $stand.dateien.Remove($h); $stand.adressen.Remove($h)
      StandSichern
      $status.abgelehnt++
      Schreibe ("Zeichnung von " + $h + " in der App entfernt, nächste Datei: " + $weg)
    }

    $gruppe = @($jeNr[$h] | Where-Object { @($stand.abgelehnt[$h]) -notcontains $_.FullName } |
      Sort-Object @{ Expression = { $_.HoferRang } }, @{ Expression = { $_.LastWriteTimeUtc }; Descending = $true })
    if ($gruppe.Count -eq 0) { $status.keineMehr++; continue }
    $d = $gruppe[0]
    $kennung = Kennung $d
    if ($jetzt -and $stand.dateien[$h] -eq $kennung) { $status.gleich++; continue }

    $ersetzt = [bool]$jetzt
    if ($ersetzt) { $status.ersetzt++ } else { $status.neu++ }
    $was = $(if ($ersetzt) { "ersetzt die Zeichnung in der App" } else { "neu" })
    if (-not $scharf) {
      $bytes += $d.Length
      Eintrag $d.Name $h ("würde hochladen: " + $was)
      Schreibe ("Probe: " + $d.FullName + "  →  " + $h + ", " + $was)
      continue
    }
    if ($nochFrei -le 0) { $status.rest++; Eintrag $d.Name $h "kommt beim nächsten Durchlauf"; continue }

    $kopie = $null
    try {
      $kopie = LesendKopieren $d
      # Ohne Stammeintrag der HOCO Nr. hätte die Zeichnung keinen Platz
      if (-not $stamm[$h]) {
        try { Aendern "Post" "hoco_parts?on_conflict=hoco_nr" @{ hoco_nr = $h } "resolution=ignore-duplicates" } catch { }
        $stamm[$h] = $true
      }
      $z = @{ hoco = $h; typ = $null; art = "zeichnung"; titel = $h; fa = $null; auftrag = $null; grund = ""; passt = $true }
      $script:letzteAdresse = $null
      Hochladen $kopie $z "zng"
      $stand.dateien[$h] = $kennung
      $stand.adressen[$h] = [string]$script:letzteAdresse
      StandSichern
      $adresseVon[$h] = [string]$script:letzteAdresse
      $status.hochgeladen++
      $bytes += $d.Length
      $nochFrei--
      Eintrag $d.Name $h ("hochgeladen, " + $was)
      Schreibe ($d.FullName + "  →  " + $h)
    } catch {
      Eintrag $d.Name $h ("Fehler: " + $_.Exception.Message)
      Schreibe ("Fehler bei " + $d.FullName + ": " + $_.Exception.Message)
      $status.fehler = "Fehler bei " + $d.Name + ": " + $_.Exception.Message
    } finally {
      # Nur die eigene Kopie in %TEMP% wegräumen, nie das Original
      if ($kopie) { Remove-Item -LiteralPath (Split-Path -Parent $kopie.FullName) -Recurse -Force -ErrorAction SilentlyContinue }
    }
  }
  $status.mb = [Math]::Round($bytes / 1MB, 1)
} catch {
  $status.fehler = $_.Exception.Message
  Schreibe ("Abbruch: " + $_.Exception.Message)
}

# Wann zuletzt etwas hochkam, bleibt stehen, auch wenn die nächsten
# Durchläufe nichts Neues finden
if ($status.hochgeladen -gt 0) { $status.zuletzt = @{ zeit = $jetztIso; anzahl = $status.hochgeladen } }
elseif ($stand.letzter) { try { $l = $stand.letzter | ConvertFrom-Json; if ($l.zuletzt) { $status.zuletzt = $l.zuletzt } } catch { } }
Melden $status
$stand.letzter = ($status | ConvertTo-Json -Compress -Depth 4)
StandSichern

if ($Probe -or -not $status.scharf) {
  Write-Host ""
  Write-Host ("Probelauf: " + $status.pdf + " PDFs gefunden, " + $status.nummern + " HOCO Nr. mit PDF, " +
    ($status.neu + $status.ersetzt) + " würden hochgeladen (" + $status.neu + " neu, " + $status.ersetzt +
    " ersetzen eine eigene, zusammen " + $status.mb + " MB), " + $status.unbekannt + " HOCO Nr. kennt die App nicht, " +
    $status.manuell + " mit Zeichnung von Hand (Master), " + $status.keineMehr + " ohne weitere Datei, " +
    $status.ohneNr + " PDFs ohne HOCO Nr. in Name oder Ordner (" +
    $status.imOrdner + " mit HOCO Nr. aus dem Ordnernamen). Nichts hochgeladen, im Ordner nichts verändert.")
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
