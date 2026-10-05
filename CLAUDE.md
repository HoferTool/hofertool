# Hofer Tool

Interne Web-App der **Hofer + Co. Präzisionsdrehteile** in Lohn-Ammannsegg. Darin stecken: Planwand der Aufträge, Stückzahlen in der Produktion, Pad Mode für Tablets an den Maschinen, Bestellungen, Einkaufsliste, Werkstatt-Rechner, Notizen, Dokumente und Einstellungen. Chat, Eierzähler, Fahrzeuge und Spassecke hatten schon vor dem Umbau keinen Knopf mehr und sind seit Oktober 2026 aus dem Code entfernt (im Git-Verlauf noch vorhanden). Ihre Tabellen in der Datenbank sind unverändert.

- **Live:** https://hofertool.github.io/hofertool/ — GitHub Pages aus diesem Repository (`HoferTool/hofertool`, Branch `main`). Der Ablauf `.github/workflows/ausliefern.yml` baut die App bei jedem Push auf `main` und stellt den Ordner `dist/` auf Pages (Pages-Quelle: „GitHub Actions“).
- **Vorschau:** https://hofertool.github.io/hofertool/vorschau/ — derselbe Ablauf baut zusätzlich den Zweig `claude/project-thread-eoqlna` (Effekte, Thread „Effekte und neues Design“) in den Ordner `vorschau/`, mit **denselben echten Daten**. Neu gebaut bei jedem Push auf `main` und nach jedem grünen Prüfstand auf dem Zweig. `sw.js` lässt alles unter `/vorschau/` in Ruhe. Live geht die Vorschau erst, wenn der Zweig in `main` übernommen wird.
- **Datenbank:** Supabase-Projekt `lzhqwbxfwqamauntehof`. Aufbau siehe **DATENBANK.md**.
- **Was bisher gebaut wurde:** siehe **VERLAUF.md**.
- **Stand:** Version 111.39.0 (Konstante `APP_VERSION` in `src/alt/app.js`).

## Mit wem du arbeitest

Der Auftraggeber ist **Saheesan Hudson**. Er ist Admin und arbeitet in der Fertigung, ist kein Programmierer.

- Er schreibt Deutsch, oft knapp und mit Tippfehlern. Antworte auf **Deutsch in Schweizer Schreibweise**: „ss" statt „ß", Zahlen mit Apostroph, also 1'200.
- Er will **fertige Ergebnisse** und **Schritt-für-Schritt-Anleitungen** ohne Fachbegriffe: wo klicken, was eintippen, was danach zu sehen ist.
- Er probiert alles selbst aus und schickt Bildschirmfotos. Nimm Rückmeldungen wörtlich. Bei Unklarheit lieber kurz nachfragen, als etwas Grosses falsch zu bauen.
- **Keine Passwörter oder geheimen Schlüssel** in Dateien oder Antworten wiederholen. Schickt er welche, weise freundlich darauf hin und empfiehl, sie neu zu setzen.

## Aufbau der App

