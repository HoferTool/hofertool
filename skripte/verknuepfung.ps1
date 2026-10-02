# =================================================================
#  VERKNÜPFUNG — legt "Hofer Tool" mit dem richtigen Symbol auf den
#  Desktop. Einfach doppelklicken geht nicht; so starten:
#
#     Rechtsklick auf diese Datei → "Mit PowerShell ausführen"
#
#  Braucht hofer-tool.ico im selben Ordner.
# =================================================================

# Wo das Symbol liegen soll. Am besten ein Ordner auf eurem Server, den
# alle PCs erreichen — dann zeigt die Verknüpfung auf jedem PC das Logo,
# auch wenn sie über OneDrive auf einen anderen PC wandert. Zum Beispiel:
#   $SYMBOL_ORDNER = "\\FS01\Daten\Hofer"
# Mit "C:\Hofer" liegt es nur auf diesem einen Rechner.
$SYMBOL_ORDNER = "W:\HoferTool"

$ADRESSE = "https://hofertool.github.io/hofertool/"
$hier    = Split-Path -Parent $MyInvocation.MyCommand.Path
$quelle  = Join-Path $hier "hofer-tool.ico"
$ziel    = Join-Path $SYMBOL_ORDNER "hofer-tool.ico"

if (-not (Test-Path $quelle)) {
  Write-Host "hofer-tool.ico liegt nicht neben diesem Programm." -ForegroundColor Red
  Read-Host "Enter zum Schliessen"; exit 1
}

# 1. Symbol an einen festen Ort auf dem eigenen Rechner — nicht Desktop,
#    nicht Downloads, nicht OneDrive. Von dort findet Windows es immer.
try {
  New-Item -ItemType Directory -Force -Path $SYMBOL_ORDNER -ErrorAction Stop | Out-Null
  # Liegt das Programm schon im Zielordner, gibt es nichts zu kopieren
  if ((Resolve-Path $quelle).Path -ne [IO.Path]::GetFullPath($ziel)) {
    Copy-Item -Path $quelle -Destination $ziel -Force -ErrorAction Stop
  }
  try { Unblock-File -Path $ziel } catch { }
} catch {
  Write-Host ("Kann das Symbol nicht nach " + $SYMBOL_ORDNER + " legen: " + $_.Exception.Message) -ForegroundColor Red
  Read-Host "Enter zum Schliessen"; exit 1
}

# Ein Laufwerksbuchstabe wie W: ist nur eine Abkürzung für den Pfad auf dem
# Server. In der Verknüpfung steht der volle Serverpfad — so findet jeder
# PC das Symbol, auch wenn er das Laufwerk unter einem anderen Buchstaben kennt.
$symbolPfad = $ziel
if ($ziel -match '^([A-Za-z]):') {
  $lw = Get-PSDrive -Name $Matches[1] -ErrorAction SilentlyContinue
  if ($lw -and $lw.DisplayRoot -and $lw.DisplayRoot.StartsWith("\\")) {
    $symbolPfad = $lw.DisplayRoot.TrimEnd("\") + $ziel.Substring(2)
  }
}

# 2. Verknüpfung auf den Desktop — auch wenn der Desktop in OneDrive liegt
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $desktop "Hofer Tool.lnk"
$sh = New-Object -ComObject WScript.Shell
$v = $sh.CreateShortcut($lnk)

# Mit Edge als eigenes Fenster ohne Adresszeile; ohne Edge im Standardbrowser
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
          "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) {
  $v.TargetPath = $edge
  $v.Arguments = "--app=$ADRESSE"
} else {
  $v.TargetPath = "$env:WINDIR\explorer.exe"
  $v.Arguments = $ADRESSE
}
$v.IconLocation = "$symbolPfad,0"
$v.Description = "Hofer Tool"
$v.Save()

# 3. Windows das neue Symbol gleich zeigen lassen
try { & "$env:WINDIR\System32\ie4uinit.exe" -show } catch { }

Write-Host ""
Write-Host "Fertig: 'Hofer Tool' liegt auf dem Desktop." -ForegroundColor Green
Write-Host ("Symbol liegt in: " + $ziel) -ForegroundColor Gray
Write-Host ("In der Verknüpfung eingetragen: " + $symbolPfad) -ForegroundColor Gray
if ($edge) { Write-Host "Öffnet sich als eigenes Fenster ohne Adresszeile." -ForegroundColor Gray }
Read-Host "Enter zum Schliessen"
