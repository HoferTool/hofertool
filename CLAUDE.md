# Hofer Tool

Interne Web-App der **Hofer + Co. Präzisionsdrehteile** in Lohn-Ammannsegg: Planwand, Produktion, Pad Mode, Bestellungen, QS, NC-PRO/HOFERCAM, Test ERP, Kalkulation, QMS, HOFERTIME, Infoboard und mehr.

## Zuerst lesen: Kontext sparen

Diese Datei wird in **jede** Sitzung geladen. Sie war auf rund 600 KB angewachsen und füllte den Kontext schon beim Start (27. November 2026). Darum:

- **Diese Datei kurz halten (unter 25 KB).** Keine Verlaufs- oder Funktionsbeschreibungen mehr hier anhängen. Neues kommt in **VERLAUF.md** (was gebaut wurde) bzw. **ENTSCHEIDUNGEN.md** (Details, Wünsche, Regeln je Bereich). Hier nur die Versionsnummer in „Stand“ nachführen.
- **ENTSCHEIDUNGEN.md** ist die vollständige frühere CLAUDE.md (rund 600 KB) mit allen Details zu jedem Bereich. **VERLAUF.md** (rund 490 KB), `src/alt/app.js`, `src/alt/stil.css` und andere grosse Dateien **nie ganz lesen**: nur `grep -n "Begriff" Datei | head -20`, dann gezielt `sed -n 'von,bisp' Datei` (höchstens rund 80 Zeilen).
- Vor einer Änderung in einem Bereich die passende Stelle in ENTSCHEIDUNGEN.md suchen (`grep -n "HOFERCAM" ENTSCHEIDUNGEN.md | head`), dort stehen Patricks Wünsche, die nicht ohne Rückfrage geändert werden.
- **Ausgaben kurz halten:** `npm run build 2>&1 | tail -5`, Tests einzeln laufen lassen und mit `| tail -20` bzw. `| grep -E "FEHLER|Fehler:"` lesen. Keine Riesendateien, Bilder, JSON-Dumps oder Datenbank-Tabellen ganz ausgeben; bei SQL `limit` setzen.
- Bildschirmfotos nur ansehen, wenn es ums Aussehen geht, mit deviceScaleFactor 1.

## Adressen

- **Live:** https://hofertool.github.io/hofertool/ (GitHub Pages aus `HoferTool/hofertool`, Branch `main`, Ablauf `.github/workflows/ausliefern.yml` baut bei jedem Push auf `main` nach `dist/`).
- **Vorschau:** …/vorschau/ (Zweig `claude/project-thread-8yf89f`, Design „Präzision“), **Test:** …/test/ (Zweig `claude/project-thread-au2n7k`), beide mit echten Daten; `sw.js` lässt `/vorschau/` und `/test/` in Ruhe.
- **Datenbank:** Supabase-Projekt `lzhqwbxfwqamauntehof`, Aufbau in **DATENBANK.md**.
- **Stand:** Version 1.902.0 (Konstante `APP_VERSION` in `src/alt/app.js`). Am 9. Oktober 2026 von 111.127.0 auf 1.0.0 zurückgesetzt; „seit 111.x“ meint die alte Zählung.

## Mit wem du arbeitest

Der Auftraggeber ist **Saheesan Hudson** (in Chats und Notizen meist „Patrick“). Er ist Admin, arbeitet in der Fertigung und ist kein Programmierer.

