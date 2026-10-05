# Neuer Rechner: Solaranlage, WBG-Pool und Einrichtblätter

Ein Windows-Rechner im Betrieb übernimmt drei Aufgaben, jede alle
fünf Minuten:

- **Solar:** Werte vom Solar-Log holen und an die App liefern.
- **Pool:** WBGs aus `C:\Hofer\Pool` in die App laden und den Ordner
  leeren, siehe [Pool-Anleitung](Pool-Anleitung.md).
- **Einrichtblätter:** Excel-Einrichtblätter aus den Typ-Ordnern lesen
  und hochladen, ohne dort je etwas zu löschen. Bis du in der App
  einschaltest, nur Probelauf. Siehe
  [Einrichtblatt-Anleitung](Einrichtblatt-Anleitung.md).

Der Rechner muss im selben Netz wie der Solar-Log sein und sollte
immer laufen. Den alten Solar-Rechner brauchst du dafür nicht. Rechne
mit etwa 15 Minuten.

---

## 1. SQL ausführen (an einem beliebigen Rechner)

Hast du `sql/alles-2026-10-05.sql` schon ausgeführt, nimm nur den
Schlüssel: Die Datei nochmals laufen lassen ist gefahrlos, und der
Schlüssel bleibt derselbe.

1. [alles-2026-10-05.sql](https://github.com/HoferTool/hofertool/blob/main/sql/alles-2026-10-05.sql)
   öffnen, oben rechts auf **Copy raw file** (zwei Blätter) klicken.
2. Den [SQL Editor](https://supabase.com/dashboard/project/lzhqwbxfwqamauntehof/sql/new)
   öffnen, einfügen (Strg + V), unten rechts auf **Run** klicken.
3. Unten steht bei **Alles eingerichtet** `ok`. In der Zeile darunter
   steht **DEIN SOLAR-SCHLÜSSEL**. Den brauchst du in Schritt 3.

## 2. Dienstkonto anlegen (an einem beliebigen Rechner, einmal)

Mit diesem Konto lädt das Pool-Programm die Dateien hoch.

1. Supabase öffnen: [Authentication → Users](https://supabase.com/dashboard/project/lzhqwbxfwqamauntehof/auth/users)
2. Oben rechts **Add user** → **Create new user**.
3. E-Mail `abgleich@hoferco.ch` (die Adresse muss es nicht wirklich
   geben), ein langes Passwort ausdenken und notieren, **Auto Confirm
   User** anhaken, **Create user**.
4. In der App: **Einstellungen → Nutzer**, bei `abgleich@hoferco.ch`
   die Rolle **Dienstkonto** wählen.

## 3. Einrichten (am neuen Rechner)

1. Start-Knopf, **PowerShell** eintippen, mit Rechtsklick
   **Als Administrator ausführen**. Ein blaues Fenster geht auf.
2. Diese Zeile hineinkopieren (Rechtsklick fügt ein) und Enter drücken:

   ```
   [Net.ServicePointManager]::SecurityProtocol='Tls12'; iwr -UseBasicParsing https://raw.githubusercontent.com/HoferTool/hofertool/main/skripte/einrichten.ps1?t=$(Get-Random) -OutFile $env:TEMP\einrichten.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\einrichten.ps1
   ```

3. Das Programm führt dich durch:
   - Es holt die Programme nach `C:\Hofer\Abgleich`.
   - Es **sucht den Solar-Log selbst** im Netz. Findet es ihn nicht,
     fragt es nach der Adresse (steht am Display des Solar-Log oder
     im Router bei den verbundenen Geräten). Ist der Solar-Log mit
     einem Passwort geschützt, fragt es danach.
   - **Solar-Schlüssel:** den aus Schritt 1 einfügen.
   - **Dienstkonto:** E-Mail mit Enter bestätigen, das Passwort aus
     Schritt 2 eintippen (es bleibt unsichtbar).
   - Danach probiert es beides aus, ohne etwas zu schreiben. Richtig
     ist bei Solar `Probe: Erzeugung … W, Verbrauch … W` und
     `Probe: Schlüssel ok`.
   - Zum Schluss legt es in der Windows-Aufgabenplanung die Aufgaben
     **Hofer Solar**, **Hofer Dokumente-Pool** und **Hofer
     Einrichtblätter** an.
4. Bei **Fertig** Enter drücken. Das Fenster geht zu, das Einrichten
   ist damit vorbei.

Danach läuft alles nur noch über die **Aufgabenplanung**: Sie startet
alle fünf Minuten `solarlog.ps1`, `dokumente-pool.ps1` und
`einrichtblaetter.ps1`, die tun
ihre Arbeit und beenden sich sofort wieder. Es gibt keinen Dienst,
keinen Autostart und kein Programm, das im Hintergrund wartet.
Ansehen, anhalten oder löschen: Start-Knopf, **Aufgabenplanung**,
links **Aufgabenplanungsbibliothek**.

Etwas falsch eingetippt? Einfach die Zeile aus Schritt 3.2 nochmals
ausführen. Was stimmt, bleibt mit Enter stehen.

## 4. Läuft es?

Nach fünf bis zehn Minuten:

- Auf der Startseite der App zeigt die Solaranzeige die Uhrzeit von
  eben.
- Unter **Einstellungen → Dokumente → Pool-Ordner** steht, wann das
  Programm zuletzt lief.
- Eine WBG in den Ordner `C:\Hofer\Pool` legen. Nach fünf
  Minuten ist sie aus dem Ordner verschwunden und hängt am Auftrag.

Die Protokolle stehen in `C:\Hofer\Abgleich\solarlog.log` und
`C:\Hofer\Abgleich\pool.log`.

## Gut zu wissen

- **Anderer Pool-Ordner:** In der App unter **Einstellungen →
  Dokumente → Pool-Ordner** den Pfad eintragen (zum Beispiel
  `D:\Scans\Pool`) und auf **Ordner speichern** tippen. Ab dem
  nächsten Durchlauf nimmt das Programm diesen Ordner und legt ihn an,
  falls es ihn noch nicht gibt. Am Rechner musst du nichts ändern.

- Mit **Als Administrator** laufen beide Aufgaben immer, auch wenn
  niemand angemeldet ist und nach einem Neustart. Ohne Administrator
  nur, solange jemand angemeldet ist.
- `C:\Hofer\Abgleich\abgleich-einstellungen.json` enthält das
  Passwort des Dienstkontos. Diese Datei niemandem schicken.
- Der alte Solar-Rechner darf weiterlaufen. Die App nimmt höchstens
  einen Wert pro Minute an, doppelte Werte gibt es also nicht.
  Sobald jemand an den alten Rechner kommt, die Aufgabe dort löschen.
