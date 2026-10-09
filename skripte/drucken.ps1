# =================================================================
#  DRUCKEN — Druckaufträge aus der App auf den Drucker im Firmennetz
#
#  iPad und Handy hängen am WLAN Hofer&Co und kommen nicht an den
#  Sharp-Drucker im Firmennetz (Wunsch Patrick, 9. Oktober 2026). Der
#  Knopf „Drucken“ im Betrachter legt darum einen Auftrag in die Tabelle
#  druckauftraege. Dieses Programm läuft auf dem Pool-Rechner dauernd im
#  Hintergrund, schaut alle drei Sekunden nach und druckt:
#     PDF und Fotos   kommen als JPG-Seiten aus der Ablage „druck“ und
#                     gehen mit Windows selbst auf den Drucker
#     Excel           wird heruntergeladen und mit Excel gedruckt
#  Danach steht im Auftrag „fertig“ oder der Fehler, das zeigt die App.
#
#  Gestartet wird es von hofertool.ps1 (Aufgabe „HoferTool“), wenn es
#  nicht schon läuft. Holt sich hofertool.ps1 eine neue Fassung von
#  GitHub, startet sich dieses Programm selbst neu. Den Drucker wählt
#  man in der App unter Einstellungen → Dokumente; die Liste der Drucker
#  meldet dieses Programm jede Minute (app_config.druck_status).
#
#  Aufträge, die älter als 15 Minuten sind (Rechner war aus), werden
#  nicht mehr gedruckt, sondern mit einer Meldung abgeschlossen.
#
#  Aufruf von Hand:
#     .\drucken.ps1 -Probe     zeigt die Drucker und den Stand, druckt nichts
#
#  Braucht daneben dokumente-teile.ps1 und abgleich-einstellungen.json.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Probe)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$ichSelbst  = $MyInvocation.MyCommand.Path
$einstDatei = Join-Path $ordnerHier "abgleich-einstellungen.json"
$standDatei = Join-Path $ordnerHier "drucken-stand.json"
$protDatei  = Join-Path $ordnerHier "drucken.log"
$hoechstAlterMin = 15

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Drawing

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  if ($Probe) { Write-Host $zeile }
  try {
    Add-Content -Path $protDatei -Value $zeile -Encoding UTF8
    $alle = Get-Content -Path $protDatei -Encoding UTF8
    if ($alle.Count -gt 2000) { $alle | Select-Object -Last 1500 | Set-Content -Path $protDatei -Encoding UTF8 }
  } catch { }
}

# Nie zweimal gleichzeitig. Beim Neustart nach einer neuen Fassung
# wartet der neue kurz, bis der alte die Sperre freigegeben hat.
$sperre = New-Object Threading.Mutex($false, "Global\HoferToolDrucken")
if (-not $Probe) {
  try { $frei = $sperre.WaitOne(20000) } catch [Threading.AbandonedMutexException] { $frei = $true }
  if (-not $frei) { exit 0 }
}

# ---------- Einstellungen und Anmeldung ----------
if (-not (Test-Path $einstDatei)) { Schreibe "abgleich-einstellungen.json fehlt"; exit 1 }
$E = Get-Content -Raw -Path $einstDatei -Encoding UTF8 | ConvertFrom-Json
$U = ($E.supabase_url).TrimEnd("/")
$KEY = $E.anon_key

$stand = @{ token = $null; ablauf = 0; auffrischen = $null }
if (Test-Path $standDatei) {
  try {
    $g = Get-Content -Raw -Path $standDatei -Encoding UTF8 | ConvertFrom-Json
    $stand.token = $g.token; $stand.ablauf = [double]$g.ablauf; $stand.auffrischen = $g.auffrischen
  } catch { }
}
function StandSichern {
  $stand | ConvertTo-Json -Depth 3 | Set-Content -Path $standDatei -Encoding UTF8
}

# Anmelden, Kopf, Lesen, Aendern, W
. (Join-Path $ordnerHier "dokumente-teile.ps1")