- **Einzige feste Bedingung: Die App bleibt webbasiert.**
- **Vite + React, im Umbau (seit 3. Oktober 2026 live).** Bis Oktober 2026 war alles eine einzige `index.html`. Jetzt baut Vite aus `src/` die fertige Website in `dist/`.
  - `index.html` ist nur noch das Gerüst, das `src/main.jsx` lädt.
  - `src/alt/app.js` und `src/alt/stil.css` sind das bisherige Programm und die bisherige Gestaltung. Darin stecken noch die Planwand-Tafel (`zeichnePlanwand` mit Ziehen, Griffen und Wischen; sie bleibt bewusst das bewährte Zeichenprogramm), die Erkennung und das Hochladen von Dokumenten, Druckblätter und viele Helfer.
  - In React neu gebaut:
    - `src/seiten/`: Startseite (am Geburtstag Person mit Kuchen und Konfetti im blauen Band, `start/Geburtstag.jsx`), Bestellungen (mit Fenster „Neue Position“), Einkauf, Rechner-Reiter Drehzahl, Winkel, G-Code, C-Achse, Gravur und DXF (Vor- und Nachspann gemeinsam in `rechner/kopf.jsx`, Linienzüge in `rechner/geometrie.js`), Produktion (Erfassen, Fortschritt, Maschinenparks, Maschinentypen), Planwand-Seite mit Kopfleiste.
    - `src/huelle/`: Anmeldung, Kopfzeile und Navigation, Suche über alles.
    - `src/planwand/`: Auftragsfenster, Suche auf der Planwand, Ferienfenster, HOCO-Fenster.
    - `src/hoco/`: HOCO Nummern (Ordner, Suche, einzelnes Teil).
    - `src/einstellungen/`: Einstellungsfenster mit allen Reitern (Dokumente, Farben und Material, Nutzer).
    - `src/pad/`: Pad Mode mit Zifferblock und Werkzeugwechsel.
    - `src/teile/`: Fenster (`fensterOeffnen`), Dialoge (`nachfragen`, `dialogFelder`, `auswahlDialog`), Betrachter (PDF, Bild und Excel: `ExcelAnsicht.jsx`, `excelLesen.js`), Reiter. `src/daten/`: gemeinsame Daten.
  - `src/bruecke.jsx` verbindet beides: `reactSeite(Komponente)` hängt eine React-Seite in `SEITEN`, `<AltTeil zeichne={…}>` bettet einen noch alten Teil in eine React-Seite, und `alt` ist der Werkzeugkasten, den das alte Programm für React-Seiten füllt (`Object.assign(alt, {...})` nach `SEITEN`).
  - Umbau Bereich für Bereich; die App muss nach jedem Schritt vollständig laufen.
- Das Skript ist ein **ES-Modul**. Funktionen sind **nicht global** und im Browser-Terminal nicht aufrufbar.
- Supabase kommt über `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`. Adresse und **Publishable Key** stehen oben in `SUPABASE_URL` und `SUPABASE_KEY`. Der Key ist öffentlich und darf dort stehen.
- `public/sw.js` ist der Service Worker für den Offline-Betrieb. Beim Bauen trägt `vite.config.js` die Liste aller Dateien ein, damit das Tablet schon nach dem ersten Besuch offline startet.
- In `public/` (wird unverändert neben die index.html kopiert): `app.webmanifest`, Symbole (`icon-192.png`, `icon-512*.png`, `favicon.ico`, `hofer-tool.ico`), `login.png` und `logo.png`.

### Gliederung von index.html (Abschnittsüberschriften `//  NAME`)

RÜCKGÄNGIG · OFFLINE · EXTERNE GERÄTE · FEHLERPROTOKOLL · STARTSEITE · DOKUMENTE · REGELN FÜR DATEINAMEN · WBG AUFRÄUMEN · SOLARANLAGE · DATENSICHERUNG · RECHTE · DIALOGE · PRODUKTION · ERFASSEN · PLANWAND · WERKSTOFFE · SUCHE ÜBER ALLES · ÜBERSICHT · MASCHINEN VERWALTEN · MASCHINENTYPEN · PAD MODE · ZIFFERBLOCK · EINRICHTBLATT · EINRICHTBLATT ALS PDF · ARTIKEL UND LIEFERANTEN · BESTELLUNGEN · EINKAUFSLISTE · RECHNER FÜR DIE WERKSTATT · GRAVUR · FORTSCHRITT · LAUFENDER ABGLEICH

Die Seiten stehen in `SEITEN` (`dashboard`, `planwand`, `produktion`, `bestellungen`, `einkauf`, `rechner`), Navigation über den Hash, etwa `#/planwand`, mit `zeichneSeite()`. Einstellungen sind ein Fenster mit Reitern: Allgemein, Dokumente, Backup, Fehlerprotokoll, Farben und Material, Nutzer.

### Wichtige Bausteine

