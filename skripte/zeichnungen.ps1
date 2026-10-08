# =================================================================
#  ZEICHNUNGEN — PDFs aus dem Zeichnungs-Ordner in die App
#
#  Läuft über die Windows-Aufgabenplanung alle fünf Minuten, tut aber
#  nur etwas, wenn in der App jemand auf "Probelauf" oder "Zeichnungen
#  hochladen" gedrückt hat (Wunsch Patrick 8. Oktober 2026: das braucht
#  es nur ein paar Mal im Jahr). Sonst liest es einen einzigen Eintrag
#  und meldet nur, dass es noch läuft. Welcher Ordner es ist, steht in
#  der App unter Einstellungen → Dokumente → Zeichnungs-Ordner.
#
#  App und Programm reden über app_config:
#     zng_ordner        Ordner, Unterordner ja/nein (Admin)
#     zng_auftrag       der Knopfdruck: id, art (probe/hochladen), von
#     dok_pfad_status   was das Programm meldet (Dienstkonto)
#
#  Im Ordner liegen viele PDFs und anderes. Das Programm nimmt nur PDFs
#  mit einer HOCO Nr. im Namen und dazu "hofer" oder "kunde":
#
#     10844-0049 Hofer.pdf           → Zeichnung der HOCO Nr. 10844-0049
#     10844-0049 Kundenzeichnung.pdf   (nur wenn es keine "hofer" gibt)
#     10844-0049 Rohteil.pdf         → bleibt weg
#
#  Je HOCO Nr. zählt eine PDF mit "hofer", sonst eine mit "kunde"; gibt
#  es mehrere, die zuletzt geänderte. Gibt es keine, bleibt die Nummer
#  weg (Wunsch 5. Oktober 2026). Hochgeladen wird nur für HOCO Nr., die
#  die App schon kennt (bei den HOCO Nummern oder als Auftrag), sonst
#  käme der ganze Ordner mit Jahren alter Teile in die Ablage. Eine
#  Datei wird nur hochgeladen, wenn sie neu ist oder sich geändert hat.
#
#  DAS PROGRAMM LIEST NUR. Im Ordner wird nie etwas gelöscht,
#  verschoben, umbenannt oder geändert. Zum Hochladen kopiert es die
#  Datei zuerst nach %TEMP% und lädt die Kopie hoch.
#
#  Der Knopf "Probelauf" zeigt in der App nur, was hochgeladen würde.
#  Höchstens 100 Dateien je Durchlauf; sind es mehr, bleibt der Auftrag
#  offen und der nächste Durchlauf macht weiter.
#
#  Aufruf:
#     .\zeichnungen.ps1            normaler Durchlauf (wartet auf den Knopf)
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
$stand = @{ token = $null; ablauf = 0; auffrischen = $null; dateien = @{}; erledigt = $null; letzter = $null }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
    $stand.erledigt = $g.erledigt; $stand.letzter = $g.letzter
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
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

#   1 = "hofer" im Namen, 2 = "kunde" im Namen, 0 = keins von beiden
function Rang([string]$name) {
  $n = $name.ToLower()
  if ($n.Contains("hofer")) { return 1 }
  if ($n.Contains("kunde")) { return 2 }
  return 0
}

# ---------- Durchlauf ----------
# zng = true unterscheidet diesen Stand vom früheren Netzlaufwerk-Programm,
# das denselben Eintrag dok_pfad_status benutzte
# knopf = true sagt der App, dass dieses Programm auf den Knopf wartet
$jetztIso = (Get-Date).ToUniversalTime().ToString("o")
$status = @{ zng = $true; knopf = $true; zeit = $jetztIso; gesehen = $jetztIso; rechner = $env:COMPUTERNAME;
             scharf = $false; pfad = ""; pdf = 0; nummern = 0; ohneWahl = 0; unbekannt = 0; rest = 0;
             neu = 0; ersetzt = 0; gleich = 0; hochgeladen = 0; mb = 0; fehler = $null; auftrag = $null; liste = @() }
function Eintrag([string]$datei, [string]$hoco, [string]$was) {
  if ($status.liste.Count -lt $listeHoechstens) { $status.liste += @{ d = $datei; h = $hoco; w = $was } }
}

function Melden($wert) {
  try {
    Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "dok_pfad_status";
      wert = ($wert | ConvertTo-Json -Compress -Depth 4) } "resolution=merge-duplicates"
  } catch { Schreibe ("Stand nicht an die App gemeldet: " + $_.Exception.Message) }
}