# ---------- Was der Rechner kann ----------
# Als echte Liste von Texten: Über die Pipeline kamen in PowerShell 5.1
# nur leere Namen in der Datenbank an (9. Oktober 2026).
function DruckerListe {
  $namen = New-Object 'System.Collections.Generic.List[string]'
  try { foreach ($n in [System.Drawing.Printing.PrinterSettings]::InstalledPrinterNames) { if ([string]$n) { $namen.Add([string]$n) } } } catch { }
  if ($namen.Count -eq 0) {
    try { foreach ($d in Get-WmiObject -Class Win32_Printer) { if ([string]$d.Name) { $namen.Add([string]$d.Name) } } } catch { }
  }
  $namen.Sort()
  return ,([string[]]$namen.ToArray())
}
function StandardDrucker {
  try { return (New-Object System.Drawing.Printing.PrinterSettings).PrinterName } catch { return $null }
}
function HatExcel {
  return (Test-Path "Registry::HKEY_CLASSES_ROOT\Excel.Application\CLSID")
}

$zuletzt = $null
$letzterFehler = $null
function StandMelden {
  $status = @{ gesehen = (Get-Date).ToUniversalTime().ToString("o"); rechner = $env:COMPUTERNAME;
               drucker = [string[]](DruckerListe); standard = [string](StandardDrucker); excel = [bool](HatExcel);
               zuletzt = $script:zuletzt; fehler = $script:letzterFehler }
  if ($Probe) { return $status }
  Aendern "Post" "app_config?on_conflict=schluessel" @{ schluessel = "druck_status";
    wert = ($status | ConvertTo-Json -Compress -Depth 4) } "resolution=merge-duplicates"
  return $status
}

# ---------- Drucken ----------
# Bilder (JPG-Seiten) mit Windows selbst: jede Seite so gross wie das
# Papier erlaubt, hoch oder quer je nach Bild, mittig.
function BilderDrucken([string[]]$dateien, [string]$drucker, [int]$kopien, [string]$titel) {
  $script:bilder = @()
  try {
    foreach ($d in $dateien) { $script:bilder += [System.Drawing.Image]::FromFile($d) }
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $drucker
    if (-not $doc.PrinterSettings.IsValid) { throw "Den Drucker '$drucker' gibt es auf diesem Rechner nicht." }
    $doc.DocumentName = "HoferTool " + $titel
    # Ohne Fenster „Seite 1 wird gedruckt“
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $doc.PrinterSettings.Copies = [int16][Math]::Min($kopien, [Math]::Max(1, $doc.PrinterSettings.MaximumCopies))
    $doc.PrinterSettings.Collate = $true
    $script:seite = 0
    $doc.add_QueryPageSettings({
      param($s, $e)
      $b = $script:bilder[$script:seite]
      $e.PageSettings.Landscape = ($b.Width -gt $b.Height)
    })
    $doc.add_PrintPage({
      param($s, $e)
      $b = $script:bilder[$script:seite]
      # Druckbarer Bereich in 1/100 Zoll. Ob er bei „quer“ mitdreht, hängt
      # vom Treiber ab; darum nach der Lage der Seite richten.
      $pa = $e.PageSettings.PrintableArea
      $lang = [Math]::Max($pa.Width, $pa.Height); $kurz = [Math]::Min($pa.Width, $pa.Height)
      if ($e.PageBounds.Width -gt $e.PageBounds.Height) { $w = $lang; $h = $kurz } else { $w = $kurz; $h = $lang }
      $f = [Math]::Min($w / $b.Width, $h / $b.Height)
      $bw = $b.Width * $f; $bh = $b.Height * $f
      $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $e.Graphics.DrawImage($b, [single](($w - $bw) / 2), [single](($h - $bh) / 2), [single]$bw, [single]$bh)
      $script:seite++
      $e.HasMorePages = ($script:seite -lt $script:bilder.Count)
    })
    $doc.Print()
    # Kann der Treiber nicht so viele Kopien auf einmal, den Rest einzeln
    $rest = $kopien - $doc.PrinterSettings.Copies
    while ($rest -gt 0) {
      $script:seite = 0
      $doc.PrinterSettings.Copies = 1
      $doc.Print()
      $rest--
    }
    $doc.Dispose()
  } finally {
    foreach ($b in $script:bilder) { try { $b.Dispose() } catch { } }
    $script:bilder = @()
  }
}

