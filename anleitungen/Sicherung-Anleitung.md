# Sicherung für das Hofer Tool

Zwei Skripte:

- **sicherung.ps1** läuft jede Nacht und sichert alles
- **wiederherstellen.ps1** spielt eine Sicherung zurück, wenn etwas verloren ging

Gesichert werden die ganze App-Datenbank (Aufträge, Planwand, HOCO-Stammdaten, Einrichtblätter, Bestellungen, Regeln und Funktionen), die Anmeldekonten und alle hochgeladenen Dateien. Datenbank-Sicherungen werden 30 Tage aufbewahrt. Von den Dateien wird jede nur einmal geholt, danach nur noch neue.

---

## Einmal einrichten

### 1. PostgreSQL-Werkzeuge installieren

Von **enterprisedb.com** den Installer für **PostgreSQL 17** für Windows herunterladen. Bei der Auswahl der Bestandteile **nur „Command Line Tools"** ankreuzen, der Rest wird nicht gebraucht.

Wichtig: Version 17. Mit 15 oder älter lehnt Supabase die Verbindung ab.

### 2. Die Verbindung aus Supabase holen

Im Dashboard oben auf **Connect**, dann **Session pooler** wählen und die Zeile kopieren. Sie sieht ungefähr so aus:

```
postgresql://postgres.yvbtgiqtndxqqxhjshnl:[YOUR-PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres
```

`[YOUR-PASSWORD]` durch das **Datenbank-Passwort** ersetzen, samt den eckigen Klammern. Wer es nicht mehr weiss, setzt es unter **Database → Settings** neu. Das ist ein anderes Passwort als die Anmeldung an der App.

**Die ganze Zeile aus dem Dashboard übernehmen.** Der Teil mit `aws-0-…` hängt von eurem Rechenzentrum ab, der Wert in den Skripten ist nur ein Platzhalter.

### 3. Beide Skripte ausfüllen

Beide Dateien nach `C:\Hofer\` legen und oben jeweils eintragen:

- `$Verbindung`: die Zeile aus Schritt 2
- `$DienstSchluessel`: derselbe `service_role`-Schlüssel wie im Solar-Log-Skript

Beide Werte geben vollen Zugriff auf die Datenbank. Die Dateien bleiben auf diesem Rechner.

### 4. Einmal von Hand laufen lassen

```powershell
powershell -ExecutionPolicy Bypass -File C:\Hofer\sicherung.ps1
```

Am Ende muss **„Sicherung vollständig."** stehen. In `C:\Hofer\Sicherungen` liegen danach `app-….dump`, `anmeldungen-….sql`, `live-….txt` und der Ordner `Dateien`. Alles wird zusätzlich in `sicherung.log` festgehalten.

### 5. Jede Nacht automatisch

In der Aufgabenplanung wie beim Solar-Log eine Aufgabe anlegen:

- **Name:** Hofer Tool Sicherung
- **Allgemein:** „Unabhängig von der Benutzeranmeldung ausführen"
- **Trigger:** täglich um 02:00
- **Aktion:** Programm `powershell.exe`, Argumente `-ExecutionPolicy Bypass -File "C:\Hofer\sicherung.ps1"`

---

## Einmal zurückspielen üben — bitte nicht auslassen

Der kostenlose Plan erlaubt zwei Projekte. Das zweite dient als Übungsplatz:

1. In Supabase ein neues Projekt **hofer-test** anlegen.
2. In einer **Kopie** von `wiederherstellen.ps1` bei `$Verbindung` die Session-pooler-Zeile von **hofer-test** eintragen.
3. Die Kopie laufen lassen, bei den Dateien mit **n** antworten.
4. Am Ende zeigt die Probe die Anzahl Aufträge, Maschinen und HOCO-Nummern. Die Zahlen müssen zu eurem echten Projekt passen.

Im Testprojekt fehlen die Anmeldekonten. Meldungen, die `profiles` oder `auth.users` betreffen, sind dort deshalb normal. Danach kann **hofer-test** wieder gelöscht werden.

---

## Wenn wirklich etwas verloren ging

```powershell
powershell -ExecutionPolicy Bypass -File C:\Hofer\wiederherstellen.ps1
```

Das Skript zeigt die vorhandenen Sicherungen, fragt zweimal nach und spielt dann den gewählten Stand zurück. **Alles, was seit diesem Stand eingetragen wurde, ist danach weg.** Im Zweifel mich vorher fragen.

---

## Noch sicherer

Eine Sicherung auf demselben Rechner hilft nicht, wenn genau dieser Rechner ausfällt. Den Ordner `C:\Hofer\Sicherungen` deshalb regelmässig woanders hin kopieren, zum Beispiel auf ein NAS, einen USB-Stick oder OneDrive.
