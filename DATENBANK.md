# Datenbank Hofer Tool

Supabase-Projekt **lzhqwbxfwqamauntehof** (Postgres 17, Region EU).
Stand: 2. Oktober 2026, aus dem Steckbrief des neuen Projekts.
Neu erzeugen: `sql/steckbrief.sql` im SQL-Editor ausführen.

Alle Tabellen liegen im Schema `public`, alle haben Zeilenschutz (RLS).

## Kern: Planung und Produktion

| Tabelle | Zweck | Wichtige Spalten |
|---|---|---|
| `jobs` | Aufträge auf der Planwand | `job_number` (= HOCO Nr., Format `10844-0049`), `machine_id`, `planned_from` (date), `planned_days` (Arbeitstage), `plan_status` (`geplant`, `ruesten`, `qs`, `laeuft`, `fertig`), `target_quantity`, `started_at`, `ended_at`, `color` (Name oder `#hex`), `plan_note` (Notiz; vor `sql/materialplatz.sql` stand darin auch „Material: …"), `material_platz` (wo das Material liegt, 111.41.0), `fa_nr`, `material_bez`, `material_menge`, `material_liefertermin` (beide Text; füllt der Auslöser `jobs_material_aus_notiz` aus „Mat BE: …“ in der Notiz, `sql/notiz-material.sql`), `drawing_url`, `wbg_url`, `problem`, `problem_at`, `problem_by`, `geaendert_von`, `geaendert_am`, `sort_order`; Altlasten: `fa_erstellt`, `material_ok` (werden beim Speichern aus `fa_nr` / `material_menge` abgeleitet) |
| `production_records` | Zählerstände | `machine_id`, `job_id`, `record_date`, `quantity` = **Gesamtzähler seit Auftragsbeginn**, nicht Tagesmenge |
| `machines` | Maschinen | `park_id`, `name`, `machine_number`, `type_id`, `sort_order`, `is_active` |
| `machine_parks` | Bereiche (Langdreher, Kurzdreher, Extern) | `name`, `sort_order` |
| `machine_types` | Maschinentypen (z. B. SW-20) | `name`, `blatt_url` (Einrichtblatt-Vorlage) |
| `hoco_parts` | Stammdaten je HOCO Nr. | PK `hoco_nr`, `bezeichnung`, `material`, `zeichnungs_nr`, `zeichnung_url`, `waschgebinde`, `infos` (seit 111.54.0 nicht mehr in der App, Daten bleiben) |
| `hoco_type_data` | Daten je HOCO Nr. **und** Typ | eindeutig (`hoco_nr`, `type_id`), `programm_nr`, `stueckzeit_s`, `blatt_url`, `abend_stk`, `pad_info` (Info an der Maschine). Eine Zeile je Typ, auf dem die Nummer gerüstet, gelaufen oder fertig wurde: trägt der Auslöser `jobs_typ_merken` selbst ein (`sql/hoco-typen.sql`) |
| `pad_skizzen` | Skizze im Pad Mode, eine je Auftrag | PK `job_id` (→ `jobs`, wird mitgelöscht), `striche` (jsonb: Liste von `{f: Farbe, d: Dicke, p: [x, y, …]}`, Punkte und Dicke geteilt durch die Breite der Fläche), `geaendert_am`, `geaendert_von`. Der Auslöser `jobs_skizze_weg` löscht die Zeile, sobald der Auftrag auf `fertig` geht (`sql/pad-skizze.sql`) |
| `notizbuecher` | Notizbücher (Startseite, Buch-Knopf bei den Notizen, 111.80.0) | `id`, `name`, `farbe` (#hex), `reihenfolge`, `erstellt_am`, `erstellt_von`, `geaendert_am`, `gesperrt` (Schloss, ändert nur `notizbuch_passwort`; Auslöser `notizbuecher_schloss`). Alle ausser Externen lesen und schreiben (`sql/notizbuecher.sql`) |
| `notizbuch_schutz` | Passwort eines gesperrten Notizbuchs (111.82.0) | PK `buch_id`, `passwort` (bcrypt), `fehlversuche`, `warten_bis`. Niemand liest direkt, nur die Funktionen `notizbuch_oeffnen(buch, passwort)` → `ok`/`falsch`/`warten:N`, `notizbuch_passwort(buch, alt, neu)` (leer = Sperre weg, immer mit altem Passwort), `notizbuch_passwort_admin(buch, neu)` (nur Admin, ohne altes) und `notizbuch_zu(buch)` (`sql/notizbuch-passwort.sql`) |
| `notizbuch_offen` | Wer welches gesperrte Buch geöffnet hat (111.82.0) | `buch_id`, `person`, `bis` (höchstens 8 Stunden). Die Regel auf `notizbuch_seiten` fragt `notizbuch_frei(buch_id)` |
| `notizbuch_seiten` | Seiten eines Notizbuchs | `buch_id` (→ `notizbuecher`, wird mitgelöscht), `titel`, `reihenfolge`, `inhalt` (jsonb: Liste wie bei `pad_skizzen` aus Strichen `{f, d, p}`, Textfeldern `{t: 1, h, x, y, g, f, b, m}` (b Breite, m Mindesthöhe) mit `<b> <i> <u> <s> <br>` und Bildern `{t: "bild", u, x, y, b, v, q, s, n}` und Tabellen `{t: "tab", z, x, y, b, g, f, v}` (z Zeilen mit Zellentext, v gemessene Höhe, seit 111.91.0); alles geteilt durch die Breite des Blatts; eingefügte PDFs sind je Seite ein Bild mit `q` = Adresse des PDFs), `geaendert_am`, `geaendert_von` |
| `vacations` | Ferien | `person` (Text), `zeile`, `von`, `tage`, `genehmigt` |
| `tool_changes` | Werkzeugwechsel | `machine_id`, `job_id`, `tool_nr`, `grund`, `stueckzahl`, `gehalten_stk` |
| `setup_sheets`, `setup_sheet_paths`, `setup_sheet_slots`, `setup_snapshots` | Einrichtblätter | |
| `type_paths`, `type_slots`, `tool_kinds` | Aufbau je Maschinentyp | |
| `quality_reports` | Ausschuss und Kontrolle | |

## Bestellungen und Einkauf

| Tabelle | Zweck | Wichtige Spalten |
|---|---|---|
| `order_items` | Bestellpositionen | `article_id`, `supplier_id`, `quantity`, `status` (`offen`, `bestellt`, `teilweise_geliefert`, `geliefert`), `status_am` (Zeitpunkt des letzten Statuswechsels), `ordered_at`, `delivered_at`, `completed_at`, `geliefert_menge`, `ziel_art`, `ziel_text`, `needed_by` |
| `articles` | Artikel | `article_number`, `name`, `unit`, `supplier_id` |
| `suppliers` | Lieferanten | `name`, `email`, `website`, `bestellweg` (`website` oder `mail`), `logo_url` (leer = Symbol der Website, `keins` = Buchstaben, sonst Bild; `sql/lieferant-logo.sql`) |
| `designations` | Bezeichnungen | |
| `shopping_items` | Einkaufsliste | `text`, `menge`, `laden`, `prio` (1–4), `is_done` |
| `storage_locations`, `stock_movements`, `stock_balances` | Lager (derzeit ungenutzt) | |

## Personen, Kommunikation, Sonstiges

| Tabelle | Zweck |
|---|---|
| `profiles` | Benutzer: `role` (`admin`, `planwand`, `langdreher`, `kurzdreher`, `mitarbeiter`, `produktion`, `extern`), `parks` (uuid[] für Extern), `ohne_passwort`, `einstellungen` (jsonb, persönliche Einstellungen), `initialen`, `bild_url`, `geburtstag`, `andere_nutzer` (Kachel bei der Anmeldung unter „Andere Nutzer“, `sql/andere-nutzer.sql`), `zuletzt_online` (Lebenszeichen der App über `ich_bin_da()`, Admins lesen es mit der letzten Anmeldung über `nutzer_status()`, `sql/nutzer-online.sql`) |
| `people` | Personen ohne Login (Geburtstage) |
| `materialausgabe` | Materialausgabe Extern auf der Startseite (111.99.0) | `text`, `raus_am`, `raus_von` (→ `profiles`), `rein_am` (leer = noch draussen), `rein_von` (→ `profiles`). Alle ausser Externen lesen und schreiben (`sql/materialausgabe.sql`) |
| `todos` | Notizen auf der Startseite |
| `chat_gespraeche`, `chat_teilnehmer`, `chat_nachrichten`, `chat_gelesen` | Chat |
| `fahrzeuge`, `fahrzeug_buchungen`, `fahrzeug_probleme` | Fahrzeuge |
| `dokumente`, `dokumente_verlauf` | Dokumentenpool und Verlauf |
| `dok_abruf` | Anfragen „WBG oder Zeichnung nachschauen“ aus der App (`art`, `hoco_nr`, `auftrag_id`, `fa_nr`), erledigt von `dokumente-abruf.ps1` (`angefangen`, `erledigt`, `ergebnis` = neu, gleich, keines, fehler, zu alt; `adresse`, `meldung`). Anlegen und lesen alle Angemeldeten, erledigen nur Dienstkonto oder Admin, nach zwei Tagen gelöscht. `sql/dok-abruf.sql` |
| `app_config` | Schlüssel/Wert: `werkstoff_zuordnung`, `zng_ordner` (Zeichnungs-Ordner: Pfad, Unterordner, Hochladen), `dok_pfad_status` (Stand des früheren `zeichnungen.ps1`, wird nicht mehr geschrieben), `dok_abruf_status` (Lebenszeichen von `dokumente-abruf.ps1`, alle 30 Sekunden, `sql/dok-abruf.sql`), `eb_ordner`, `eb_ordner_status`, `dok_pool_pfad`, `dok_pool_status`, `sicherung` (Speicherort, Uhrzeit, Tage), `sicherung_auftrag` (Jetzt sichern / Zurückspielen, nur Admin), `sicherung_status` (Stand von `sicherung.ps1`, Dienstkonto, `sql/sicherung.sql`) (Stände schreibt das Dienstkonto, `sql/dokumente-pool.sql`, `sql/einrichtblatt-ordner.sql`); `dok_regeln` und `dok_pfad` werden seit 111.61.0 nicht mehr gelesen (Stand schreibt das Dienstkonto, `sql/dokumente-pool.sql`), Bestellmail-Text u. a. |
| `farb_material`, `wash_containers` | Stammdaten |
| `solar_werte` | Solaranlage, gefüllt von aussen (`solarlog.ps1` über `solar_melden`); Startseite zeigt die letzten 24 h |
| `solar_zugang` | eine Zeile mit dem Solar-Schlüssel für `solarlog.ps1`; für App und Besucher ganz gesperrt (`sql/solar.sql`) |
| `ib_import` | Rohdaten des infoBoard-Imports (einmalig) |
| `eier_zaehler`, `eier_historie`, `game_scores` | Spass |

## Sichten

| Sicht | Zweck |
|---|---|
| `planwand` | Aufträge mit Maschine, Park, `stand` (letzter Zählerstand), `problem_von`, `geaendert_*`. **Mit `security_invoker`**, damit die Regeln für Externe greifen. Die App lädt sie seitenweise (je 1'000) mit `count: exact`. |
| `login_kacheln` | Kacheln auf der Anmeldeseite (läuft **ohne** Anmeldung; nicht auf `security_invoker` stellen) |
| `laufende_auftraege`, `werkzeugwechsel`, `einrichtblaetter`, `kontrolle_lesbar`, `artikel_uebersicht`, `bestand_je_platz`, `bewegungen_lesbar`, `typ_aufbau`, `solar_jetzt` | lesefreundliche Sichten |
| `ib_gedeutet`, `ib_ueberlappungen` | Hilfen für den infoBoard-Import |

## Rechte (RLS)

Die Regeln laufen über Hilfsfunktionen:

- `darf_lesen()` — angemeldet und aktiv
- `darf_schreiben()` — admin, planwand, langdreher, kurzdreher
- `darf_planen()` — darf Aufträge planen
- `bin_admin()`, `meine_rolle()`, `ist_extern()`
- `extern_darf_park(id)`, `extern_darf_maschine(id)` — Externe sehen nur ihre Parks und Maschinen
- `ist_teilnehmer(gespraech)` — Chat

Muster: Jede Tabelle hat `lesen` / `anlegen` / `aendern` / `loeschen`. Zusätzlich gibt es **restriktive** Regeln `extern gesperrt` beziehungsweise `extern nur eigene …`. Diese verwenden `(select public.ist_extern())`, damit die Funktion einmal pro Abfrage läuft statt einmal pro Zeile.

Beispiele: `jobs` löschen nur `bin_admin()`; `profiles` lesen alle, ändern nur sich selbst oder Admin; `app_config` schreiben nur Admin.

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
- `sicherung_lesen()` — alle Tabellen der App (ausser `pin_schutz`, `solar_zugang`, `sicherung_puffer`) in einem Aufruf als json `[{t, nr, zeilen}]`; `sicherung_dateien()` — Liste aller Dateien im Storage. Nur Admin und Dienstkonto.
- `sicherung_puffern(lauf, tabelle, zeilen)` und `sicherung_einspielen(lauf, tabellen)` — Zurückspielen über die Zwischenablage `sicherung_puffer`: in einer Transaktion Auslöser aus, Verweise erst am Schluss geprüft, Tabellen leeren und füllen, Zähler nachstellen, `app_config.sicherung*` bleibt. Admin immer, Dienstkonto nur mit offenem Auftrag eines Admins (danach `erledigt`). Personen ohne Anmeldekonto fallen weg.
- `ib_naechster_arbeitstag()`, `ib_plus_arbeitstage()`, `ib_letzter_tag()` — Arbeitstage wie in der App: Mo–Fr, keine Feiertage.

## Echtzeit

In der Publikation `supabase_realtime`: `jobs`, `vacations`, Chat-Tabellen. Die Planwand hört auf `jobs` und `vacations`.

## Dateiablage (Storage)

Ablagen: `zeichnungen` (öffentlich — Zeichnungen, WBG, Einrichtblätter, Dokumentenpool unter `dok/`), `profilbilder`, `chat`, `notizbuecher` (öffentlich, zufällige Namen `JJJJ/….jpg|pdf` — Bilder und PDFs der Notizbücher; beim Entfernen von der Seite bleiben die Dateien liegen, damit Rückgängig sie zurückholen kann).