# Excel mit Excel selbst: so, wie es in Excel eingerichtet ist. Excel will
# den Drucker mit Anschluss („Sharp auf Ne03:“, im englischen Excel „on“),
# den Anschluss steht in der Registrierung.
function ExcelDrucken([string]$pfad, [string]$drucker, [int]$kopien, [string]$blatt) {
  if (-not (HatExcel)) { throw "Auf dem Pool-Rechner ist kein Excel." }
  $ne = $null
  try {
    $wert = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Devices" -Name $drucker -ErrorAction Stop).$drucker
    $ne = ([string]$wert -split ",")[1]
  } catch { }
  $xl = New-Object -ComObject Excel.Application
  $wb = $null
  try {
    $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false
    try { $xl.AskToUpdateLinks = $false } catch { }
    $wb = $xl.Workbooks.Open($pfad, 0, $true)
    $ws = $null
    if ($blatt) { try { $ws = $wb.Worksheets.Item($blatt) } catch { $ws = $null } }
    if (-not $ws) { $ws = $wb.Worksheets.Item(1) }
    $gesetzt = $false
    $versuche = @($drucker)
    if ($ne) { $versuche = @("$drucker auf $ne", "$drucker on $ne", $drucker) }
    foreach ($v in $versuche) {
      try { $xl.ActivePrinter = $v; $gesetzt = $true; break } catch { }
    }
    if (-not $gesetzt) { throw "Excel findet den Drucker '$drucker' nicht." }
    $leer = [Type]::Missing
    $ws.PrintOut($leer, $leer, $kopien, $false, $leer, $false, $true) | Out-Null
  } finally {
    if ($wb) { try { $wb.Close($false) } catch { } ; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    try { $xl.Quit() } catch { }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  }
}

# Auftrag für sich beanspruchen: nur wenn er noch „offen“ ist
function Nehmen($a) {
  $h = Kopf; $h["Prefer"] = "return=representation"
  $r = Invoke-RestMethod -Method Patch -Uri ("$U/rest/v1/druckauftraege?id=eq." + $a.id + "&zustand=eq.offen") -Headers $h `
    -ContentType "application/json; charset=utf-8" -Body (Json @{ zustand = "druckt" })
  return (@($r | Where-Object { $null -ne $_ }).Count -gt 0)
}

function Abschliessen($a, [string]$zustand, [string]$meldung) {
  Aendern "Patch" ("druckauftraege?id=eq." + $a.id) @{ zustand = $zustand; meldung = $meldung;
    erledigt_am = (Get-Date).ToUniversalTime().ToString("o") }
}

function SeitenWeg($ids) {
  $pfade = @()
  foreach ($a in $ids) { for ($i = 1; $i -le [int]$a.seiten; $i++) { $pfade += ($a.id + "/" + $i + ".jpg") } }
  if (-not $pfade.Count) { return }
  try {
    Invoke-RestMethod -Method Delete -Uri "$U/storage/v1/object/druck" -Headers (Kopf) `
      -ContentType "application/json" -Body (Json @{ prefixes = $pfade }) | Out-Null
  } catch { Schreibe ("Seiten nicht gelöscht: " + $_.Exception.Message) }
}

function Bearbeiten($a, $einst) {
  $alterMin = ((Get-Date).ToUniversalTime() - ([DateTime]$a.erstellt_am).ToUniversalTime()).TotalMinutes
  if (-not (Nehmen $a)) { return }
  $titel = [string]$a.titel
  $drucker = [string]$a.drucker
  if (-not $drucker) { $drucker = [string]$einst.drucker }
  $temp = Join-Path $env:TEMP ("hofer-druck-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
  try {
    if ($alterMin -gt $hoechstAlterMin) {
      Abschliessen $a "fehler" ("Nicht gedruckt: Der Auftrag ist " + [Math]::Round($alterMin) + " Minuten alt, der Pool-Rechner war so lange nicht bereit.")
      Schreibe ("Zu alt, nicht gedruckt: " + $titel)
      return
    }
    if (-not $drucker) { throw "In der App ist kein Drucker gewählt (Einstellungen → Dokumente)." }
    New-Item -ItemType Directory -Path $temp | Out-Null
    $kopien = [Math]::Max(1, [int]$a.kopien)
    if ($a.art -eq "excel") {
      $endung = ([regex]::Match(([string]$a.quelle -split '[?#]')[0], '\.(xlsx|xlsm|xls)$', "IgnoreCase")).Value
      if (-not $endung) { $endung = ".xlsx" }
      $datei = Join-Path $temp ("blatt" + $endung)
      Invoke-WebRequest -UseBasicParsing -Uri ([string]$a.quelle) -OutFile $datei -TimeoutSec 60
      ExcelDrucken $datei $drucker $kopien ([string]$a.blatt)
    } else {
      $dateien = @()
      for ($i = 1; $i -le [int]$a.seiten; $i++) {
        $d = Join-Path $temp ("$i.jpg")
        Invoke-WebRequest -UseBasicParsing -Uri ("$U/storage/v1/object/druck/" + $a.id + "/$i.jpg") -Headers (Kopf) -OutFile $d -TimeoutSec 60
        $dateien += $d
      }
      if (-not $dateien.Count) { throw "Der Auftrag hat keine Seiten." }
      BilderDrucken $dateien $drucker $kopien $titel
    }
    Abschliessen $a "fertig" $null
    $script:zuletzt = @{ zeit = (Get-Date).ToUniversalTime().ToString("o"); titel = $titel; wer = [string]$a.wer }
    $script:letzterFehler = $null
    Schreibe ("Gedruckt auf " + $drucker + ": " + $titel + " (" + $kopien + "x, " + [string]$a.wer + ")")
  } catch {
    $text = $_.Exception.Message
    Schreibe ("Fehler bei " + $titel + ": " + $text)
    $script:letzterFehler = $text
    try { Abschliessen $a "fehler" $text } catch { }
  } finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
    if ($a.art -ne "excel") { SeitenWeg @($a) }
  }
}

