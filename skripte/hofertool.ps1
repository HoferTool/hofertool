# =================================================================
#  HOFERTOOL — alles für die App in einer Aufgabe
#
#  Die Aufgabe "HoferTool" startet dieses Programm alle fünf Minuten
#  unsichtbar (über unsichtbar.vbs), ohne Knopf in der App (Wunsch
#  Patrick 8. Oktober 2026: eine Aufgabe für alles). Es ruft nachein-
#  ander auf:
#     solarlog.ps1          Werte vom Solar-Log an die App
#     dokumente-pool.ps1    WBGs aus dem Pool-Ordner hochladen und dort
#                           löschen (der einzige Ordner, in dem gelöscht wird)
#     zeichnungen.ps1       Zeichnungen hochladen, nur lesen
#     einrichtblaetter.ps1  Einrichtblätter hochladen, nur lesen
#
#  Dazu startet es drucken.ps1, wenn es nicht schon läuft: Das bleibt
#  dauernd im Hintergrund und druckt Aufträge aus der App alle paar
#  Sekunden, nicht erst beim nächsten Durchlauf (seit 111.126.0).
#
#  Jeder Teil läuft für sich: Bricht einer ab oder hängt er (etwa weil
#  ein Netzlaufwerk nicht antwortet), kommen die anderen trotzdem dran.
#  Unveränderte Dateien lassen die Teile in Ruhe, dann tun sie nichts.
#  Was fehlt (Solar ohne solar-einstellungen.json, Dokumente ohne
#  abgleich-einstellungen.json), wird übersprungen.
#
#  Die Sicherung gehört nicht dazu: Die macht die App selbst (Einstellungen → Backup).
#
#  Vor jedem Durchlauf holt es die neueste Fassung aller Programme von
#  GitHub (Zweig main, seit 111.113.0): Eine Korrektur kommt so am Pool-
#  Rechner an, ohne dass jemand einrichten.ps1 nochmals startet. Ohne
#  Internet oder bei einer leeren Antwort bleibt die vorhandene Fassung.
#
#  Protokoll: hofertool.log daneben, jeder Teil hat zusätzlich sein eigenes.
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

$ErrorActionPreference = "Continue"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$protDatei = Join-Path $ordnerHier "hofertool.log"

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  try {
    Add-Content -Path $protDatei -Value $zeile -Encoding UTF8
    $alle = Get-Content -Path $protDatei -Encoding UTF8
    if ($alle.Count -gt 3000) { $alle | Select-Object -Last 2000 | Set-Content -Path $protDatei -Encoding UTF8 }
  } catch { }
}

# Nie zweimal gleichzeitig, auch nicht von Hand gestartet
$sperre = New-Object Threading.Mutex($false, "Global\HoferTool")
try { $frei = $sperre.WaitOne(0) } catch [Threading.AbandonedMutexException] { $frei = $true }
if (-not $frei) { Schreibe "Läuft schon, dieser Start bleibt aus."; exit 0 }

