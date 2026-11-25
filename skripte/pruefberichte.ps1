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
#  mit Unterordnern, wenn das Häkchen gesetzt ist. Die HOCO Nr. kommt wie
#  bei den Zeichnungen zuerst aus Kundenordner und Teilordner
#  ("10841\0009 Federführung …"), sonst aus dem Dateinamen, sonst aus
#  einem Ordnernamen darüber. Ohne HOCO Nr. bleibt die Datei weg.
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
$stand = @{ token = $null; ablauf = 0; auffrischen = $null; dateien = @{}; zuletzt = $null }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
    $stand.zuletzt = $g.zuletzt
    if ($g.dateien) { $g.dateien.PSObject.Properties | ForEach-Object { $stand.dateien[$_.Name] = [string]$_.Value } }
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
function HocoAusPfad($d, [string]$wurzel) {
  $w = $wurzel.TrimEnd('\').ToLower()
  $o = $d.Directory
  while ($o -and $o.FullName.TrimEnd('\').Length -gt $w.Length) {
    $t = [regex]::Match([string]$o.Name, '^\s*(\d{3,5})(?!\d)')
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
    $h = HocoAusText $o.Name
    if ($h) { return $h }
    $o = $o.Parent
  }
  return $null
}

function AusAblageWeg($pfade) {
  $p = @($pfade | Where-Object { $_ })
  if ($p.Count -eq 0) { return }
  try {
    Invoke-RestMethod -Method Delete -Uri "$U/storage/v1/object/zeichnungen" -Headers (Kopf) `
      -ContentType "application/json" -Body (Json @{ prefixes = $p }) | Out-Null
  } catch { Schreibe ("Alte Datei nicht gelöscht: " + $_.Exception.Message) }
}

$jetztIso = (Get-Date).ToUniversalTime().ToString("o")
$status = @{ immer = $true; zeit = $jetztIso; gesehen = $jetztIso; rechner = $env:COMPUTERNAME; scharf = (-not $Probe);
             ordner = @(); excel = 0; ohneNr = 0; rest = 0; hochgeladen = 0; entfernt = 0; abgeloest = 0; fehler = $null }

try {
  Anmelden
  $konf = $null
  Lesen "app_config?select=wert&schluessel=eq.pruefbericht_ordner" |
    ForEach-Object { if ($_.wert) { try { $konf = $_.wert | ConvertFrom-Json } catch { } } }
  if (-not $konf -or -not $konf.ordner -or @($konf.ordner | Where-Object { $_.pfad }).Count -eq 0) {
    throw "In der App sind noch keine Prüfbericht-Ordner eingetragen (Einstellungen → Dokumente)."
  }

  # Was in der App schon aus den Ordnern kam
  $inApp = @{}
  foreach ($r in (Lesen "pruefbericht_dateien?select=id,pfad,ablage,kennung&quelle=eq.ordner")) {
    $k = [string]$r.pfad
    if (-not $inApp.ContainsKey($k)) { $inApp[$k] = @() }
    $inApp[$k] += $r
  }

  # HOCO Nummern mit Prüfprotokoll in der App (seit 1.795.0, Wunsch Patrick
  # 24. November 2026: „sobald eine neuere dazu kommt, soll das Original weg“):
  # dort gilt nur noch die App, das Excel aus dem Ordner kommt aus der App weg
  # und wird nie mehr hochgeladen. Der Ordner selbst wird nie angefasst.
  $mitApp = @{}
  foreach ($r in (Lesen "pruefprotokolle?select=hoco_nr")) {
    if ($r.hoco_nr) { $mitApp[[string]$r.hoco_nr] = $true }
  }

  $gesehen = @{}
  $erreichbar = @()
  $nochFrei = $hoechstensJeLauf
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
      $h = HocoAusPfad $d $pfad
      if (-not $h) { $status.ohneNr++; continue }
      if ($mitApp.ContainsKey($h)) {
        if ($inApp.ContainsKey($d.FullName) -and $status.scharf) {
          $weg = @($inApp[$d.FullName])
          try {
            Aendern "Delete" ("pruefbericht_dateien?id=in.(" + (($weg | ForEach-Object { $_.id }) -join ",") + ")") $null $null
            AusAblageWeg @($weg | ForEach-Object { [string]$_.ablage })
            $status.abgeloest++
            Schreibe ("Original abgelöst (Protokoll in der App): " + $d.FullName)
          } catch { Schreibe ("Fehler beim Ablösen von " + $d.FullName + ": " + $_.Exception.Message) }
        }
        continue
      }
      $kennung = Kennung $d
      $vorher = @()
      if ($inApp.ContainsKey($d.FullName)) { $vorher = @($inApp[$d.FullName]) }
      if ($vorher.Count -gt 0 -and @($vorher | Where-Object { [string]$_.kennung -eq $kennung }).Count -gt 0) { continue }
      if (-not $status.scharf) { Schreibe ("Probe: " + $d.FullName + "  →  " + $h); continue }
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
        Aendern "Post" "pruefbericht_dateien" @{ hoco_nr = $h; name = $d.Name; pfad = $d.FullName; url = $adresse;
          ablage = $ablage; kennung = $kennung; quelle = "ordner"; geaendert = $d.LastWriteTimeUtc.ToString("o") } $null
        # Die frühere Fassung derselben Datei kommt erst jetzt weg
        if ($vorher.Count -gt 0) {
          Aendern "Delete" ("pruefbericht_dateien?id=in.(" + (($vorher | ForEach-Object { $_.id }) -join ",") + ")") $null $null
          AusAblageWeg @($vorher | ForEach-Object { [string]$_.ablage })
        }
        $status.hochgeladen++
        $nochFrei--
        Schreibe ($d.FullName + "  →  " + $h)
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
  $status.anzahl = @(Lesen "pruefbericht_dateien?select=id&quelle=eq.ordner").Count
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