| Zweck | Funktion |
|---|---|
| HTML-Escaping | `esc(text)` — **immer** bei Daten im Markup |
| Meldung unten rechts | `meldung(text, art)` mit `art` = `"warn"`, `"fehler"`, `"gut"` |
| Fenster | `dialogFelder({titel, felder, bestaetigen})`, `nachfragen({...})`, `.dialog-huelle` |
| Zeitlimit | `zeitlimit(promise, ms, name)` |
| Ändern mit fehlenden Spalten | `aendernOhneUnbekannte(tabelle, daten, spalte, wert)` — lässt Spalten weg, die die Datenbank noch nicht kennt |
| Fehlerprotokoll | `fehlerMerken(was, text)` |
| Persönliche Einstellungen | `einstellungWert(name, standard)`, `einstellung(name)`, `einstellungAblegen(name, wert)` — am Konto (`profiles.einstellungen`) und je Person auf dem Gerät |
| Rechte | `istAdmin()`, `darfSchreiben()`, `darfPlanen()`, `istExtern()`, `seiteSichtbar(pfad)`, `meineRolle()` |
| Datum | `isoDatum`, `plusTage`, `arbeitstage(ab, n)`, `arbeitstagePlus(datum, n)`, `naechsterArbeitstag`, `wochenStart`, `kurzDatum`, `datumZeitKurz` — Arbeitstage = Mo–Fr. `arbeitstage` und `arbeitstagePlus` merken sich Ergebnisse. |
| Zahlen | `zahlText(n)` → `1'200` |
| Planwand | `plan` (Zustand), `ladePlanAuftraege(alle)`, `planAktualisieren(b)`, `zeichnePlanwand(b)`, `neuZeichnen(b)`, `planKonflikteRechnen/Loesen`, `planAufruecken`, `parallelSenden(aufgaben)`, `zuHeute(b)` |
| Werkstoffe | `werkstoffErkennen(bez)` → Gruppe und Farbe: V2A rot, V4A grau, Chromstahl rosa, Stahl blau, Alu weiss, Messing gelb, Neusilber orange |
| Pad Mode | `pad` (Zustand), `padZeichnen()`, `padStart`, `padParks`, `padMaschinen`, `padMaschine`, `padTextEinpassen()`, `betrachter(url, titel, istPdf)` |
| Abgleich | `syncPruefen()`, `serverStempel(tabellen)`, `dashboardTeile(b, still)`, `stillNeuZeichnen(id, fn)` |
| Dokumente | `dokErkennen(name, typen)`, `dokHochladen(datei, zuordnung, quelle)`, `DOK_REGELN` |
| Logo | `LOGO_WEISS` (eingebettetes PNG) |
| Bewegung | `planFliessenAnmelden(id)` vor dem Neuzeichnen der Planwand lässt verschobene Balken gleiten; `bewegungFenster`, `bewegungPad`, `wenigBewegung()` |
| Anmeldung mit PIN | `pinAnmelden(email, pin)` ruft die Server-Funktion `pin-anmelden` (Quelle in `supabase/functions/`), `pinMeldung(e)` macht den Text daraus. In der Datenbank: `pin_setzen`, `passwort_setzen` (Admin setzt anderen ein Passwort, ohne das alte zu kennen), `pin_entfernen`, `pin_vorhanden`, `pin_pruefen` (nur Server). Dialogfelder mit `ziffern: true` zeigen die Zifferntastatur. |

### Rollen

`admin`, `planwand`, `langdreher`, `kurzdreher` dürfen schreiben. `mitarbeiter` sieht alles und darf im Einkauf mitmachen. `extern` (Firma Zurbrügg) sieht nur Planwand und Produktion seiner Parks und meldet sich über einen Link mit `#/extern` an. Daneben gibt es `dienst` für das Dienstkonto des Netzlaufwerk-Abgleichs.

## So arbeitest du an der App

