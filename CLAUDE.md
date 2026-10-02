# Hofer Tool

Interne Web-App der **Hofer + Co. Präzisionsdrehteile** in Lohn-Ammannsegg. Darin stecken: Planwand der Aufträge, Stückzahlen in der Produktion, Pad Mode für Tablets an den Maschinen, Bestellungen, Einkaufsliste, Werkstatt-Rechner, Notizen, Chat, Fahrzeuge, Dokumente und Einstellungen.

- **Live:** https://hofertool.github.io/hofertool/ — GitHub Pages aus diesem Repository (`HoferTool/hofertool`, Branch `main`, Ordner `/`).
- **Datenbank:** Supabase-Projekt `lzhqwbxfwqamauntehof`. Aufbau siehe **DATENBANK.md**.
- **Was bisher gebaut wurde:** siehe **VERLAUF.md**.
- **Stand:** Version 111.12.0 (Konstante `APP_VERSION` in `index.html`).

## Mit wem du arbeitest

Der Auftraggeber ist **Saheesan Hudson**. Er ist Admin und arbeitet in der Fertigung, ist kein Programmierer.

- Er schreibt Deutsch, oft knapp und mit Tippfehlern. Antworte auf **Deutsch in Schweizer Schreibweise**: „ss" statt „ß", Zahlen mit Apostroph, also 1'200.
- Er will **fertige Ergebnisse** und **Schritt-für-Schritt-Anleitungen** ohne Fachbegriffe: wo klicken, was eintippen, was danach zu sehen ist.
- Er probiert alles selbst aus und schickt Bildschirmfotos. Nimm Rückmeldungen wörtlich. Bei Unklarheit lieber kurz nachfragen, als etwas Grosses falsch zu bauen.
- **Keine Passwörter oder geheimen Schlüssel** in Dateien oder Antworten wiederholen. Schickt er welche, weise freundlich darauf hin und empfiehl, sie neu zu setzen.

## Aufbau der App

- **Einzige feste Bedingung: Die App bleibt webbasiert.** Heute ist sie eine einzige Datei `index.html` mit HTML, CSS und JavaScript, etwa 25'700 Zeilen, ohne Build, Frameworks und npm. Das darf sich ändern, etwa mit Build-Schritt, Aufteilung in Module oder einem Framework, wenn es sich lohnt. Ein solcher Umbau wird vorher mit dem Auftraggeber abgesprochen und nicht nebenbei begonnen.
- Das Skript ist ein **ES-Modul**. Funktionen sind **nicht global** und im Browser-Terminal nicht aufrufbar.
- Supabase kommt über `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`. Adresse und **Publishable Key** stehen oben in `SUPABASE_URL` und `SUPABASE_KEY`. Der Key ist öffentlich und darf dort stehen.
- `sw.js` ist der Service Worker für den Offline-Betrieb. Er liegt neben `index.html`.
- Weitere Dateien im Repository: `app.webmanifest`, Symbole (`icon-192.png`, `icon-512*.png`, `favicon.ico`), `login.png` und `logo.png`.

### Gliederung von index.html (Abschnittsüberschriften `//  NAME`)

RÜCKGÄNGIG · OFFLINE · EXTERNE GERÄTE · FEHLERPROTOKOLL · STARTSEITE · DOKUMENTE · REGELN FÜR DATEINAMEN · WBG AUFRÄUMEN · SOLARANLAGE · DATENSICHERUNG · RECHTE · DIALOGE · PRODUKTION · ERFASSEN · PLANWAND · WERKSTOFFE · SUCHE ÜBER ALLES · ÜBERSICHT · MASCHINEN VERWALTEN · MASCHINENTYPEN · PAD MODE · ZIFFERBLOCK · EINRICHTBLATT · EINRICHTBLATT ALS PDF · ARTIKEL UND LIEFERANTEN · BESTELLUNGEN · EINKAUFSLISTE · RECHNER FÜR DIE WERKSTATT · GRAVUR · SPASSECKE · FORTSCHRITT · LAUFENDER ABGLEICH · FAHRZEUGE

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
| Anmeldung mit PIN | `pinAnmelden(email, pin)` ruft die Server-Funktion `pin-anmelden` (Quelle in `supabase/functions/`), `pinMeldung(e)` macht den Text daraus. In der Datenbank: `pin_setzen`, `pin_entfernen`, `pin_vorhanden`, `pin_pruefen` (nur Server). Dialogfelder mit `ziffern: true` zeigen die Zifferntastatur. |

