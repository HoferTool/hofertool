# Einrichtblätter aus den Typ-Ordnern

Ein Programm schaut alle fünf Minuten in die Ordner mit den
Einrichtblättern, je Ordner ein Maschinentyp, und lädt neue und
geänderte Excel-Einrichtblätter in die App.

**Es liest nur.** In den Ordnern wird nie etwas gelöscht, verschoben,
umbenannt oder geändert. Es kopiert jede Datei zuerst auf den eigenen
Rechner und lädt die Kopie hoch; eine in Excel offene Datei stört
darum nicht.

## Was es nimmt

- Nur **Excel-Dateien** (`.xlsx`, `.xlsm`, `.xls`). PDF, CAD und alles
  andere bleibt unbeachtet liegen.
- Nur mit einer **HOCO Nr. im Namen**, egal was sonst dasteht:
  `10844-0049.xlsx`, `Werkzeugprotokoll 10844-0049.xlsx`,
  `10844-0049 neu.xlsm` sind alle das Einrichtblatt der HOCO Nr.
  10844-0049.
- Der **Typ kommt vom Ordner**, nicht vom Dateinamen.
- Liegen mehrere Excel-Dateien derselben HOCO Nr. im Ordner, zählt die
  **zuletzt geänderte**.
- Hochgeladen wird nur, was neu ist oder sich geändert hat. Hat die
  HOCO Nr. auf diesem Typ in der App schon ein Einrichtblatt, wird es
  dort ersetzt.

## Zuerst testen, dann einschalten

1. **SQL einmal ausführen**, damit die App den Probelauf zeigen kann:
   [einrichtblatt-ordner.sql](https://github.com/HoferTool/hofertool/blob/main/sql/einrichtblatt-ordner.sql)
   öffnen, **Copy raw file**, im
   [SQL Editor](https://supabase.com/dashboard/project/lzhqwbxfwqamauntehof/sql/new)
   einfügen, **Run**. Unten steht `ok`.
2. **Ordner eintragen:** In der App **Einstellungen → Dokumente →
   Einrichtblatt-Ordner**. Pfad eintragen, zum Beispiel
   `\\Server\Einrichtblätter\SW-20`, rechts den Maschinentyp wählen,
   bei Bedarf „mit Unterordnern“ anhaken. Mit **+ Ordner** weitere
   Ordner. **Ordner speichern**. Der Schalter **Hochladen** bleibt aus.
3. **Programm einrichten:** Am Rechner mit dem Pool die Zeile aus der
   [Neuer-Rechner-Anleitung](Neuer-Rechner-Anleitung.md), Schritt 3.2,
   nochmals ausführen (Als Administrator). Was schon eingetragen ist,
   bleibt mit Enter stehen. Am Schluss legt es die Aufgabe **Hofer
   Einrichtblätter** an und zeigt gleich einen Probelauf.
4. **Probelauf ansehen:** Nach fünf Minuten steht in der App unter
   **Einrichtblatt-Ordner** „Probelauf …“ und darunter die Liste:
   welche Datei, welche HOCO Nr., welcher Typ, und ob sie neu wäre
   oder ein vorhandenes Einrichtblatt ersetzen würde. Hochgeladen ist
   noch nichts.
5. **Einschalten:** Stimmt die Liste, den Schalter **Hochladen**
   einschalten und bestätigen. Ab dem nächsten Durchlauf lädt es hoch,
   höchstens 150 Dateien pro Durchlauf, der Rest folgt fünf Minuten
   später.

Ausschalten geht jederzeit mit demselben Schalter.

## Gut zu wissen

- Ordner auf einem anderen Rechner immer als `\\Server\Freigabe\…`
  eintragen, nicht mit einem Laufwerksbuchstaben wie `Z:`. Die
  Aufgabe kennt die Laufwerksbuchstaben oft nicht.
- Steht bei einem Ordner „Ordner nicht erreichbar“, findet die Aufgabe
  ihn nicht: Pfad prüfen. Die Aufgabe läuft unter dem Windows-Konto,
  mit dem du Schritt 3 gemacht hast, und nur, solange es angemeldet ist.
- Probelauf von Hand, im PowerShell-Fenster:
  `powershell -ExecutionPolicy Bypass -File C:\Hofer\Abgleich\einrichtblaetter.ps1 -Probe`
- Protokoll: `C:\Hofer\Abgleich\einrichtblaetter.log`