1. **Ändern** in `src/`. Neues baut man als React-Komponente in `src/seiten/`; Korrekturen an noch alten Bereichen in `src/alt/app.js`. Neue CSS-Regeln ans Ende von `src/alt/stil.css`. Die Kommentare im Code sind deutsch und erklären das **Warum**. Einmalig `npm install`.
2. **`APP_VERSION` hochzählen**: Neue Funktion → Minor, zum Beispiel 111.9.2 → 111.10.0. Korrektur → Patch.
3. **Bauen**: `npm run build`. Fehler im Code bricht hier ab. `npm run dev` startet eine Vorschau mit sofortigem Neuladen.
4. **Prüfen** mit dem Prüfstand (siehe unten). Für Neues einen eigenen kleinen Test schreiben, und Bildschirmfotos anschauen, wenn es ums Aussehen geht.
5. **Ausliefern**: committen und pushen. GitHub Pages ist nach ein bis zwei Minuten aktuell. Danach Strg + F5, weil der Service Worker sonst die alte Fassung zeigen kann.

### Datenbank-Änderungen

- **Immer als eigene Datei** in `sql/`, die der Auftraggeber im Supabase **SQL Editor** ausführt.
- **Gefahrlos mehrfach ausführbar**: `if not exists`, `drop policy if exists`, `create or replace`.
- Am Ende `notify pgrst, 'reload schema';` und eine **Probe**, die `ok` oder `FEHLT` zeigt.
- Im Kopf der Datei in einfachen Worten erklären, was sie tut.
- Die App so bauen, dass sie auch **ohne** das neue SQL nicht abstürzt: `aendernOhneUnbekannte` verwenden und eine verständliche Meldung zeigen.

### Prüfstand (`pruefstand/`)

- `fake-supabase.js` bildet Supabase im Browser nach, mit Beispieldaten in `TEST.daten` und jeder Anfrage in `TEST.protokoll`. Er filtert vereinfacht: `or()` und `not()` wirken nicht, und Abfragen liefern dieselben Objekte zurück, statt Kopien.
- `pruefstand.py` startet einen kleinen Webserver auf dem Repository und lädt `index.html`. Die Tests setzen den Nachbau mit Playwright anstelle der Supabase-Bibliothek ein.
- Einrichten: `pip install playwright` und `python -m playwright install chromium`.
- Der Prüfstand prüft die gebaute Fassung in `dist/`, also vorher `npm run build`. `npm run pruefen` macht beides. Eigener Chrome über `CHROME_PFAD`, anderer Anschluss über `PRUEFSTAND_PORT`. Bei jedem Pull Request läuft er auch auf GitHub (`.github/workflows/pruefen.yml`).
- Alle Tests: `cd pruefstand` und `python alle_tests.py`. Einzeln zum Beispiel `python final.py`. Am Ende jedes Tests steht `Fehler: keine`.
- `profil_planwand.py` misst, wie schnell der Zeitregler ist.

## Wichtige Entscheidungen — nicht ohne Rückfrage ändern

