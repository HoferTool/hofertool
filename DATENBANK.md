# Datenbank Hofer Tool

Supabase-Projekt **lzhqwbxfwqamauntehof** (Postgres 17, Region EU).
Stand: 2. Oktober 2026, aus dem Steckbrief des neuen Projekts.
Neu erzeugen: `sql/steckbrief.sql` im SQL-Editor ausführen.

Alle Tabellen liegen im Schema `public`, alle haben Zeilenschutz (RLS).

## Kern: Planung und Produktion

| Tabelle | Zweck | Wichtige Spalten |
|---|---|---|
| `jobs` | Aufträge auf der Planwand | `job_number` (= HOCO Nr., Format `10844-0049`), `machine_id`, `planned_from` (date), `planned_days` (Arbeitstage), `plan_status` (`geplant`, `ruesten`, `laeuft`, `fertig`; `qs` „QS Check“ bis 1.77.0), `target_quantity`, `started_at`, `ended_at`, `color` (Name oder `#hex`), `plan_note` (Notiz; vor `sql/materialplatz.sql` stand darin auch „Material: …"), `material_platz` (wo das Material liegt, 111.41.0), `abruf_info` (Abrufinformation, freier Text, 111.100.0, `sql/abruf-siegel.sql`), `geplant_von` (Siegel: Kürzel, mehrere mit „/“), `fa_nr`, `material_bez`, `material_menge`, `material_liefertermin` (beide Text; füllt der Auslöser `jobs_material_aus_notiz` aus „Mat BE: …“ in der Notiz, `sql/notiz-material.sql`), `drawing_url`, `wbg_url`, `problem`, `problem_at`, `problem_by`, `geaendert_von`, `geaendert_am`, `sort_order`, `symbole` (Ids der Symbole auf dem Balken, „id1,id2“, `sql/plan-symbole.sql`, auch in der Sicht `planwand`); Altlasten: `fa_erstellt`, `material_ok` (werden beim Speichern aus `fa_nr` / `material_menge` abgeleitet) |
| `production_records` | Zählerstände | `machine_id`, `job_id`, `record_date`, `quantity` = **Gesamtzähler seit Auftragsbeginn**, nicht Tagesmenge |
| `machines` | Maschinen | `park_id`, `name`, `machine_number`, `type_id`, `sort_order`, `is_active` |
| `machine_parks` | Bereiche (Langdreher, Kurzdreher, Extern) | `name`, `sort_order` |
| `machine_types` | Maschinentypen (z. B. SW-20) | `name`, `blatt_url` (Einrichtblatt-Vorlage), `stangen_mm` (3000), `stumpen_mm` (Rest-Stumpen, 250; 1.67.0) · `abstecher_mm` (Abstecherbreite, nur für die Materialmenge, 1.69.0) · `blatt_aufbau` (Lage der Werkzeugplätze auf dem Blatt in der App, `{geometrie, reihen}`, `sql/einrichtblatt-app.sql`) · `nc_ordner` (nur SW: Ordner der NC-Programme für GEO-OFFSET, 1.276.0) |
| `maschinen_unterlagen` | Handbücher, Schemas … je Maschine oder Typ (1.105.0) | `machine_id` oder `type_id`, `art`, `titel`, `url`, `pfad` (Ablage `zeichnungen`, `maschinen/…`), `dateiname`, `groesse`, `erstellt_am`, `erstellt_von`; lesen alle ausser Externen, schreiben alle mit Schreibrecht (seit 1.135.0, vorher nur Admins) |
| `maschinen_info` | Infos und Backup-Batterien je Maschine (1.134.0) | `machine_id` (Schlüssel), `info`, `batterie_gewechselt`, `batterie_faellig`, `batterie_hinweis` (Vorgabe true), `batterie_anzahl`, `batterie_art` (1.135.0), `geaendert_am`, `geaendert_von`; lesen alle ausser Externen, schreiben mit Schreibrecht |
| `maschinen_wartung` | Wartungshistorie je Maschine (1.134.0) | `machine_id`, `datum`, `text`, `anhaenge` (jsonb `[{url, pfad, name, typ, groesse}]`, Ablage `zeichnungen`, `maschinen/<id>/wartung/`), `erstellt_am`, `erstellt_von`, `geaendert_am`; lesen alle ausser Externen, schreiben mit Schreibrecht, löschen eigene oder Admin |
| `hoco_parts` | Stammdaten je HOCO Nr. | PK `hoco_nr`, `bezeichnung`, `material`, `zeichnungs_nr`, `zeichnung_url`, `waschgebinde`, `infos` (seit 111.54.0 nicht mehr in der App, Daten bleiben), `teil_d_mm`, `teil_laenge_mm`, `teil_mass_bestaetigt`, `teil_mass_quelle` (Fertigteil für die Mindestmenge, 1.67.0), `zeichnung_drehung` jsonb `{grad, url, von, pfad}` (in der App gedreht, 1.252.0, `sql/zeichnung-drehung.sql`) |
| `hoco_type_data` | Daten je HOCO Nr. **und** Typ | eindeutig (`hoco_nr`, `type_id`), `programm_nr`, `stueckzeit_s` (Sekunden pro Stück, Pflicht vor dem Beenden seit 111.101.0), `blatt_url`, `abend_stk`, `pad_info` (Info an der Maschine). Eine Zeile je Typ, auf dem die Nummer gerüstet, gelaufen oder fertig wurde: trägt der Auslöser `jobs_typ_merken` selbst ein (`sql/hoco-typen.sql`) |
| `einrichtblatt_app` | Einrichtblatt in der App (1.43.0, live seit 1.170.0) | eindeutig (`hoco_nr`, `type_id`), `programme` (je Path), `geometrie`, `maschine_nr`, `bemerkung`, `plaetze` (je T-Nr.: `taetigkeit`, `mass`, `hersteller`, `werkzeug`, `article_id`, `hd`, `standzeit`, `bild`, `geo` (Geo-Offset von Hand), `ohneBild`), `seiten` (weitere Seiten: `name`, `quer`, `html`; `sql/einrichtblatt-seiten.sql`), `kopf` (nur dieses Blatt: `fa_nr`, `n1000`, `festanschlag`, `anschlag_von`), `excel_url`, `gut_am`/`gut_von` (danach kein Excel mehr). Plätze beim Index als `R1-T1` … `R3-T10`. `sql/einrichtblatt-app.sql` |
| `nc_geo` | Geometrie-Programme der SW (Datei 4xxx) für die Seite GEO-OFFSET im Einrichtblatt (1.276.0) | Schlüssel (`type_id`, `nr` wie 4234), `datei`, `inhalt` (Text unverändert), `geaendert`, `gelesen_am`; schreibt `nc-geo.ps1` (Dienst) und Admin, lesen alle ausser Externen. `sql/nc-geo-offset.sql` |
| `pad_skizzen` | Skizze im Pad Mode, eine je Auftrag | PK `job_id` (→ `jobs`, wird mitgelöscht), `striche` (jsonb: Liste von `{f: Farbe, d: Dicke, p: [x, y, …]}`, Punkte und Dicke geteilt durch die Breite der Fläche), `geaendert_am`, `geaendert_von`. Der Auslöser `jobs_skizze_weg` löscht die Zeile, sobald der Auftrag auf `fertig` geht (`sql/pad-skizze.sql`) |
| `notizbuecher` | Notizbücher (Startseite, Buch-Knopf bei den Notizen, 111.80.0) | `id`, `name`, `farbe` (#hex), `reihenfolge`, `erstellt_am`, `erstellt_von`, `geaendert_am`, `gesperrt` (Schloss, ändert nur `notizbuch_passwort`; Auslöser `notizbuecher_schloss`). Alle ausser Externen lesen und schreiben (`sql/notizbuecher.sql`) |
| `notizbuch_schutz` | Passwort eines gesperrten Notizbuchs (111.82.0) | PK `buch_id`, `passwort` (bcrypt), `fehlversuche`, `warten_bis`. Niemand liest direkt, nur die Funktionen `notizbuch_oeffnen(buch, passwort)` → `ok`/`falsch`/`warten:N`, `notizbuch_passwort(buch, alt, neu)` (leer = Sperre weg, immer mit altem Passwort), `notizbuch_passwort_admin(buch, neu)` (nur Admin, ohne altes) und `notizbuch_zu(buch)` (`sql/notizbuch-passwort.sql`) |
| `notizbuch_offen` | Wer welches gesperrte Buch geöffnet hat (111.82.0) | `buch_id`, `person`, `bis` (höchstens 8 Stunden). Die Regel auf `notizbuch_seiten` fragt `notizbuch_frei(buch_id)` |
| `notizbuch_abschnitte` | Abschnitte eines Notizbuchs wie in OneNote (1.101.0, `sql/notizbuch-abschnitte.sql`) | `buch_id` (→ `notizbuecher`, wird mitgelöscht), `name`, `farbe`, `reihenfolge`. Gleiche Regel wie die Seiten (`notizbuch_frei`). Pad Mode: `notizbuch_pad_abschnitte`, `notizbuch_pad_seiten_ab` |
| `notizbuch_seiten` | Seiten eines Notizbuchs | `buch_id` (→ `notizbuecher`, wird mitgelöscht), `abschnitt_id` (→ `notizbuch_abschnitte`, wird mitgelöscht; fehlt sie, zeigt der erste Abschnitt die Seite), `titel`, `reihenfolge`, `inhalt` (jsonb: Liste wie bei `pad_skizzen` aus Strichen `{f, d, p}`, Textfeldern `{t: 1, h, x, y, g, f, b, m}` (b Breite, m Mindesthöhe) mit `<b> <i> <u> <s> <br>` und Bildern `{t: "bild", u, x, y, b, v, q, s, n}` und Tabellen `{t: "tab", z, x, y, b, g, f, v}` (z Zeilen mit Zellentext, v gemessene Höhe, seit 111.91.0); alles geteilt durch die Breite des Blatts; eingefügte PDFs sind je Seite ein Bild mit `q` = Adresse des PDFs), `geaendert_am`, `geaendert_von` |
| `qs_ausschuss` | Ausschuss für die Statistik (1.159.0) | Kopie jeder Meldung aus `qs_meldungen` (gleiche `id`), bleibt nach dem Quittieren mit `quittiert_am`, `quittiert_von`; schreibt nur der Auslöser `qs_ausschuss_merken` auf `qs_meldungen` (dort Spalte `quittiert_am`, von der App kurz vor dem Löschen gesetzt), lesen alle ausser Externen (`sql/qs-ausschuss.sql`) |
| `vacations` | Ferien | `person` (Text), `zeile`, `von`, `tage`, `genehmigt` |
| `tool_changes` | Werkzeugwechsel | `machine_id`, `job_id`, `tool_nr`, `grund`, `stueckzahl`, `gehalten_stk` |
| `setup_sheets`, `setup_sheet_paths`, `setup_sheet_slots`, `setup_snapshots` | Einrichtblätter | |
| `type_paths`, `type_slots`, `tool_kinds` | Aufbau je Maschinentyp | |
| `cam_aufbau` | CAM-Aufbau (1.224.0, `sql/cam.sql`; seit 1.247.0 von der App nicht mehr benutzt) | genau eines von `type_id` oder `machine_id`; `daten` jsonb: beim Typ `{steuerung, paths: {path_id: {aufgabe}}, plaetze: {T-Nr: {art, hinweis}}, mbefehle: [{id, funktion, code, hinweis}], notiz}`, bei der Maschine `{anders: {m_id: {code, hinweis}}, notiz}`; lesen alle ausser Externen, schreiben mit Schreibrecht |
| `cam_programme` | Eigene NC-Programme als Stilvorlage (1.224.0; seit 1.247.0 nicht mehr benutzt) | `type_id`, `machine_id`, `name`, `hoco_nr`, `notiz`, `inhalt` (Text), `erstellt_am`, `erstellt_von`; löschen eigene oder Admin |
| `quality_reports` | Ausschuss und Kontrolle | |

## Bestellungen und Einkauf

| Tabelle | Zweck | Wichtige Spalten |
|---|---|---|
| `order_items` | Bestellpositionen | `article_id`, `supplier_id`, `quantity`, `status` (`offen`, `bestellt`, `teilweise_geliefert`, `geliefert`), `status_am` (Zeitpunkt des letzten Statuswechsels), `ordered_at`, `delivered_at`, `completed_at`, `geliefert_menge`, `ziel_art`, `ziel_text`, `needed_by` |
| `articles` | Artikel | `article_number`, `name`, `unit`, `supplier_id`, `foto_merkmale` (gelernte Codes und Nummern der Verpackung), `foto_bilder` (Beispielfotos `[{url, pfad, am, von}]`, Ablage `zeichnungen/artikel/`; beide `sql/artikel-foto.sql`, 1.109.0) |
| `artikel_bild` | Bild des Artikels auf dem Einrichtblatt | `article_id` (Schlüssel), `bild` (`eigen:<id>` aus `eb_bilder`). `sql/einrichtblatt-bilder.sql` |
| `eb_bilder` | Hochgeladene Bilder für das Einrichtblatt | `name`, `url`, `pfad` (Ablage `zeichnungen`, `einrichtblatt/bilder/`). `sql/einrichtblatt-bilder.sql` |
| `eb_spezial` | Spezialwerkzeuge auf dem Einrichtblatt, kein Artikel | `name`, `hersteller`, `bild`. `sql/einrichtblatt-bilder.sql` |
| `suppliers` | Lieferanten | `name`, `email`, `website`, `bestellweg` (`website` oder `mail`), `logo_url` (leer = Symbol der Website, `keins` = Buchstaben, sonst Bild; `sql/lieferant-logo.sql`) |
| `designations` | Bezeichnungen | |
| `shopping_items` | Einkaufsliste | `text`, `menge`, `laden`, `prio` (1–4), `is_done` |
| `storage_locations`, `stock_movements`, `stock_balances` | Lager (derzeit ungenutzt) | |
| `material_posten` | Material-Übersicht (1.67.0) | `material` (Bezeichnung wie `jobs.material_bez`), `menge`, `einheit` (`kg`, `stg`), `ort`, `art` (`lager`, `bestellt`), `be_nr`, `lieferant`, `termin`, `notiz`, `ca` (Menge nur geschätzt, 1.143.0, `sql/material-ca.sql`), `job_id` (Rest aus diesem Auftrag, seit 1.71.0 auch: zugewiesen an diesen Auftrag), `fuer_hoco` (Rahmen: gehört allen Aufträgen dieser HOCO Nr., 1.71.0), `platz` (genauer Platz beim Zuweisen, 1.71.0, beide `sql/material-zuweisen.sql`), `erstellt_*`, `geaendert_*` (Auslöser), `weg_am`/`weg_von` (aufgebraucht, leer = noch da). Alle ausser Externen und Dienst lesen und schreiben (`sql/material-uebersicht.sql`) |

## Personen, Kommunikation, Sonstiges

| Tabelle | Zweck |
|---|---|
| `profiles` | Benutzer: `role` (`admin`, `planwand`, `langdreher`, `kurzdreher`, `mitarbeiter`, `produktion`, `extern`), `parks` (uuid[] für Extern), `ohne_passwort`, `einstellungen` (jsonb, persönliche Einstellungen; die App ändert je Wert über `einstellung_setzen(p_name, p_wert)`, `sql/einstellung-setzen.sql`), `initialen`, `bild_url`, `geburtstag`, `andere_nutzer` (Kachel bei der Anmeldung unter „Andere Nutzer“, `sql/andere-nutzer.sql`), `darf_materialplatz` (darf `jobs.material_platz` ändern, Admins immer; nur Admins setzen es; Auslöser `jobs_materialplatz_recht`, `sql/materialplatz-recht.sql`), `zuletzt_online` (Lebenszeichen der App über `ich_bin_da()`, Admins lesen es mit der letzten Anmeldung über `nutzer_status()`, `sql/nutzer-online.sql`) |
| `people` | Personen ohne Login (Geburtstage) |
| `druckauftraege` | Drucken über den Pool-Rechner (111.126.0) | `art` (bilder, excel), `quelle` (Excel-Adresse), `blatt`, `seiten` (JPG unter Ablage `druck`/`id`/1.jpg …), `kopien`, `drucker`, `zustand` (offen, druckt, fertig, fehler), `meldung`, `wer`. Anlegen alle ausser Externen, abarbeiten nur das Dienstkonto (`sql/drucken-pool.sql`). `app_config.druck` (gewählter Drucker, Admin und Planwand) und `druck_status` (Drucker am Pool-Rechner, Dienstkonto) |
| `materialausgabe` | Materialausgabe Extern auf der Startseite (111.99.0) | `text`, `an_wen` (seit 111.105.0), `raus_am`, `raus_von` (→ `profiles`), `rein_am` (leer = noch draussen), `rein_von` (→ `profiles`). Alle ausser Externen lesen und schreiben (`sql/materialausgabe.sql`) |
| `todos` | Notizen auf der Startseite |
| `chat_gespraeche`, `chat_teilnehmer`, `chat_nachrichten`, `chat_gelesen` | Chat |
| `fahrzeuge`, `fahrzeug_buchungen`, `fahrzeug_probleme` | Fahrzeuge |
| `dokumente`, `dokumente_verlauf` | Dokumentenpool und Verlauf |
| `app_config` | Schlüssel/Wert: `werkstoff_zuordnung`, `zng_ordner` (Zeichnungs-Ordner: Pfad, Unterordner), `dok_pfad_status` (Stand von `zeichnungen.ps1`), `eb_ordner`, `eb_ordner_status`, `dok_pool_pfad`, `dok_pool_status`, `sicherung` (Uhrzeit, Tage, Sicherungsgerät `geraet`), `sicherung_status` (letzte Sicherung, Fehler, Liste im Ordner; schreibt die App seit 111.109.0), `sicherung_auftrag` (nicht mehr gebraucht) (Stände schreibt das Dienstkonto, `sql/dokumente-pool.sql`, `sql/einrichtblatt-ordner.sql`); `dok_regeln` und `dok_pfad` werden seit 111.61.0 nicht mehr gelesen (Stand schreibt das Dienstkonto, `sql/dokumente-pool.sql`), Bestellmail-Text, `plan_symbole` (Symbole für die Balken: JSON `[{id, bild, text}]`, Bild als PNG-data-Adresse, nur Admin schreibt), `material_dichte` (eigene Dichte je Werkstoff, JSON `{"gr:v2a": 7.93, "nr:1.4305": 7.9}`, seit 1.86.0, nur Admin schreibt), `pad_mahnbilder` (Bilder je Art `{stueckzeit|stueckzahl|material: {person} oder {bild}}`; `material` seit 1.91.0 ist das GIF für „Material im Haus“ als Adresse in der Ablage `zeichnungen/meldungen/`, nur Admin schreibt) u. a. |
| `farb_material`, `wash_containers` | Stammdaten |
| `solar_werte` | Solaranlage, gefüllt von aussen (`solarlog.ps1` über `solar_melden`); Startseite zeigt die letzten 24 h |
| `solar_zugang` | eine Zeile mit dem Solar-Schlüssel für `solarlog.ps1`; für App und Besucher ganz gesperrt (`sql/solar.sql`) |
| `ib_import` | Rohdaten des infoBoard-Imports (einmalig) |
| `eier_zaehler`, `eier_historie`, `game_scores` | Spass |

## Sichten

| Sicht | Zweck |
|---|---|
| `planwand` | Aufträge mit Maschine, Park, `stand` (letzter Zählerstand), `problem_von`, `geaendert_*`, ab `sql/abruf-siegel.sql` auch `abruf_info`, `geplant_von` und `created_at`. **Mit `security_invoker`**, damit die Regeln für Externe greifen. Die App lädt sie seitenweise (je 1'000) mit `count: exact`. |
| `login_kacheln` | Kacheln auf der Anmeldeseite (läuft **ohne** Anmeldung; nicht auf `security_invoker` stellen) |
| `laufende_auftraege`, `werkzeugwechsel`, `einrichtblaetter`, `kontrolle_lesbar`, `artikel_uebersicht`, `bestand_je_platz`, `bewegungen_lesbar`, `typ_aufbau`, `solar_jetzt` | lesefreundliche Sichten |
| `ib_gedeutet`, `ib_ueberlappungen` | Hilfen für den infoBoard-Import |

## Rechte (RLS)

Die Regeln laufen über Hilfsfunktionen:

- `darf_lesen()` — angemeldet und aktiv
- `darf_schreiben()` — admin, planwand, langdreher, kurzdreher
- `darf_planen()` — darf Aufträge planen
- `bin_admin()`, `bin_planwand()` (Konto Planwand, `sql/planwand-dokumente-sicherung.sql`), `bin_dienst()`, `meine_rolle()`, `ist_extern()`
- `extern_darf_park(id)`, `extern_darf_maschine(id)` — Externe sehen nur ihre Parks und Maschinen
- `ist_teilnehmer(gespraech)` — Chat

Muster: Jede Tabelle hat `lesen` / `anlegen` / `aendern` / `loeschen`. Zusätzlich gibt es **restriktive** Regeln `extern gesperrt` beziehungsweise `extern nur eigene …`. Diese verwenden `(select public.ist_extern())`, damit die Funktion einmal pro Abfrage läuft statt einmal pro Zeile.

Beispiele: `jobs` löschen nur `bin_admin()`; `profiles` lesen alle, ändern nur sich selbst oder Admin; `app_config` schreiben nur Admin; Planwand darf die Schlüssel `dok_pool_pfad`, `eb_ordner`, `zng_ordner`, `sicherung` und `sicherung_status` (Regel `planwand dokumente und sicherung`) sowie `plan_symbole` und `bestellmail_text` (Regel `planwand einstellungen`), dazu `farb_material` (`sql/planwand-einstellungen.sql`), das Dienstkonto nur seine Stände.

## Funktionen und Auslöser

- `stempel(tabellen text[])` — Fingerabdruck (md5) der genannten Tabellen. Die App fragt damit alle 45 s, ob sich etwas geändert hat, statt Tabellen herunterzuladen.
- `jobs_geaendert_setzen()` — Auslöser `jobs_geaendert` setzt `geaendert_von` / `geaendert_am`.
- `setze_ersteller()`, `setze_aenderer()`, `setze_zeit()` — Auslöser `trg_ersteller`, `trg_aenderer`, `trg_zeit` auf vielen Tabellen.
- `auftragsnummer_zerlegen()` — Auslöser `trg_auftragsnummer` auf `jobs`.
- `profil_schutz()` — verhindert, dass jemand die eigene Rolle hochsetzt.
- `maschine_loeschbar()`, `park_loeschbar()`, `maschine_hart_loeschen()`, `park_hart_loeschen()`.
- `neuer_benutzer()` — legt bei neuem Login das Profil an.
- `solar_melden(schluessel, werte, nur_pruefen)` — nimmt Solarwerte von `solarlog.ps1` an (auch ohne Anmeldung aufrufbar), prüft den Solar-Schlüssel aus `solar_zugang`, höchstens ein Wert pro 50 s, löscht dabei Werte älter als 90 Tage. `nur_pruefen` prüft nur den Schlüssel.
- `solar_aufraeumen()` — löscht Solarwerte älter als 90 Tage (nur noch für den SQL Editor).
- `sicherung_lesen()` — alle Tabellen der App (ausser `pin_schutz`, `solar_zugang`, `sicherung_puffer`) in einem Aufruf als json `[{t, nr, zeilen}]`; `sicherung_dateien()` — Liste aller Dateien im Storage. Admin, Planwand, Dienstkonto und das Sicherungskonto.
- `sicherung_puffern(lauf, tabelle, zeilen)` und `sicherung_einspielen(lauf, tabellen)` — Zurückspielen über die Zwischenablage `sicherung_puffer`: in einer Transaktion Auslöser aus, Verweise erst am Schluss geprüft, Tabellen leeren und füllen, Zähler nachstellen, `app_config.sicherung*` bleibt. Admin und Planwand immer, Dienstkonto nur mit offenem Auftrag eines Admins (danach `erledigt`). Personen ohne Anmeldekonto fallen weg.
- `ib_naechster_arbeitstag()`, `ib_plus_arbeitstage()`, `ib_letzter_tag()` — Arbeitstage wie in der App: Mo–Fr, keine Feiertage.

## Echtzeit

In der Publikation `supabase_realtime`: `jobs`, `vacations`, Chat-Tabellen. Die Planwand hört auf `jobs` und `vacations`.

## Dateiablage (Storage)

Ablagen: `zeichnungen` (öffentlich — Zeichnungen, WBG, Einrichtblätter, Dokumentenpool unter `dok/`), `profilbilder`, `chat`, `temp` (nicht öffentlich, Temp-Ordner je Person unter `<Konto-Kennung>/`, nur die Person selbst liest und ändert, `sql/temp-ordner.sql`; Server-Funktion `temp-aufraeumen` löscht nach 24 Stunden; nicht in der Sicherung), `notizbuecher` (öffentlich, zufällige Namen `JJJJ/….jpg|pdf` — Bilder und PDFs der Notizbücher; beim Entfernen von der Seite bleiben die Dateien liegen, damit Rückgängig sie zurückholen kann).
