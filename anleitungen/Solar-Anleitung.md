# Solaranlage aufs neue Projekt umstellen

Heute schreibt das alte Skript `solarlog.ps1` die Werte ins **alte**
Supabase-Projekt, und das alte Projekt reicht sie ans neue weiter.
Nach dieser Anleitung schreibt ein neues Skript direkt ins neue
Projekt. Danach braucht die Solaranlage das alte Projekt nicht mehr.

Das neue Skript braucht keinen geheimen Hauptschlüssel des Projekts
mehr, sondern einen eigenen **Solar-Schlüssel**. Der darf nur
Messwerte abliefern, sonst nichts.

Rechne mit etwa 15 Minuten.

---

## 1. Datenbank vorbereiten (am eigenen Rechner)

1. Die Datei öffnen: https://github.com/HoferTool/hofertool/blob/main/sql/solar.sql
2. Oben rechts auf das Symbol **Copy raw file** (zwei Blätter) klicken.
3. Den SQL Editor öffnen: https://supabase.com/dashboard/project/lzhqwbxfwqamauntehof/sql/new
4. Einfügen (Strg + V) und unten rechts auf **Run** klicken.
5. Unten erscheint eine Tabelle. Bei den ersten zwei Zeilen steht `ok`.
   In der letzten Zeile steht **DEIN SOLAR-SCHLÜSSEL**, eine lange
   Reihe aus Zahlen und Buchstaben. Doppelklick darauf, kopieren und
   für Schritt 4 bereithalten.

Den Schlüssel nirgends sonst ablegen und nicht in den Chat schicken.
Wer ihn später wieder braucht, führt `solar.sql` einfach nochmals aus,
der Schlüssel bleibt derselbe.

## 2. Das alte Skript finden (am Solar-Rechner)

Das ist der Rechner im Betrieb, auf dem das Solar-Skript heute läuft.

1. Start-Knopf drücken, **Aufgabenplanung** eintippen, öffnen.
2. Links auf **Aufgabenplanungsbibliothek** klicken.
3. In der Liste die Aufgabe für die Solaranlage suchen (Name mit
   „Solar“). Doppelklick darauf, Reiter **Aktionen**.
4. Dort steht der Pfad zum Skript, zum Beispiel
   `C:\Hofer\solarlog.ps1`. Diesen Ordner im Explorer öffnen.
5. Rechtsklick auf `solarlog.ps1` → **Bearbeiten** (öffnet den Editor).
   Oben steht die Adresse des Solar-Log, etwa `http://192.168.1.50`.
   Aufschreiben. Steht dort auch ein **Passwort für den Solar-Log**,
   ebenfalls aufschreiben. Editor schliessen.
6. Die alte Datei umbenennen in `solarlog-alt.ps1`.

## 3. Die neuen Dateien holen

Beide Dateien in **denselben Ordner** wie in Schritt 2 speichern. So
bleibt die Aufgabenplanung, wie sie ist.

1. https://github.com/HoferTool/hofertool/blob/main/skripte/solarlog.ps1
   öffnen, oben rechts auf **Download raw file** (Pfeil nach unten).
2. https://github.com/HoferTool/hofertool/blob/main/skripte/solar-einstellungen.json
   öffnen, ebenso **Download raw file**.
3. Beide Dateien aus „Downloads“ in den Ordner aus Schritt 2 ziehen.
4. Rechtsklick auf die neue `solarlog.ps1` → **Eigenschaften**. Steht
   unten „Zulassen“ mit einem Kästchen, anhaken und **OK**.

## 4. Einstellungen eintragen

Rechtsklick auf `solar-einstellungen.json` → **Öffnen mit** → **Editor**.

- Bei `solarlog_adresse` die Adresse aus Schritt 2 eintragen.
- Bei `solar_schluessel` den Solar-Schlüssel aus Schritt 1 einfügen.
- Bei `solarlog_passwort` nur etwas eintragen, wenn das alte Skript
  ein Passwort für den Solar-Log hatte. Sonst leer lassen: `""`.

So sieht es danach aus (mit deinen Werten):

```json
{
  "solarlog_adresse": "192.168.1.50",
  "solarlog_passwort": "",
  "solar_schluessel": "3f9a…"
}
```

Die Anführungszeichen bleiben stehen. Speichern (Strg + S).

## 5. Ausprobieren

1. Im Ordner oben in die Adresszeile des Explorers klicken,
   `powershell` eintippen, Enter. Ein blaues Fenster geht auf.
2. Das hier hineinkopieren und Enter drücken:

   ```
   powershell -ExecutionPolicy Bypass -File .\solarlog.ps1 -Probe
   ```

3. Richtig ist, wenn zwei Zeilen erscheinen:
   `Probe: Erzeugung … W, Verbrauch … W, …` und
   `Probe: Schlüssel ok. Nichts geschrieben.`
   Die Zahlen sollten zu dem passen, was die Startseite gerade zeigt.

Kommt stattdessen eine Meldung, steht darin, was fehlt (Adresse,
Schlüssel, Passwort). Passt gar nichts, mir ein Bildschirmfoto davon
schicken und die alte Datei `solarlog-alt.ps1` dazu, **aber vorher**
die Zeile mit dem Schlüssel darin löschen.

## 6. Läuft es?

Die Aufgabenplanung startet das neue Skript ab jetzt von selbst,
weil es gleich heisst und am gleichen Ort liegt.

1. Fünf Minuten warten.
2. Im Ordner `solarlog.log` öffnen. Ganz unten steht eine Zeile mit
   `ok` und den Werten.
3. In der App auf der Startseite: Die Solaranzeige zeigt die Uhrzeit
   von eben.

## 7. Aufräumen, nach ein paar Tagen

- `solarlog-alt.ps1` löschen. Darin steht der geheime Schlüssel des
  alten Projekts, der wird danach nirgends mehr gebraucht.
- Danach darf das alte Supabase-Projekt pausiert werden, sobald auch
  Sicherung und Dokumente-Abgleich umgestellt sind.
