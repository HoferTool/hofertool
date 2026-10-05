' Startet ein PowerShell-Skript aus diesem Ordner ohne sichtbares Fenster.
' Die Aufgabenplanung ruft:  wscript.exe "C:\Hofer\Abgleich\unsichtbar.vbs" solarlog.ps1
' Warum: powershell.exe direkt zeigt trotz -WindowStyle Hidden kurz ein
' schwarzes Fenster. wscript hat selbst kein Fenster und startet PowerShell
' mit Fensterart 0 (versteckt). Es wartet auf das Ende, damit die
' Aufgabenplanung die Laufzeit und das Ergebnis richtig anzeigt.
' Nur ASCII-Zeichen: wscript liest keine UTF-8-Dateien.
Option Explicit
Dim sh, fso, ordner, skript, befehl
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ordner = fso.GetParentFolderName(WScript.ScriptFullName)
If WScript.Arguments.Count < 1 Then WScript.Quit 2
skript = fso.BuildPath(ordner, WScript.Arguments(0))
sh.CurrentDirectory = ordner
befehl = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & skript & """"
WScript.Quit sh.Run(befehl, 0, True)