### Rollen

`admin`, `planwand`, `langdreher`, `kurzdreher` dürfen schreiben. `mitarbeiter` sieht alles und darf im Einkauf mitmachen. `extern` (Firma Zurbrügg) sieht nur Planwand und Produktion seiner Parks und meldet sich über einen Link mit `#/extern` an. Daneben gibt es `dienst` für das Dienstkonto des Netzlaufwerk-Abgleichs.

## So arbeitest du an der App

1. **Ändern** in `index.html`. Neue CSS-Regeln ans Ende des ersten `<style>`-Blocks, also vor das erste `</style>`. Die Kommentare im Code sind deutsch und erklären das **Warum**.
2. **`APP_VERSION` hochzählen**: Neue Funktion → Minor, zum Beispiel 111.9.2 → 111.10.0. Korrektur → Patch.
3. **Syntax prüfen**: den Inhalt des ersten `<script>` herausziehen und `node --check` darauf laufen lassen.
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
- Alle Tests: `cd pruefstand` und `python alle_tests.py`. Einzeln zum Beispiel `python final.py`. Am Ende jedes Tests steht `Fehler: keine`.
- `profil_planwand.py` misst, wie schnell der Zeitregler ist.

## Wichtige Entscheidungen — nicht ohne Rückfrage ändern

- **Planwand:** lädt alles Offene, alles Zukünftige und fest ein Jahr zurück. Älteres kommt nach, wenn man mit dem Zeitregler zurückfährt. Taste **H** und Knopf **Heute** springen auf den Montag vor zwei Wochen. Escape schliesst Fenster. Beim Verschieben weichen andere Aufträge aus, abgeschlossene werden nie verschoben. Danach kommt die Frage „Lücke lassen?". Löschen fragt nicht nach.
- **Balken:** Farbe = Werkstoff. Das Zeichen vorne zeigt den Zustand: ○ geplant, 🔧 rüsten, 🔍 QS, ▶ läuft, ✔ fertig. Ein roter Punkt ● bei „geplant" heisst: keine Materialmenge eingetragen.
- **Auftragsfenster:** keine Häkchen „FA erstellt" oder „Material da" mehr. In der Vorschau steht die FA Nr. oder „Kein FA vorhanden".
- **Suche auf der Planwand:** Reihenfolge „Neuester / Ältester Auftrag zuerst", Weiter und Zurück in der Leiste unten.
- **Startseite:** aktualisiert sich still, ohne sichtbares Neuladen. Die Personentabelle zählt nicht für den Abgleich. Oben in der Mitte steht das weisse Logo. „Vorbereitung" zählt nur geplante Aufträge der nächsten zwei Wochen.
- **Notizen:** Jeder darf jede Notiz bearbeiten. Ein Vorschlagsverfahren war gewünscht und wurde wieder entfernt.
- **Pad Mode:** Die Startseite zeigt nur „Maschinen". Zeichnung, WBG und Einrichtblatt öffnen im gemeinsamen Betrachter, PDFs auf volle Breite. „Zurück" geht genau einen Schritt. Die Materialkachel ist in der Werkstofffarbe gefüllt. Der Text der Auftragskachel passt seine Grösse an die Menge an.
- **Produktion, Woche:** drei Spalten (Nr. · Einrichtblatt, Menge, Beenden · Ziel, Stand, Zustand). Die Tabelle ist nur so breit wie nötig.
- **Anmeldung:** immer blau, Kacheln alphabetisch. Konten mit PIN (Punkt auf der Kachel) melden sich mit ihrer persönlichen PIN an. Der Server prüft sie: nach **5 falschen Versuchen 5 Minuten Sperre**, danach wieder 5 Versuche, immer so weiter. Wer eine PIN hat, hat ein zufälliges Passwort. Admins setzen PINs unter Einstellungen → Nutzer. Ein gemeinsames Passwort im Code gibt es nicht mehr.
- **Bestellmail:** eine `.eml`-Datei mit PDF im Anhang, Aptos 12, zwei Logos mit Link (hoferco.ch, salt-pepper.ch).
- **Bestellungen:** Den Status kann man auch in der Historie zurücksetzen. Jede Position zeigt `status_am`.

