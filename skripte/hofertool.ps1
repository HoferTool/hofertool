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
#  Jeder Teil läuft für sich: Bricht einer ab oder hängt er (etwa weil
#  ein Netzlaufwerk nicht antwortet), kommen die anderen trotzdem dran.
#  Unveränderte Dateien lassen die Teile in Ruhe, dann tun sie nichts.
#  Was fehlt (Solar ohne solar-einstellungen.json, Dokumente ohne
#  abgleich-einstellungen.json), wird übersprungen.
#
#  Die Sicherung gehört nicht dazu: Die macht die App selbst (Einstellungen → Backup).
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

try {
  Teil "solarlog.ps1"         2  "solar-einstellungen.json"
  Teil "dokumente-pool.ps1"   10 "abgleich-einstellungen.json"
  Teil "zeichnungen.ps1"      10 "abgleich-einstellungen.json"
  Teil "einrichtblaetter.ps1" 10 "abgleich-einstellungen.json"
} finally {
  try { $sperre.ReleaseMutex() } catch { }
}
exit 0