# Erledigte Aufträge nach sieben Tagen weg, liegengebliebene Seiten mit
function Aufraeumen {
  $grenze = (Get-Date).ToUniversalTime().AddDays(-7).ToString("o")
  $alt = Lesen ("druckauftraege?select=id,seiten&erstellt_am=lt." + (W $grenze))
  if (-not $alt.Count) { return }
  SeitenWeg $alt
  Aendern "Delete" ("druckauftraege?erstellt_am=lt." + (W $grenze)) $null
}

# ---------- Probe ----------
if ($Probe) {
  Anmelden
  $s = StandMelden
  Write-Host ""
  Write-Host "Drucker auf diesem Rechner:"
  $s.drucker | ForEach-Object { Write-Host ("   " + $_) }
  Write-Host ("Standarddrucker: " + $s.standard)
  Write-Host ("Excel vorhanden: " + $s.excel)
  $einst = $null
  Lesen "app_config?select=wert&schluessel=eq.druck" | ForEach-Object { try { $einst = $_.wert | ConvertFrom-Json } catch { } }
  Write-Host ("In der App gewählt: " + $(if ($einst -and $einst.drucker) { $einst.drucker } else { "(keiner)" }))
  $offen = Lesen "druckauftraege?select=id&zustand=eq.offen"
  Write-Host ("Offene Druckaufträge: " + $offen.Count)
  exit 0
}

# ---------- Dauerlauf ----------
$start = Get-Date
$eigeneFassung = (Get-Item -LiteralPath $ichSelbst).LastWriteTimeUtc
$naechsterStand = [DateTime]::MinValue
$naechstesAufraeumen = (Get-Date).AddMinutes(2)
$fehlerZahl = 0
Schreibe "Gestartet"
try {
  while ($true) {
    try {
      Anmelden
      $einst = @{}
      $offen = @(Lesen "druckauftraege?select=*&zustand=eq.offen&order=erstellt_am.asc&limit=5")
      if ($offen.Count) {
        Lesen "app_config?select=wert&schluessel=eq.druck" | ForEach-Object { try { $einst = $_.wert | ConvertFrom-Json } catch { } }
        foreach ($a in $offen) { Bearbeiten $a $einst }
        $naechsterStand = [DateTime]::MinValue
      }
      if ((Get-Date) -ge $naechsterStand) {
        StandMelden | Out-Null
        $naechsterStand = (Get-Date).AddSeconds(60)
      }
      if ((Get-Date) -ge $naechstesAufraeumen) {
        try { Aufraeumen } catch { Schreibe ("Aufräumen ging nicht: " + $_.Exception.Message) }
        $naechstesAufraeumen = (Get-Date).AddHours(1)
      }
      $fehlerZahl = 0
    } catch {
      $fehlerZahl++
      # Nicht jeden Fehler alle drei Sekunden ins Protokoll (etwa ohne Internet)
      if ($fehlerZahl -le 3 -or $fehlerZahl % 100 -eq 0) { Schreibe ("Fehler: " + $_.Exception.Message) }
      # Abgelaufene Anmeldung: beim nächsten Mal frisch
      if ($_.Exception.Message -match "401|JWT") { $stand.token = $null; $stand.ablauf = 0 }
    }
    Start-Sleep -Seconds $(if ($fehlerZahl -gt 3) { 30 } else { 3 })

    # Neue Fassung von GitHub (hofertool.ps1 legt sie hin) oder nach
    # zwölf Stunden: sich selbst neu starten, ohne Lücke
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