# Ein Teil als eigener PowerShell-Prozess, mit Zeitgrenze in Minuten.
# Er erbt das versteckte Fenster, es blitzt also nichts auf.
function Teil([string]$skript, [int]$minuten, [string]$braucht) {
  $pfad = Join-Path $ordnerHier $skript
  if (-not (Test-Path $pfad)) { return }
  if ($braucht -and -not (Test-Path (Join-Path $ordnerHier $braucht))) { return }
  $start = Get-Date
  try {
    $p = Start-Process -FilePath "powershell.exe" -NoNewWindow -PassThru -WorkingDirectory $ordnerHier `
      -ArgumentList @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ('"' + $pfad + '"'))
    # Ohne diesen Zugriff liefert Windows PowerShell 5.1 später keinen ExitCode
    $null = $p.Handle
    if (-not $p.WaitForExit($minuten * 60000)) {
      try { $p.Kill() } catch { }
      Schreibe ("$skript nach $minuten Minuten abgebrochen")
      return
    }
    $sek = [Math]::Round(((Get-Date) - $start).TotalSeconds)
    if ($p.ExitCode -ne 0) { Schreibe ("$skript mit Fehler beendet (" + $p.ExitCode + "), siehe sein Protokoll") }
    elseif ($sek -ge 60) { Schreibe ("$skript fertig nach $sek Sekunden") }
  } catch {
    Schreibe ("$skript liess sich nicht starten: " + $_.Exception.Message)
  }
}

# ---------- Selbst aktualisieren ----------
# Jede Datei kommt zuerst nach %TEMP%; übernommen wird sie nur, wenn sie
# wie ein Programm von uns aussieht (Kopfzeile "# ====") und anders ist
# als die vorhandene. hofertool.ps1 selbst kommt zuletzt: Die laufende
# Fassung ist schon eingelesen, die neue gilt ab dem nächsten Durchlauf.
$QUELLE = "https://raw.githubusercontent.com/HoferTool/hofertool/main/skripte"
function Aktualisieren {
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
  foreach ($n in @("dokumente-teile.ps1", "solarlog.ps1", "dokumente-pool.ps1", "zeichnungen.ps1", "einrichtblaetter.ps1", "drucken.ps1", "hofertool.ps1")) {
    $ziel = Join-Path $ordnerHier $n
    $temp = Join-Path $env:TEMP ("hofertool-neu-" + $n)
    try {
      Invoke-WebRequest -UseBasicParsing -Uri ("$QUELLE/${n}?t=" + [DateTime]::UtcNow.Ticks) -OutFile $temp -TimeoutSec 20 -ErrorAction Stop
      $neu = [IO.File]::ReadAllBytes($temp)
      $text = [Text.Encoding]::UTF8.GetString($neu)
      if ($neu.Length -lt 200 -or -not $text.Contains("# ====")) { continue }
      if (Test-Path -LiteralPath $ziel) {
        $alt = [IO.File]::ReadAllBytes($ziel)
        if ([BitConverter]::ToString($alt) -eq [BitConverter]::ToString($neu)) { continue }
      }
      [IO.File]::WriteAllBytes($ziel, $neu)
      Unblock-File -Path $ziel -ErrorAction SilentlyContinue
      Schreibe ("$n von GitHub aktualisiert")
    } catch {
      # Kein Internet oder GitHub nicht erreichbar: still mit der vorhandenen Fassung weiter
    } finally {
      Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    }
  }
}

# ---------- Drucken im Hintergrund ----------
# drucken.ps1 hält die Sperre "Global\HoferToolDrucken", solange es läuft.
# Gibt es sie nicht, ist es nicht da (abgestürzt, Rechner neu gestartet)
# und kommt jetzt. Es läuft weiter, wenn dieser Durchlauf fertig ist.
function DruckenStarten {
  $pfad = Join-Path $ordnerHier "drucken.ps1"
  if (-not (Test-Path $pfad) -or -not (Test-Path (Join-Path $ordnerHier "abgleich-einstellungen.json"))) { return }
  try { $m = [Threading.Mutex]::OpenExisting("Global\HoferToolDrucken"); $m.Dispose(); return } catch { }
  try {
    Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -WorkingDirectory $ordnerHier `
      -ArgumentList @("-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", ('"' + $pfad + '"')) | Out-Null
    Schreibe "drucken.ps1 gestartet"
  } catch {
    Schreibe ("drucken.ps1 liess sich nicht starten: " + $_.Exception.Message)
  }
}

try {
  Aktualisieren
  DruckenStarten
  Teil "solarlog.ps1"         2  "solar-einstellungen.json"
  Teil "dokumente-pool.ps1"   10 "abgleich-einstellungen.json"
  Teil "zeichnungen.ps1"      10 "abgleich-einstellungen.json"
  Teil "einrichtblaetter.ps1" 10 "abgleich-einstellungen.json"
} finally {
  try { $sperre.ReleaseMutex() } catch { }
}
exit 0
