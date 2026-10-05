# Pool-Ordner: WBGs einfach hineinlegen

Ein Ordner auf deinem Rechner, **nur für WBGs**. Was du hineinlegst,
holt ein kleines Programm alle fünf Minuten ab, hängt es in der App an
den richtigen Auftrag und löscht es danach aus dem Ordner.

Einrichtblätter kommen **nicht** in den Pool. Die liest ein eigenes
Programm aus den Typ-Ordnern, ohne dort etwas zu löschen, siehe
[Einrichtblatt-Anleitung](Einrichtblatt-Anleitung.md).

## So benennst du die Dateien

| Dateiname | Was passiert |
|---|---|
| `20268566 10007-0381.pdf` | WBG. Kommt an den **nächsten offenen Auftrag** der HOCO Nr. 10007-0381, der noch keine FA Nr. hat. Die FA Nr. 20268566 wird dort eingetragen. |
| gleiche FA Nr. nochmals | Die FA Nr. gibt es nur einmal: Die neue WBG ersetzt die alte am selben Auftrag. |
| `10007-0381 WBG.pdf` | WBG ohne FA Nr.: an alle offenen Aufträge der HOCO Nr. |
| alles andere (Excel, Zeichnung, …) | Wird **nicht gelöscht**, sondern in den Unterordner „nicht zugeordnet“ geschoben. |

Die Reihenfolge im Namen ist egal, Leerzeichen, Striche und
Unterstriche auch. Die FA Nr. hat 7 bis 10 Ziffern.

- **Auftrag noch nicht geplant?** Die WBG bleibt bis zu sieben Tage im
  Ordner liegen und wird alle fünf Minuten neu versucht.
- **Gar nicht zuzuordnen?** Die Datei kommt in den Unterordner
  „nicht zugeordnet“. Umbenennen und wieder in den Pool legen.
  Gelöscht wird nur, was als WBG hochgeladen ist.
- In der App unter **Einstellungen → Dokumente → Pool-Ordner** siehst
  du, wann das Programm zuletzt lief, was wartet und was nicht passte.
  Im **Verlauf** steht jede Datei mit „Pool-Ordner“ als Herkunft.

Dasselbe geht auch ohne Programm: In der App unter **Einstellungen →
Dokumente** die Dateien aus dem Explorer auf die Fläche „Dateien hierher
ziehen“ ziehen, die Zuordnung ansehen und auf **hochladen** tippen.

---

## Einrichten (einmal)

### 1. Datenbank

Im [Supabase SQL Editor](https://supabase.com/dashboard/project/lzhqwbxfwqamauntehof/sql/new)
den Inhalt von `sql/dokumente-pool.sql` einfügen und **Run**. Unten
muss zweimal `ok` stehen.

### 2. Dienstkonto

Wie in der Netzlaufwerk-Anleitung, Schritt 2: in Supabase einen
Benutzer anlegen (zum Beispiel `abgleich@hoferco.ch`, langes Passwort,
**Auto Confirm User**), danach in der App unter **Einstellungen →
Nutzer** die Rolle **Dienstkonto** geben. Hast du schon eins für das
Netzlaufwerk, nimm dasselbe.

### 3. Dateien ablegen

Ordner `C:\Hofer\Abgleich` anlegen und aus `skripte/` hineinlegen:

- `dokumente-pool.ps1`
- `dokumente-teile.ps1`
- `pool-einplanen.ps1`
- `abgleich-einstellungen.json`

In `abgleich-einstellungen.json` die Adresse, den Publishable Key und
E-Mail und Passwort des Dienstkontos eintragen. Die Datei enthält ein
Passwort: niemandem schicken.

Der Pool-Ordner ist `C:\Hofer\Pool`. Ein anderer geht in der App unter
**Einstellungen → Dokumente → Pool-Ordner**. Das Programm legt ihn an,
falls es ihn nicht gibt.

### 4. Probelauf (lädt nichts hoch, löscht nichts)

Ein paar Dateien in den Pool legen. Dann PowerShell öffnen:

```
cd C:\Hofer\Abgleich
powershell -ExecutionPolicy Bypass -File .\dokumente-pool.ps1 -Probe
```

Jede Datei steht da mit ihrem Ziel, etwa

```
20268566 10007-0381.pdf  →  WBG mit FA 20268566 an den Auftrag 10007-0381 vom 2026-10-12
```

### 5. Alle fünf Minuten laufen lassen

```
powershell -ExecutionPolicy Bypass -File .\pool-einplanen.ps1
```

Das legt in der Aufgabenplanung die Aufgabe **Hofer Dokumente-Pool**
an: alle fünf Minuten, solange du angemeldet bist. Entfernen mit
`.\pool-einplanen.ps1 -Weg`.

Lieber von Hand in der Aufgabenplanung? Programm `powershell.exe`,
Argumente `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Hofer\Abgleich\dokumente-pool.ps1"`,
Starten in `C:\Hofer\Abgleich`, Trigger „Wiederholen jede: 5 Minuten“.

**Protokoll:** `C:\Hofer\Abgleich\pool.log`