$a = $null
try {
  Anmelden

  $werte = @{}
  Lesen "app_config?select=schluessel,wert&schluessel=in.(zng_ordner,zng_auftrag)" |
    ForEach-Object { if ($_.wert) { try { $werte[$_.schluessel] = $_.wert | ConvertFrom-Json } catch { } } }
  $konf = $werte["zng_ordner"]
  $a = $werte["zng_auftrag"]
  # Ein Knopfdruck gilt zwei Tage, danach nicht mehr
  $offen = $a -and $a.id -and [string]$a.id -ne [string]$stand.erledigt -and
    ((Get-Date).ToUniversalTime() - ([datetime]$a.zeit).ToUniversalTime()).TotalDays -lt 2
  if (-not $offen -and -not $Probe) {
    # Nichts zu tun: den letzten Bericht wieder melden, nur mit neuer
    # Zeit "gesehen", damit die App sieht, dass die Aufgabe läuft
    $letzter = $null
    if ($stand.letzter) { try { $letzter = $stand.letzter | ConvertFrom-Json } catch { } }
    if (-not $letzter) { $letzter = [pscustomobject]@{ zng = $true; knopf = $true; rechner = $env:COMPUTERNAME } }
    $letzter | Add-Member -NotePropertyName gesehen -NotePropertyValue $jetztIso -Force
    $letzter | Add-Member -NotePropertyName rechner -NotePropertyValue $env:COMPUTERNAME -Force
    Melden $letzter
    exit 0
  }
  # Ein Probelauf von Hand verbraucht keinen Knopfdruck aus der App
  if (-not $offen -or $Probe) { $a = $null }
  if ($a) {
    $status.auftrag = @{ id = [string]$a.id; art = [string]$a.art; von = [string]$a.von }
    Schreibe ("Auftrag aus der App: " + $a.art + " von " + $a.von)
  }
  if (-not $konf -or -not ([string]$konf.pfad).Trim()) {
    throw "In der App ist noch kein Zeichnungs-Ordner eingetragen (Einstellungen → Dokumente)."
  }
  $scharf = $a -and $a.art -eq "hochladen" -and -not $Probe
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

  # Welche HOCO Nr. kennt die App, und welche hat schon eine Zeichnung?
  $bekannt = @{}; $mitZeichnung = @{}; $stamm = @{}
  foreach ($t in (LesenAlle "hoco_parts?select=hoco_nr,zeichnung_url&order=hoco_nr")) {
    $bekannt[[string]$t.hoco_nr] = $true; $stamm[[string]$t.hoco_nr] = $true
    if ($t.zeichnung_url) { $mitZeichnung[[string]$t.hoco_nr] = $true }
  }
  foreach ($j in (LesenAlle "jobs?select=job_number&order=id")) { if ($j.job_number) { $bekannt[[string]$j.job_number] = $true } }

  $alle = @(Get-ChildItem -LiteralPath $pfad -File -Filter "*.pdf" -Recurse:([bool]$konf.unter) -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -eq '.pdf' })
  $status.pdf = $alle.Count

  # Je HOCO Nr. die PDFs mit "hofer" oder "kunde"
  $jeNr = @{}; $ohne = @{}
  foreach ($d in $alle) {
    $h = HocoAusName $d.Name
    if (-not $h) { continue }
    $r = Rang $d.Name
    if ($r -eq 0) { $ohne[$h] = $true; continue }
    $d | Add-Member -NotePropertyName HoferRang -NotePropertyValue $r -Force
    if (-not $jeNr[$h]) { $jeNr[$h] = @() }
    $jeNr[$h] += $d
  }
  $status.nummern = $jeNr.Count
  $status.ohneWahl = @($ohne.Keys | Where-Object { -not $jeNr[$_] }).Count

  $nochFrei = $hoechstensJeLauf
  $bytes = [double]0
  foreach ($h in ($jeNr.Keys | Sort-Object)) {
    $gruppe = @($jeNr[$h] | Sort-Object @{ Expression = { $_.HoferRang } }, @{ Expression = { $_.LastWriteTimeUtc }; Descending = $true })
    $d = $gruppe[0]
    if (-not $bekannt[$h]) { $status.unbekannt++; continue }
    $kennung = Kennung $d
    if ($stand.dateien[$h] -eq $kennung) { $status.gleich++; continue }

    $ersetzt = [bool]$mitZeichnung[$h]
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
      Hochladen $kopie $z "zng"
      $stand.dateien[$h] = $kennung
      StandSichern
      $mitZeichnung[$h] = $true
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

# Erledigt ist der Knopfdruck erst, wenn nichts mehr auf den nächsten
# Durchlauf wartet. Nach einem Abbruch (Ordner weg) auch, sonst käme
# derselbe Fehler zwei Tage lang alle fünf Minuten.
if ($a -and (($status.rest -eq 0) -or ($status.fehler -and $status.hochgeladen -eq 0))) { $stand.erledigt = [string]$a.id }
Melden $status
$stand.letzter = ($status | ConvertTo-Json -Compress -Depth 4)
StandSichern

if ($Probe -or -not $status.scharf) {
  Write-Host ""
  Write-Host ("Probelauf: " + $status.pdf + " PDFs gefunden, " + $status.nummern + " HOCO Nr. mit 'hofer' oder 'kunde', " +
    ($status.neu + $status.ersetzt) + " würden hochgeladen (" + $status.neu + " neu, " + $status.ersetzt +
    " ersetzen eine vorhandene, zusammen " + $status.mb + " MB), " + $status.unbekannt + " HOCO Nr. kennt die App nicht, " +
    $status.ohneWahl + " HOCO Nr. ohne 'hofer' oder 'kunde'. Nichts hochgeladen, im Ordner nichts verändert.")
  if ($status.fehler) { Write-Host ("Fehler: " + $status.fehler) }
}