## Programme ausserhalb der App (`skripte/`)

Alle sind PowerShell 5.1 auf Windows, ohne Installation.

- **`solarlog.ps1`** (nicht hier, liegt im Betrieb) holt alle fünf Minuten die Werte vom Solar-Log und schreibt sie in `solar_werte`. **Schreibt noch ins alte Projekt.** Übergangsweise reicht das alte Projekt die Werte über `sql/solar-weiterleiten.sql` (pg_net-Auslöser) ans neue weiter.
- **`dokumente-abgleich.ps1`** gleicht jede Minute einen Ordner auf dem Netzlaufwerk ab, mit dem Pfad aus der App, über ein Dienstkonto.
- **`sicherung.ps1` / `wiederherstellen.ps1`** sichern die Datenbank mit `pg_dump`.
- **`verknuepfung.ps1`** legt eine Desktop-Verknüpfung mit Symbol an.
- **Stolpersteine in PowerShell 5.1:** `"$var:"` in Anführungszeichen wird als Laufwerk gelesen, daher `${var}:` schreiben. Doppelte Anführungszeichen kommen bei anderen Programmen wie psql kaputt an. `2>&1` zusammen mit `ErrorActionPreference = Stop` bricht bei harmlosen Hinweisen ab. Dateien mit UTF-8 **mit BOM** speichern.

## Umzug (abgeschlossen am 1. Oktober 2026)

Altes Projekt `yvbtgiqtndxqqxhjshnl` und altes Repository `syshen69/hofer` — dort liegt nur noch eine Weiterleitung. Alles ist ins neue Konto umgezogen. Das alte Projekt soll pausiert werden, sobald `solarlog.ps1` umgestellt ist.

## Offene Punkte

1. `solarlog.ps1` im Betrieb auf das neue Projekt umstellen, danach `solar-weiterleiten` im alten Projekt nicht mehr nötig.
2. Datenbank-Passwort und Secret Key des neuen Projekts neu setzen — sie standen im Chat.
3. Sicherung (`sicherung.ps1`) und Dokumente-Abgleich auf das neue Projekt umstellen.
4. Supabase Pro für tägliche Sicherungen. Altes Projekt pausieren. `C:\Hofer\Umzug` löschen.
5. Offline am Tablet einmal testen.
6. PIN-Anmeldung in Betrieb nehmen: `sql/pin-anmeldung.sql` ausführen, PINs setzen, dann `sql/offenes-passwort-weg.sql`. Die E-Mail-Adressen sind über `login_kacheln` weiterhin öffentlich lesbar.
7. Standzeiten der Werkzeuge aus `tool_changes.gehalten_stk` auswerten.
8. Offene Entscheide: infoBoard-Echtstart, ob der Park „Extern" für interne Rollen sichtbar ist, Lieferantenferien im Ferienblock, doppelte Namen in den Ferien.
9. Kameras später neu überlegen. Das alte Modul ist entfernt.

## Sicherheit

Das Repository ist **öffentlich**, weil GitHub Pages das kostenlos so verlangt. Darum gehören hier niemals hinein:

- Datenbank-Passwörter, `service_role`-Schlüssel oder `sb_secret_…`-Schlüssel
- Ausgaben mit echten Personendaten

`skripte/abgleich-einstellungen.json` ist eine **Vorlage** mit Platzhaltern.
