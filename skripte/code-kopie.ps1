# =================================================================
#  CODE-KOPIE — Plan B: der ganze Code des HoferTools bei uns im Haus
#
#  Läuft in der Aufgabe "HoferTool" (hofertool.ps1), tut aber nur einmal
#  am Tag etwas (Wunsch Patrick 25. November 2026: "eine Kopie des Codes
#  bei euch"). Es holt den Stand des Zweigs main von GitHub als ZIP
#  (öffentlich, ohne Anmeldung): die App (src), die Datenbank-Dateien
#  (sql), die Serverfunktionen (supabase/functions), die Programme
#  (skripte, werkzeuge) und CLAUDE.md mit der ganzen Beschreibung.
#
#  Ablage: Ordner aus planb-ordner.txt daneben (eine Zeile, etwa
#  \\SERVER\Daten\HoferTool PlanB), sonst C:\Hofer\PlanB.
#  Darin HoferTool-Code-JJJJ-MM-TT.zip. Es bleiben die neusten 30,
#  ältere löscht das Programm, aber nur seine eigenen Code-ZIPs.
#
#  Zusammen mit der täglichen Sicherung (ZIP aus der App, mit schema.sql)
#  reicht das, um das HoferTool auf einem neuen Server aufzubauen.
#  Anleitung: Notfall-Anleitung (liegt nicht im Repository).
#
#  Aufruf:
#     .\code-kopie.ps1           normaler Durchlauf (einmal am Tag)
#     .\code-kopie.ps1 -Jetzt    sofort, auch wenn heute schon kopiert
#
#  Windows PowerShell 5.1 reicht, nichts zu installieren.
# =================================================================

param([switch]$Jetzt)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$protDatei  = Join-Path $ordnerHier "code-kopie.log"
$BEHALTEN   = 30
$QUELLE     = "https://codeload.github.com/HoferTool/hofertool/zip/refs/heads/main"

function Schreibe([string]$text) {
  $zeile = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $text
  try { Add-Content -LiteralPath $protDatei -Value $zeile -Encoding UTF8 } catch { }
}

# Ziel: planb-ordner.txt oder C:\Hofer\PlanB
$ziel = "C:\Hofer\PlanB"
$wahl = Join-Path $ordnerHier "planb-ordner.txt"
if (Test-Path -LiteralPath $wahl) {
  $z = (Get-Content -LiteralPath $wahl -Encoding UTF8 | Where-Object { $_.Trim() } | Select-Object -First 1)
  if ($z) { $ziel = $z.Trim() }
}

try {
  if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Path $ziel -Force | Out-Null }
  $heute = Get-Date -Format "yyyy-MM-dd"
  $datei = Join-Path $ziel ("HoferTool-Code-" + $heute + ".zip")
  if ((Test-Path -LiteralPath $datei) -and -not $Jetzt) { exit 0 }

  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
  $temp = $datei + ".teil"
  Invoke-WebRequest -UseBasicParsing -Uri $QUELLE -OutFile $temp -TimeoutSec 300

  # Nur übernehmen, wenn es wirklich ein ZIP mit dem HoferTool ist
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($temp)
  try {
    $namen = $zip.Entries | ForEach-Object { $_.FullName }
    $gut = ($namen | Where-Object { $_ -like "*/CLAUDE.md" }) -and ($namen | Where-Object { $_ -like "*/supabase/functions/*" })
    $anzahl = $zip.Entries.Count
  } finally { $zip.Dispose() }
  if (-not $gut) { Remove-Item -LiteralPath $temp -Force; throw "Heruntergeladene Datei ist kein vollständiger Code-Stand." }
  Move-Item -LiteralPath $temp -Destination $datei -Force
  $mb = [Math]::Round((Get-Item -LiteralPath $datei).Length / 1MB, 1)
  Schreibe ("Kopie " + $datei + " (" + $mb + " MB, " + $anzahl + " Einträge)")

  # Alte Kopien weg, die neusten $BEHALTEN bleiben
  $alle = @(Get-ChildItem -LiteralPath $ziel -Filter "HoferTool-Code-*.zip" | Sort-Object Name -Descending)
  if ($alle.Count -gt $BEHALTEN) {
    $alle | Select-Object -Skip $BEHALTEN | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force
      Schreibe ("alt gelöscht: " + $_.Name)
    }
  }
  exit 0
} catch {
  Schreibe ("Fehler: " + $_.Exception.Message)
  exit 1
}