- **Planwand:** lädt alles Offene, alles Zukünftige und fest ein Jahr zurück. Älteres kommt nach, wenn man mit dem Zeitregler zurückfährt. Taste **H** und Knopf **Heute** springen auf den Montag vor zwei Wochen. Escape schliesst Fenster. Ein Klick auf einen Balken zeigt die Zeichnung, Doppelklick (Doppeltipp) öffnet das Auftragsfenster (Wunsch 3. Oktober 2026). Ohne Planrecht nur zum Ansehen: ändern lassen sich dort nur Zustand und Problem (Wunsch 4. Oktober 2026). Beim Verschieben weichen andere Aufträge aus, abgeschlossene werden nie verschoben. Danach kommt die Frage „Lücke lassen?". Löschen fragt nicht nach.
- **Balken:** Farbe = Werkstoff. Farben nur aus der Palette `PLANFARBEN`, kein freier Farbwähler (Wunsch 5. Oktober 2026); neue Farben mit „+“ im Auftragsfenster. Das Zeichen vorne zeigt den Zustand: ○ geplant, 🔧 rüsten, 🔍 QS, ▶ läuft, ✔ fertig. Ein roter Punkt ● bei „geplant" heisst: keine Materialmenge eingetragen.
- **Auftragsfenster:** keine Häkchen „FA erstellt" oder „Material da" mehr. In der Vorschau steht die FA Nr. oder „Kein FA vorhanden".
- **Suche auf der Planwand:** Reihenfolge „Neuester / Ältester Auftrag zuerst", Weiter und Zurück in der Leiste unten.
- **Startseite:** aktualisiert sich still, ohne sichtbares Neuladen. Die Personentabelle zählt nicht für den Abgleich. Oben in der Mitte steht das weisse Logo. Die Karte „Vorbereitung“ ist weg (Wunsch 4. Oktober 2026). An ihrer Stelle steht immer „Gemeldete Probleme“, ohne Meldung mit „Keine Probleme gemeldet“.
- **Notizen:** Jeder darf jede Notiz bearbeiten. Ein Vorschlagsverfahren war gewünscht und wurde wieder entfernt.
- **Pad Mode:** Die Startseite zeigt nur „Maschinen". Zeichnung, WBG und Einrichtblatt öffnen im gemeinsamen Betrachter, PDFs auf volle Breite, Excel-Einrichtblätter (seit 111.36.0) auf volle Breite mit Blattreitern. „Zurück" geht genau einen Schritt. Die Materialkachel ist in der Werkstofffarbe gefüllt. Der Text der Auftragskachel passt seine Grösse an die Menge an.
- **Produktion, Woche** (Wunsch 3. Oktober 2026): Die Tabelle nutzt die ganze Breite. Links je Maschine Zustand, Nummer, Balken für Stand und Ziel und die Knöpfe in einer Reihe; unter jedem Tag die Tagesleistung, rechts die Wochensumme. Der **Tag** zeigt dieselben Blöcke als Karten, so viele Spalten wie Platz ist, mit grossem Feld für den Zählerstand. Statt einer Suche filtern Knöpfe nach Maschinentyp (nur wenn im Park mindestens zwei Typen vorkommen).
- **Anmeldung:** immer blau, Kacheln alphabetisch. Punkt auf der Kachel = `ohne_passwort`. Solche Konten ohne PIN kommen mit einem Tipp hinein (Server-Funktion `pin-anmelden` mit `offen: true`, `offenAnmelden`, Entscheid 3. Oktober 2026), mit PIN wird nach der PIN gefragt, mit Ziffernblock. Alle anderen geben ihr Passwort ein. Der Server prüft sie: nach **5 falschen Versuchen 5 Minuten Sperre**, danach wieder 5 Versuche, immer so weiter. Wer eine PIN hat, hat ein zufälliges Passwort. Admins setzen PINs unter Einstellungen → Nutzer. Ein gemeinsames Passwort im Code gibt es nicht mehr. **Gerät merken** (Entscheid 3. Oktober 2026): Mit dem Häkchen „Auf diesem Gerät merken“ hebt das Gerät je Person den Erneuerungsschlüssel der Sitzung auf (`hofer.geraet.sitzungen`, `gemerktAnmelden`). Danach genügt dort ein Tipp auf die Kachel. „Abmelden“ meldet auf so einem Gerät nur lokal ab (`abmelden()`), damit der Schlüssel gültig bleibt.
- **Bestellmail:** eine `.eml`-Datei mit PDF im Anhang, Aptos 12, zwei Logos mit Link (hoferco.ch, salt-pepper.ch).
- **Bestellungen:** Den Status kann man auch in der Historie zurücksetzen. Jede Position zeigt `status_am`.

## Programme ausserhalb der App (`skripte/`)

Alle sind PowerShell 5.1 auf Windows, ohne Installation.

