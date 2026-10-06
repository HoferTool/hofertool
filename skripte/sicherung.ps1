# =================================================================
#  SICHERUNG — alle Daten der App in einen Ordner, und zurück
#
#  Läuft über die Windows-Aufgabenplanung alle fünf Minuten (Aufgabe
#  "Hofer Sicherung", von einrichten.ps1 angelegt). Meistens schaut es
#  nur kurz nach und endet. Es sichert:
#    - einmal am Tag, sobald der Rechner nach der eingestellten Uhrzeit
#      läuft (ist er an dem Tag aus, holt es das beim nächsten Start nach)
#    - sofort, wenn in der App "Jetzt sichern" gedrückt wurde
#  Wohin, wann und wie lange behalten: App → Einstellungen → Backup.
#
#  Eine Sicherung ist eine Datei  Hofer-Sicherung-JJJJ-MM-TT-HHMM.jsonl.gz
#  mit allen Tabellen der App aus einem einzigen Augenblick, dazu der
#  Ordner "Dateien" mit allen hochgeladenen Zeichnungen, WBGs und Bildern
#  (nur Neues wird geholt, darum dauert nur die erste Sicherung länger).
#  Nicht dabei: Passwörter, PINs und der Solar-Schlüssel.
#
#  ZURÜCKSPIELEN: In der App bei einer Sicherung "Zurückspielen" drücken.
#  Beim nächsten Durchlauf sichert das Programm zuerst den heutigen Stand
#  (Datei mit "-vor-Zurueckspielen"), dann ersetzt die Datenbank alles in
#  einem Zug durch den gewählten Stand. Klappt etwas nicht, bleibt alles
#  wie vorher. Fehlende Dateien lädt es aus dem Ordner "Dateien" wieder
#  hoch. Das Dienstkonto darf das nur, wenn ein Admin es angefordert hat.
#
#  Aufruf:
#     .\sicherung.ps1          normaler Durchlauf
#     .\sicherung.ps1 -Probe   nur anmelden und zeigen, was eingestellt ist
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json
#  (Dienstkonto, wie der Pool). Windows PowerShell 5.1, nichts zu
#  installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "sicherung-stand.json"
$protDatei  = Join-Path $ordnerHier "sicherung.log"
$PRAEFIX    = "Hofer-Sicherung-"
$UTF8       = New-Object Text.UTF8Encoding($false)

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

# Anmeldung, letzte Sicherung und erledigte Aufträge überleben den Lauf
$stand = @{ token = $null; ablauf = 0; auffrischen = $null; letzte = $null; versuch = $null;
            erledigt = $null; auftrag = $null }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    foreach ($n in @("token", "auffrischen", "letzte", "versuch", "erledigt", "auftrag")) { $stand[$n] = $g.$n }
    $stand.ablauf = [double]$g.ablauf
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 5 | Set-Content -Path $standDatei -Encoding UTF8
}

. (Join-Path $ordnerHier "dokumente-teile.ps1")

# Antwort als Text, ohne sie einzulesen: Die Sicherung wird so nur
# zerschnitten und weggeschrieben, nicht umgewandelt. Das ist schnell
# und lässt jede Zahl und jedes Datum genau so, wie es war.
function RohPost([string]$pfad, [string]$koerper) {
  $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$U/rest/v1/$pfad" -Headers (Kopf) `
    -ContentType "application/json; charset=utf-8" -Body ($UTF8.GetBytes($koerper)) -TimeoutSec 300
  return $UTF8.GetString($r.RawContentStream.ToArray())
}

# Fehlertext des Servers statt nur "(400) Bad Request"
function FehlerText($fehler) {
  $t = $fehler.Exception.Message
  try {
    if ($fehler.ErrorDetails -and $fehler.ErrorDetails.Message) {
      $j = $fehler.ErrorDetails.Message | ConvertFrom-Json
      if ($j.message) { $t = $j.message }
    }
  } catch { }
  return $t
}

