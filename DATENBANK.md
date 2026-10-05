# Datenbank Hofer Tool

Supabase-Projekt **lzhqwbxfwqamauntehof** (Postgres 17, Region EU).
Stand: 2. Oktober 2026, aus dem Steckbrief des neuen Projekts.
Neu erzeugen: `sql/steckbrief.sql` im SQL-Editor ausführen.

Alle Tabellen liegen im Schema `public`, alle haben Zeilenschutz (RLS).

## Kern: Planung und Produktion

| Tabelle | Zweck | Wichtige Spalten |
|---|---|---|
| `jobs` | Aufträge auf der Planwand | `job_number` (= HOCO Nr., Format `10844-0049`), `machine_id`, `planned_from` (date), `planned_days` (Arbeitstage), `plan_status` (`geplant`, `ruesten`, `qs`, `laeuft`, `fertig`), `target_quantity`, `started_at`, `ended_at`, `color` (Name oder `#hex`), `plan_note` (Notiz, enthält auch „Material: …"), `fa_nr`, `material_bez`, `material_menge`, `material_liefertermin` (beide Text; füllt der Auslöser `jobs_material_aus_notiz` aus „Mat BE: …“ in der Notiz, `sql/notiz-material.sql`), `drawing_url`, `wbg_url`, `problem`, `problem_at`, `problem_by`, `geaendert_von`, `geaendert_am`, `sort_order`; Altlasten: `fa_erstellt`, `material_ok` (werden beim Speichern aus `fa_nr` / `material_menge` abgeleitet) |
| `production_records` | Zählerstände | `machine_id`, `job_id`, `record_date`, `quantity` = **Gesamtzähler seit Auftragsbeginn**, nicht Tagesmenge |
| `machines` | Maschinen | `park_id`, `name`, `machine_number`, `type_id`, `sort_order`, `is_active` |
| `machine_parks` | Bereiche (Langdreher, Kurzdreher, Extern) | `name`, `sort_order` |
| `machine_types` | Maschinentypen (z. B. SW-20) | `name`, `blatt_url` (Einrichtblatt-Vorlage) |
| `hoco_parts` | Stammdaten je HOCO Nr. | PK `hoco_nr`, `bezeichnung`, `material`, `zeichnungs_nr`, `zeichnung_url`, `waschgebinde`, `infos` |
| `hoco_type_data` | Daten je HOCO Nr. **und** Typ | eindeutig (`hoco_nr`, `type_id`), `programm_nr`, `stueckzeit_s`, `blatt_url`, `abend_stk`, `pad_info` (Info an der Maschine) |
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
| `profiles` | Benutzer: `role` (`admin`, `planwand`, `langdreher`, `kurzdreher`, `mitarbeiter`, `produktion`, `extern`), `parks` (uuid[] für Extern), `ohne_passwort`, `einstellungen` (jsonb, persönliche Einstellungen), `initialen`, `bild_url`, `geburtstag` |
| `people` | Personen ohne Login (Geburtstage) |
| `todos` | Notizen auf der Startseite |
| `chat_gespraeche`, `chat_teilnehmer`, `chat_nachrichten`, `chat_gelesen` | Chat |
| `fahrzeuge`, `fahrzeug_buchungen`, `fahrzeug_probleme` | Fahrzeuge |
| `dokumente`, `dokumente_verlauf` | Dokumentenpool und Verlauf |
| `app_config` | Schlüssel/Wert: `werkstoff_zuordnung`, `dok_regeln`, `dok_pfad`, `dok_pfad_status`, `dok_pool_pfad`, `dok_pool_status` (Stand schreibt das Dienstkonto, `sql/dokumente-pool.sql`), Bestellmail-Text u. a. |
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
- `ib_naechster_arbeitstag()`, `ib_plus_arbeitstage()`, `ib_letzter_tag()` — Arbeitstage wie in der App: Mo–Fr, keine Feiertage.

## Echtzeit

In der Publikation `supabase_realtime`: `jobs`, `vacations`, Chat-Tabellen. Die Planwand hört auf `jobs` und `vacations`.

## Dateiablage (Storage)

Ablagen: `zeichnungen` (öffentlich — Zeichnungen, WBG, Einrichtblätter, Dokumentenpool unter `dok/`), `profilbilder`, `chat`.