- Antworte auf **Deutsch in Schweizer Schreibweise**: „ss“ statt „ß“, Zahlen mit Apostroph (1'200). Er schreibt oft knapp und mit Tippfehlern.
- Er will **fertige Ergebnisse** und **Schritt-für-Schritt-Anleitungen** ohne Fachbegriffe. Anleitungen nicht ins Repository, sondern in den Chat.
- Er probiert selbst aus und schickt Bildschirmfotos. Rückmeldungen wörtlich nehmen. Bei Unklarheit kurz nachfragen, statt Grosses falsch zu bauen.
- **Keine Passwörter oder geheimen Schlüssel** in Dateien oder Antworten wiederholen; schickt er welche, freundlich darauf hinweisen und Neusetzen empfehlen.

## Aufbau der App

- **Einzige feste Bedingung: Die App bleibt webbasiert.**
- **Vite + React** (live seit 3. Oktober 2026). `index.html` ist das Gerüst, das `src/main.jsx` lädt; Vite baut nach `dist/`.
- `src/alt/app.js` und `src/alt/stil.css` sind das alte Programm (Planwand-Tafel `zeichnePlanwand`, Dokumente, Druckblätter, Helfer). Gliederung über Abschnittsüberschriften `//  NAME`.
- React-Teile: `src/seiten/` (Seiten), `src/huelle/` (Anmeldung, Kopf, Navigation `Geruest.jsx`, `unterreiter.js`), `src/planwand/`, `src/hoco/`, `src/einstellungen/`, `src/pad/`, `src/notizbuch/`, `src/einrichtblatt/`, `src/infoboard/`, `src/teile/` (Fenster, Dialoge, Betrachter), `src/daten/` (Daten und Rechnung).
- `src/bruecke.jsx` verbindet beides: `reactSeite(Komponente)`, `<AltTeil zeichne={…}>`, Werkzeugkasten `alt`.
- Umbau Bereich für Bereich; die App muss nach jedem Schritt vollständig laufen.
- Das Skript ist ein **ES-Modul**, Funktionen sind nicht global.
- Supabase über `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`; Adresse und **Publishable Key** oben in `SUPABASE_URL`/`SUPABASE_KEY` (öffentlich, darf dort stehen).
- `public/sw.js` = Service Worker für Offline; `vite.config.js` trägt die Dateiliste ein. Grosse Zusatzdateien (pdfjs, occt, tesseract, faceapi, hilfe-Videos) sind nicht im Offline-Vorrat.
- **Schnell bleiben:** Grosse Module (NC-PRO, HOFERCAM, 3D …) nur mit `lazy`/`import()` laden (`faul()` in `NcFunktionen.jsx`). MutationObserver übergehen `.durchfahrt` und `.ib-nacht`.
- **Schonender Abruf:** alle `/rest/v1/`-Anfragen gehen über `schonenderAbruf` in `app.js` (gleiche Leseanfragen einmal, höchstens 10 gleichzeitig, Pause nach Serverfehlern). Realtime-Abgleiche mit zufälliger Streuung (`streuung`) bauen; neue Abfragen im Takt sparsam.
- **Materialmengen live:** wer Länge, Form, Material, Typwerte oder Faktoren speichert, ruft `materialTeilGeaendert`/`materialTypGeaendert`/`materialFaktorGeaendert` aus `src/daten/material.js`.
- **Fenster ohne seitliches Rollen:** nie breiter als der Bildschirm (ausser Papier-Blätter); prüfen an PC, iPad und Handy.
- **Dunkler Modus:** `body.dunkel *` macht Schrift weiss (`!important`); neue helle Flächen brauchen eine `body.dunkel`-Regel oder die Klasse `hell-bleibt`. Prüfen mit `pruefstand/kontrast.py`.
- **Briefkopf** für jedes erzeugte Dokument über `src/teile/briefkopf.js` (blauer Balken mit Logo und ISO-Siegel).
- **Neuladen wie vorher:** neue Fenster mit `fensterOeffnen(…, { art, daten })` und `wiederOeffner`, Zustand mit `teilMerken`; neue Seiten mit Reitern melden ihren Zustand an.
- **Suche je Seite:** Strg + F; neue Seiten melden ihre Suche mit `useSeitenSuche` (`src/teile/seitenSuche.js`) an.
- **Strg + Z überall:** Entwürfe melden sich mit `useEntwurfZurueck`/`lokalZurueckAnmelden` (`src/teile/lokalZurueck.js`) an.
- **Escape** schliesst nur das oberste Fenster bzw. geht eine Ebene zurück; neue Escape-Behandlungen prüfen und setzen `e.defaultPrevented`.
- **Löschen** fragt überall genau einmal nach.

### Wichtige Bausteine

| Zweck | Funktion |
|---|---|
| HTML-Escaping | `esc(text)`, immer bei Daten im Markup |
| Meldung | `meldung(text, art)` mit `"warn"`, `"fehler"`, `"gut"` |
| Fenster | `dialogFelder({titel, felder, bestaetigen})`, `nachfragen({...})`, `fensterOeffnen` |
| Zeitlimit | `zeitlimit(promise, ms, name)` |
| Fehlende Spalten | `aendernOhneUnbekannte(tabelle, daten, spalte, wert)` |
| Fehlerprotokoll | `fehlerMerken(was, text)` |
| Rückgängig | `merkeSchritt(text, schritte)`, `rueckSichern`, `rueckWeg`, `rueckRein`, `rueckSetz`, `rueckStand` |
| Einstellungen je Person | `einstellungWert(name, standard)`, `einstellung(name)`, `einstellungAblegen(name, wert)` |
| Rechte | `istAdmin()`, `darfSchreiben()`, `darfPlanen()`, `istExtern()`, `seiteSichtbar(pfad)`, `meineRolle()` |
| Datum | `isoDatum`, `plusTage`, `arbeitstage`, `arbeitstagePlus`, `kurzDatum`, `datumZeitKurz` |
| Zahlen | `zahlText(n)` → `1'200` |
| Planwand | `plan`, `ladePlanAuftraege`, `zeichnePlanwand`, `neuZeichnen`, `zuHeute` |
| Werkstoffe | `werkstoffErkennen(bez)`, `auftragFarbe(j, bez)` |
| Pad | `pad`, `padZeichnen()`, `betrachter(url, titel, istPdf)` |
| Dokumente | `dokErkennen`, `dokHochladen`, `DOK_REGELN` |
| Datumstasten | `src/teile/datumTasten.js` (T, W, M, J, −, H) |
| Schreibleiste | `src/teile/schreibleiste.js`, `data-ohne-leiste` schaltet ab |
| Dateien ablegen | `src/teile/dateiAblegen.js` (Basketball-Korb), `data-ablegen` |

### Rollen (kurz)

- `admin` sieht alles (ausser Zahlensprint ohne Vermerk). `planwand` (Gerätekonto), `mechaniker` dürfen schreiben; `mitarbeiter` sieht alles; `extern` (Firma Zurbrügg) nur Planwand und Produktion seiner Parks, ändert dort nur den Zustand; `dienst` für den Netzlaufwerk-Abgleich.
- Aufträge auf der Planwand ändern nur Admins (auch in der Datenbank gesperrt).
- **Neue Funktionen bekommen Externe nicht von selbst:** vorher Patrick fragen.
- Manche Bereiche nur mit Vermerk in `profiles.einstellungen` (z. B. `reihenSehen`); Details in ENTSCHEIDUNGEN.md.

## So arbeitest du an der App

1. **Ändern** in `src/`. Neues als React-Komponente in `src/seiten/`; Korrekturen am Alten in `src/alt/app.js`. Neue CSS-Regeln ans Ende von `src/alt/stil.css`. Kommentare deutsch, erklären das **Warum**. Einmalig `npm install`.
2. **`APP_VERSION` hochzählen:** neue Funktion → Minor, Korrektur → Patch. Danach die Versionsnummer in „Stand“ oben nachführen (nur die Nummer).
3. **Bauen:** `npm run build 2>&1 | tail -5` (baut auch `dist/archiv/`).
4. **Prüfen** mit dem Prüfstand; für Neues einen eigenen kleinen Test schreiben.
5. **Ausliefern:** committen und pushen; Pages ist nach ein bis zwei Minuten aktuell, danach Strg + F5.
6. **Verlauf:** was gebaut wurde, kurz in VERLAUF.md; neue Regeln und Wünsche je Bereich in ENTSCHEIDUNGEN.md (dort beim passenden Bereich ergänzen), **nicht hier**.

### Datenbank-Änderungen

- Immer als eigene Datei in `sql/`, gefahrlos mehrfach ausführbar (`if not exists`, `drop policy if exists`, `create or replace`), am Ende `notify pgrst, 'reload schema';` und eine Probe mit `ok` oder `FEHLT`, im Kopf einfach erklärt.
- Über die Supabase-Verbindung (`execute_sql`) hängen Befehle mit `drop` an einer Freigabe, die Patrick nicht sieht; darum ohne `drop` einspielen, wo es geht.
- **Festplatte schonen:** keine grossen Werte im Minutentakt schreiben; Status sparsam (`app_config_status_sparsam`).
- **Regeln immer mit `(select …)`**, z. B. `(select darf_lesen())`. Neue Spalten der Ansicht `planwand` direkt in ihre Spaltenliste.
- Die App muss auch **ohne** das neue SQL laufen (`aendernOhneUnbekannte`, verständliche Meldung).

### Prüfstand (`pruefstand/`)

- `fake-supabase.js` bildet Supabase nach (`TEST.daten`, `TEST.protokoll`; `or()`/`not()` wirken nicht).
- Prüft die gebaute Fassung in `dist/`, also vorher bauen; `npm run pruefen` macht beides. Läuft bei jedem Pull Request und jede Nacht auf GitHub.
- Einzeln: `cd pruefstand && python <test>.py 2>&1 | tail -20`; am Ende steht `Fehler: keine`. Alle: `python alle_tests.py` (gibt je Test eine Zeile aus). Nur das neu laufen lassen, was fehlschlug.
- Playwright und Chromium sind vorinstalliert (`chromium.launch()` ohne Optionen).

## Wichtige Entscheidungen (nicht ohne Rückfrage ändern)

Einzeiler; alle Details unter dem Stichwort in ENTSCHEIDUNGEN.md.

- **Neue QS ohne Sperren:** `QS_NEU = true`, `QS_SPERRE = false` in `src/daten/pruefbericht.js`.
- **Nichts wird mehr von selbst gelöscht** (WBGs, Temp, Keyence, Solar, Index-Protokoll), seit 1.814.0.
- **Planwand:** lädt Offenes, Zukünftiges und ein Jahr zurück; nie halbe Balken (`planNormalisieren` mit Schutz gegen Endlosschleife); laufende Aufträge verschieben fragt; nur Admins ändern; Betriebsferien KW 52/53 ausgeblendet; Doppelklick öffnet das Auftragsfenster, Klick markiert nur.
- **Balken:** Farbe = Werkstoff aus der Palette `PLANFARBEN`, Anschrift immer schwarz, Zustandszeichen vorne, rotes M ohne Material.
- **Auftragsfenster** geht auf der Planwand im eigenen Browserfenster auf; Abrufinformation Pflicht; Speichern schreibt nur geänderte Felder.
- **Anmeldung:** Passwort oder PIN Pflicht, 5 Fehlversuche = 5 Minuten Sperre; Abmelden nach 5 Minuten Leerlauf und spätestens nach 4 Stunden; Gerätekonten („Andere Nutzer“) nie von selbst.
- **Neue Fassung:** bei Anmeldung sofort, sonst höchstens einmal am Tag je Gerät; Bildschirme (Infoboard, Empfang, Pausenraum) stündlich und im Vollbild nur in der Ruhezeit.
- **Sicherung** macht die App selbst (ZIP ohne Zeichnungen/Einrichtblätter, mit `schema.sql` für Plan B); Planwand-Archiv und EB-PDF-Kopie täglich.
- **Pad Mode:** iPad merkt seine Maschine; Stückzahl, Stückzeit und Art. Info mit Mahnbildern; Beenden fragt Stückzahl, Stückzeit, Länge, Restmaterial.
- **Push-Mitteilungen, Pablo-Sprachassistent, Steckdosen, CAM, Lehrlinge, QM (alt), Lager (alt)** sind entfernt; nicht ohne Rückfrage wieder einbauen.
- **HOFERCAM:** Schritt für Schritt nur nach Patricks Beispielen bauen, nichts vorausbauen, fragen.
- **HOFERTIME** hat eine eigene Anmeldung und eigene Adresse …/hofertime/; Admin dort nur über `zeit_admins`.
- **Kundenzeichnungen, STEPs, Fotos von Personen, Rechnungs- und Personendaten nie ins Repository**, nur in der Datenbank bzw. Ablage.
- Die alte Adresse syshen69.github.io/hofer zeigt „Fehler: falscher Link“; nie eine Weiterleitung einbauen.

## Programme ausserhalb der App (`skripte/`)

PowerShell 5.1 auf Windows. Eine einzige Aufgabe **„HoferTool“** (`hofertool.ps1`, alle 5 Minuten, holt die neueste Fassung von `main`) ruft Solar, Dokumente-Pool, Zeichnungen, Einrichtblätter, Prüfberichte, NC-Geo, Code-Kopie auf; `drucken.ps1` und `keyence.ps1` laufen dauernd. `einrichten.ps1` richtet einen Rechner ein. Gemeinsame Teile in `dokumente-teile.ps1` (Änderungen auch in der App nachziehen). Stolpersteine: `${var}:` statt `"$var:"`, Dateien UTF-8 mit BOM. Details in ENTSCHEIDUNGEN.md.

## Offene Punkte (kurz)

- Datenbank-Passwort und Secret Key neu setzen (standen im Chat).
- Beim nächsten SQL mit Patrick am PC: `sql/push-weg.sql` und `sql/tipp-ohne-pin-weg.sql` einspielen, Server-Funktion `push-senden` löschen lassen.
- Für später: Mailfenster mit dem gemeinsamen Konto; Entra-Clientschlüssel läuft 24 Monate nach 2. November 2026 ab.
- Weitere offene Punkte in ENTSCHEIDUNGEN.md, Abschnitt „Offene Punkte“.

## Sicherheit

Das Repository ist **öffentlich** (GitHub Pages kostenlos). Darum gehören hier niemals hinein:

- Datenbank-Passwörter, `service_role`-Schlüssel oder `sb_secret_…`-Schlüssel
- Ausgaben mit echten Personendaten

`skripte/abgleich-einstellungen.json` ist eine **Vorlage** mit Platzhaltern.