function WegTeile([string]$p) { (($p -split "/") | ForEach-Object { [Uri]::EscapeDataString($_) }) -join "/" }
function Iso([datetime]$d) { $d.ToUniversalTime().ToString("o") }

# ---------- Sichern ----------
function Sichern([string]$ziel, [string]$grund) {
  New-Item -ItemType Directory -Force -Path $ziel | Out-Null
  $dateienOrdner = Join-Path $ziel "Dateien"

  # 1. Alle Tabellen aus einem Augenblick
  $roh = RohPost "rpc/sicherung_lesen" "{}"
  $muster = [regex]'\{\s*"t"\s*:\s*"([a-z0-9_]+)"\s*,\s*"nr"\s*:\s*(\d+)\s*,\s*"zeilen"\s*:\s*'
  $treffer = $muster.Matches($roh)
  if ($treffer.Count -eq 0) { throw "Die Datenbank hat keine Tabellen geliefert (sql/sicherung.sql ausgeführt?)." }
  $tabellen = @(); $zeilen = @(); $summe = 0
  for ($i = 0; $i -lt $treffer.Count; $i++) {
    $m = $treffer[$i]
    $ab = $m.Index + $m.Length
    $bis = if ($i + 1 -lt $treffer.Count) { $treffer[$i + 1].Index } else { $roh.Length }
    $teil = [regex]::Replace($roh.Substring($ab, $bis - $ab), '\}\s*,?\s*\]?\s*$', '').Trim()
    if (-not ($teil.StartsWith("[") -and $teil.EndsWith("]"))) { throw "Antwort der Datenbank unlesbar bei $($m.Groups[1].Value)." }
    $n = [int]$m.Groups[2].Value
    $tabellen += [ordered]@{ t = $m.Groups[1].Value; n = $n }
    $zeilen += ('{"t":"' + $m.Groups[1].Value + '","n":' + $n + ',"zeilen":' + $teil + '}')
    $summe += $n
  }
  $roh = $null

  # 2. Welche Dateien es gibt
  $liste = @(Invoke-RestMethod -Method Post -Uri "$U/rest/v1/rpc/sicherung_dateien" -Headers (Kopf) `
    -ContentType "application/json" -Body "{}" -TimeoutSec 120 | ForEach-Object { $_ } | Where-Object { $_ })

  # 3. Eine Datei, erst unter anderem Namen, damit nie eine halbe in der Liste steht
  $jetzt = Get-Date
  $name = $PRAEFIX + $jetzt.ToString("yyyy-MM-dd-HHmm")
  if ($grund -eq "vorher") { $name += "-vor-Zurueckspielen" }
  $datei = Join-Path $ziel ($name + ".jsonl.gz")
  $nr = 2
  while (Test-Path -LiteralPath $datei) { $datei = Join-Path $ziel ($name + "-" + $nr + ".jsonl.gz"); $nr++ }
  $kopf = [ordered]@{ art = "hofer-sicherung"; version = 1; erstellt = (Iso $jetzt); rechner = $env:COMPUTERNAME;
                      grund = $grund; tabellen = $tabellen; dateien = $liste }
  $halb = $datei + ".teil"
  $strom = [IO.File]::Create($halb)
  try {
    $gz = New-Object IO.Compression.GZipStream($strom, [IO.Compression.CompressionMode]::Compress)
    $aus = New-Object IO.StreamWriter($gz, $UTF8)
    $aus.NewLine = "`n"
    $aus.WriteLine(($kopf | ConvertTo-Json -Compress -Depth 6))
    foreach ($z in $zeilen) { $aus.WriteLine($z) }
    $aus.Close()
  } finally { $strom.Close() }
  Move-Item -LiteralPath $halb -Destination $datei
  $zeilen = $null
  $mb = [math]::Round((Get-Item -LiteralPath $datei).Length / 1MB, 1)
  Schreibe ("Gesichert: " + (Split-Path -Leaf $datei) + " (" + $tabellen.Count + " Tabellen, " + $summe + " Zeilen, " + $mb + " MB)")

  # 4. Hochgeladene Dateien, nur neue oder geänderte
  $neu = 0; $fehlt = 0; $letzterFehler = $null
  foreach ($o in $liste) {
    $lokal = Join-Path (Join-Path $dateienOrdner $o.b) (([string]$o.p) -replace "/", "\")
    try {
      if ((Test-Path -LiteralPath $lokal) -and ((Get-Item -LiteralPath $lokal).Length -eq [long]$o.g)) { continue }
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $lokal) | Out-Null
      Invoke-WebRequest -UseBasicParsing -Headers (Kopf) -OutFile ($lokal + ".teil") -TimeoutSec 300 `
        -Uri ("$U/storage/v1/object/authenticated/" + $o.b + "/" + (WegTeile $o.p))
      Move-Item -LiteralPath ($lokal + ".teil") -Destination $lokal -Force
      $neu++
    } catch { $fehlt++; $letzterFehler = $o.b + "/" + $o.p + ": " + $_.Exception.Message }
  }
  if ($fehlt -gt 0) { Schreibe ("Dateien: " + $fehlt + " nicht gesichert, zuletzt " + $letzterFehler) }
  Schreibe ("Dateien: " + $liste.Count + " vorhanden, " + $neu + " neu gesichert")

  return [ordered]@{ zeit = (Iso $jetzt); datei = (Split-Path -Leaf $datei); mb = $mb; tabellen = $tabellen.Count;
                     zeilen = $summe; dateien = $liste.Count; neu = $neu; fehlt = $fehlt; grund = $grund }
}

# ---------- Zurückspielen ----------
function Zurueckspielen([string]$datei) {
  $strom = [IO.File]::OpenRead($datei)
  $lauf = [Guid]::NewGuid().ToString()
  $kopf = $null; $hochgeladen = 0
  try {
    $gz = New-Object IO.Compression.GZipStream($strom, [IO.Compression.CompressionMode]::Decompress)
    $ein = New-Object IO.StreamReader($gz, $UTF8)
    $kopf = $ein.ReadLine() | ConvertFrom-Json
    if ($kopf.art -ne "hofer-sicherung") { throw "Das ist keine Sicherung des Hofer Tools." }
    $muster = [regex]'^\{"t":"([a-z0-9_]+)","n":(\d+),"zeilen":'
    while ($null -ne ($zeile = $ein.ReadLine())) {
      $m = $muster.Match($zeile)
      if (-not $m.Success) { continue }
      $teil = $zeile.Substring($m.Length, $zeile.Length - $m.Length - 1)
      $null = RohPost "rpc/sicherung_puffern" ('{"p_lauf":"' + $lauf + '","p_tabelle":"' + $m.Groups[1].Value + '","p_zeilen":' + $teil + '}')
      $hochgeladen++
    }
    $ein.Close()
  } finally { $strom.Close() }
  if ($hochgeladen -eq 0) { throw "Die Sicherung enthält keine Tabellen." }

  $tab = ConvertTo-Json -InputObject @($kopf.tabellen | ForEach-Object { [ordered]@{ t = $_.t; n = [int]$_.n } }) -Compress
  $antw = (RohPost "rpc/sicherung_einspielen" ('{"p_lauf":"' + $lauf + '","p_tabellen":' + $tab + '}')) | ConvertFrom-Json
  Schreibe ("Zurückgespielt: " + (Split-Path -Leaf $datei) + " (" + $antw.tabellen + " Tabellen, " + $antw.zeilen + " Zeilen)")

  # Dateien, die es seither nicht mehr gibt, wieder hochladen
  $jetzt = @{}
  Invoke-RestMethod -Method Post -Uri "$U/rest/v1/rpc/sicherung_dateien" -Headers (Kopf) `
    -ContentType "application/json" -Body "{}" -TimeoutSec 120 | ForEach-Object { $_ } | Where-Object { $_ } |
    ForEach-Object { $jetzt[$_.b + "|" + $_.p] = 1 }
  $dateienOrdner = Join-Path (Split-Path -Parent $datei) "Dateien"
  $wieder = 0; $fehlt = 0
  foreach ($o in @($kopf.dateien)) {
    if (-not $o -or $jetzt.ContainsKey($o.b + "|" + $o.p)) { continue }
    $lokal = Join-Path (Join-Path $dateienOrdner $o.b) (([string]$o.p) -replace "/", "\")
    try {
      if (-not (Test-Path -LiteralPath $lokal)) { throw "nicht im Ordner Dateien" }
      $art = [string]$o.a; if (-not $art) { $art = "application/octet-stream" }
      Invoke-RestMethod -Method Post -Uri ("$U/storage/v1/object/" + $o.b + "/" + (WegTeile $o.p)) -Headers (Kopf) `
        -ContentType $art -InFile $lokal -TimeoutSec 300 | Out-Null
      $wieder++
    } catch { $fehlt++ }
  }
  if ($wieder -or $fehlt) { Schreibe ("Dateien wieder hochgeladen: " + $wieder + ($(if ($fehlt) { ", nicht möglich: " + $fehlt } else { "" }))) }
  return [ordered]@{ tabellen = $antw.tabellen; zeilen = $antw.zeilen; ohneKonto = $antw.ohne_konto; dateien = $wieder; dateienFehlt = $fehlt }
}

# ---------- Alte Sicherungen weg ----------
# Älter als eingestellt kommt weg, die neuesten drei bleiben immer. Der
# Ordner "Dateien" bleibt ganz: ältere Sicherungen brauchen ihn auch.
function Aufraeumen([string]$ziel, [int]$tage) {
  $alle = @(Get-ChildItem -LiteralPath $ziel -File -Filter ($PRAEFIX + "*.jsonl.gz") | Sort-Object LastWriteTime -Descending)
  for ($i = 3; $i -lt $alle.Count; $i++) {
    if ($alle[$i].LastWriteTime -lt (Get-Date).AddDays(-$tage)) {
      Remove-Item -LiteralPath $alle[$i].FullName
      Schreibe ("Alt, gelöscht: " + $alle[$i].Name)
    }
  }
}

# ---------- Durchlauf ----------
$status = [ordered]@{ zeit = (Iso (Get-Date)); rechner = $env:COMPUTERNAME; pfad = ""; fehler = $null;
                      letzte = $null; auftrag = $null; liste = @() }
try {
  Anmelden
  $werte = @{}
  Lesen "app_config?select=schluessel,wert&schluessel=in.(sicherung,sicherung_auftrag)" |
    ForEach-Object { if ($_.wert) { try { $werte[$_.schluessel] = $_.wert | ConvertFrom-Json } catch { } } }
  $konf = $werte["sicherung"]
  $pfad = if ($konf) { ([string]$konf.pfad).Trim() } else { "" }
  $stunde = 18; if ($konf -and $null -ne $konf.stunde) { $stunde = [int]$konf.stunde }
  $tage = 30;   if ($konf -and $konf.behalten) { $tage = [int]$konf.behalten }
  $status.pfad = $pfad
  if (-not $pfad) { throw "In der App ist noch kein Speicherort eingetragen (Einstellungen → Backup)." }
  $ziel = PfadAufloesen $pfad
  if ($Probe) { Write-Host "Speicherort: $pfad ($ziel), täglich ab $stunde Uhr, $tage Tage behalten" }

  # Offener Auftrag aus der App?
  $a = $werte["sicherung_auftrag"]
  if ($a -and $a.id -and -not $a.erledigt -and [string]$a.id -ne [string]$stand.erledigt -and -not $Probe) {
    $stand.erledigt = [string]$a.id; StandSichern
    $ergebnis = [ordered]@{ id = [string]$a.id; art = [string]$a.art; ok = $false; zeit = $null; text = "" }
    try {
      if ($a.art -eq "sichern") {
        $stand.letzte = Sichern $ziel "manuell"
        $ergebnis.text = "Gesichert: " + $stand.letzte.datei
      } elseif ($a.art -eq "zurueck") {
        $datei = Join-Path $ziel ([IO.Path]::GetFileName([string]$a.datei))
        if (-not (Test-Path -LiteralPath $datei)) { throw ("Die Sicherung " + $a.datei + " liegt nicht mehr im Ordner.") }
        Schreibe ("Zurückspielen angefordert: " + $a.datei + " von " + $a.von)
        $vorher = Sichern $ziel "vorher"
        $r = Zurueckspielen $datei
        $ergebnis.text = "Zurückgespielt: " + $r.zeilen + " Zeilen in " + $r.tabellen + " Tabellen"
        if ($r.dateien) { $ergebnis.text += ", " + $r.dateien + " Dateien wieder hochgeladen" }
        if ($r.ohneKonto) { $ergebnis.text += ", " + $r.ohneKonto + " Person(en) ohne Anmeldekonto weggelassen" }
        $ergebnis.text += ". Der Stand davor liegt in " + $vorher.datei + "."
      }
      $ergebnis.ok = $true
    } catch {
      $ergebnis.text = FehlerText $_
      Schreibe ("Auftrag " + $a.art + " fehlgeschlagen: " + $ergebnis.text)
    }
    $ergebnis.zeit = Iso (Get-Date)
    $stand.auftrag = $ergebnis
  } elseif (-not $Probe) {
    # Täglich: sobald nach der eingestellten Stunde, oder wenn die letzte
    # über einen Tag her ist. Nach einem Fehler höchstens stündlich neu.
    $jetzt = Get-Date
    $letzte = $null; if ($stand.letzte -and $stand.letzte.zeit) { $letzte = ([datetime]$stand.letzte.zeit).ToLocalTime() }
    $faellig = (-not $letzte) -or (($jetzt - $letzte).TotalHours -ge 24) -or ($letzte.Date -lt $jetzt.Date -and $jetzt.Hour -ge $stunde)
    $versuch = $null; if ($stand.versuch) { $versuch = ([datetime]$stand.versuch).ToLocalTime() }
    if ($faellig -and (-not $versuch -or ($jetzt - $versuch).TotalMinutes -ge 60)) {
      $stand.versuch = Iso $jetzt; StandSichern
      $stand.letzte = Sichern $ziel "taeglich"
      $stand.versuch = $null
    }
  }
  if (Test-Path -LiteralPath $ziel) {
    Aufraeumen $ziel $tage
    $status.liste = @(Get-ChildItem -LiteralPath $ziel -File -Filter ($PRAEFIX + "*.jsonl.gz") |
      Sort-Object LastWriteTime -Descending | Select-Object -First 100 |
      ForEach-Object { [ordered]@{ d = $_.Name; z = (Iso $_.LastWriteTime); mb = [math]::Round($_.Length / 1MB, 1) } })
  } else {
    throw "Den Speicherort $pfad erreiche ich von diesem Rechner aus nicht."
  }
} catch {
  $status.fehler = FehlerText $_
  Schreibe ("Fehler: " + $status.fehler)
}
$status.letzte = $stand.letzte
$status.auftrag = $stand.auftrag
StandSichern

try {
  Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "sicherung_status";
    wert = ($status | ConvertTo-Json -Compress -Depth 5) } "resolution=merge-duplicates"
} catch { Schreibe ("Stand nicht an die App gemeldet: " + $_.Exception.Message) }

if ($Probe) {
  if ($status.fehler) { Write-Host "Fehler: $($status.fehler)" -ForegroundColor Yellow; exit 1 }
  Write-Host ("Sicherungen im Ordner: " + $status.liste.Count)
}
if ($status.fehler) { exit 1 }
exit 0