- **`solarlog.ps1`** holt alle fünf Minuten die Werte vom Solar-Log (`/getjp`, Abfrage 801/170) und liefert sie über `rpc/solar_melden` ins neue Projekt, mit eigenem Solar-Schlüssel aus `sql/solar.sql` in `solar-einstellungen.json` (kein Hauptschlüssel nötig). Anleitung: `anleitungen/Solar-Anleitung.md`. Bis Patrick sie umgesetzt hat, läuft im Betrieb noch das alte Skript ins alte Projekt, und das alte Projekt reicht die Werte über `sql/solar-weiterleiten.sql` (pg_net-Auslöser) ans neue weiter.
- **`dokumente-abgleich.ps1`** gleicht jede Minute einen Ordner auf dem Netzlaufwerk ab, mit dem Pfad aus der App, über ein Dienstkonto.
- **`dokumente-pool.ps1`** leert alle fünf Minuten den Pool-Ordner (WBG mit FA Nr., Excel-Einrichtblätter) in die App; `pool-einplanen.ps1` legt die Aufgabe an. Beide Dokument-Programme laden `dokumente-teile.ps1` (Erkennen und Hochladen wie `dokErkennen`/`dokZielSuchen`/`dokHochladen` in der App, Änderungen an beiden Stellen nachziehen). Anleitung `anleitungen/Pool-Anleitung.md`.
- **`sicherung.ps1` / `wiederherstellen.ps1`** sichern die Datenbank mit `pg_dump`.
- **`verknuepfung.ps1`** legt eine Desktop-Verknüpfung mit Symbol an.
- **Stolpersteine in PowerShell 5.1:** `"$var:"` in Anführungszeichen wird als Laufwerk gelesen, daher `${var}:` schreiben. Doppelte Anführungszeichen kommen bei anderen Programmen wie psql kaputt an. `2>&1` zusammen mit `ErrorActionPreference = Stop` bricht bei harmlosen Hinweisen ab. Dateien mit UTF-8 **mit BOM** speichern.

## Umzug (abgeschlossen am 1. Oktober 2026)

Altes Projekt `yvbtgiqtndxqqxhjshnl` und altes Repository `syshen69/hofer` — dort liegt nur noch eine Weiterleitung. Alles ist ins neue Konto umgezogen. Das alte Projekt soll pausiert werden, sobald `solarlog.ps1` umgestellt ist.

## Offene Punkte

1. `solarlog.ps1` im Betrieb auf das neue Projekt umstellen: neues Skript und Anleitung liegen bereit (`anleitungen/Solar-Anleitung.md`, 5. Oktober 2026), Patrick muss `sql/solar.sql` ausführen und das Skript am Solar-Rechner austauschen. Danach ist `solar-weiterleiten` im alten Projekt nicht mehr nötig.
2. Datenbank-Passwort und Secret Key des neuen Projekts neu setzen — sie standen im Chat.
3. Sicherung (`sicherung.ps1`) und Dokumente-Abgleich auf das neue Projekt umstellen.
4. Supabase Pro für tägliche Sicherungen. Altes Projekt pausieren. `C:\Hofer\Umzug` löschen.
5. Offline am Tablet einmal testen.
6. PIN-Anmeldung in Betrieb nehmen: `sql/pin-anmeldung.sql` ausführen und allen eine PIN oder ein Passwort setzen. `sql/offenes-passwort-weg.sql` **nie ausführen** (Entscheid 3. Oktober 2026), die Datei bleibt nur als Möglichkeit liegen. Die E-Mail-Adressen sind über `login_kacheln` weiterhin öffentlich lesbar.
7. Standzeiten der Werkzeuge aus `tool_changes.gehalten_stk` auswerten.
8. Offene Entscheide: infoBoard-Echtstart, ob der Park „Extern" für interne Rollen sichtbar ist, Lieferantenferien im Ferienblock, doppelte Namen in den Ferien.
9. Kameras später neu überlegen. Das alte Modul ist entfernt.

## Sicherheit

Das Repository ist **öffentlich**, weil GitHub Pages das kostenlos so verlangt. Darum gehören hier niemals hinein:

- Datenbank-Passwörter, `service_role`-Schlüssel oder `sb_secret_…`-Schlüssel
- Ausgaben mit echten Personendaten

`skripte/abgleich-einstellungen.json` ist eine **Vorlage** mit Platzhaltern.
