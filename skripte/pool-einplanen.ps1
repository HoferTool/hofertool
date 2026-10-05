# =================================================================
#  POOL EINPLANEN — legt die Aufgabe in der Windows-Aufgabenplanung an
#
#  Startet dokumente-pool.ps1 alle fünf Minuten, solange du am Rechner
#  angemeldet bist. Einmal ausführen genügt; nochmals ausführen
#  ersetzt die Aufgabe. Rechtsklick → "Mit PowerShell ausführen".
#
#  Entfernen:  .\pool-einplanen.ps1 -Weg
# =================================================================

param([switch]$Weg)

$ErrorActionPreference = "Stop"
$ordnerHier = Split-Path -Parent $MyInvocation.MyCommand.Path
$name = "Hofer Dokumente-Pool"

if ($Weg) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Aufgabe '$name' entfernt."
  exit 0
}

$skript = Join-Path $ordnerHier "dokumente-pool.ps1"
if (-not (Test-Path $skript)) { Write-Host "dokumente-pool.ps1 fehlt neben diesem Skript."; exit 1 }

# Über unsichtbar.vbs, damit kein PowerShell-Fenster aufblitzt
$vbs = Join-Path $ordnerHier "unsichtbar.vbs"
if (-not (Test-Path $vbs)) { Write-Host "unsichtbar.vbs fehlt neben diesem Skript."; exit 1 }
$aktion = New-ScheduledTaskAction -Execute "wscript.exe" -WorkingDirectory $ordnerHier `
  -Argument ('//B //Nologo "' + $vbs + '" dokumente-pool.ps1')
$ausloeser = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$einst = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $name -Action $aktion -Trigger $ausloeser -Settings $einst `
  -Description "Lädt alle 5 Minuten die WBGs aus dem Pool-Ordner ins Hofer Tool und leert ihn." `
  -Force | Out-Null

Write-Host "Aufgabe '$name' angelegt: alle 5 Minuten, solange du angemeldet bist."
Write-Host "Protokoll: $(Join-Path $ordnerHier 'pool.log')"
