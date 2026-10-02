# Verlauf — was bisher gebaut wurde

Kurzfassung der Entwicklung, damit klar ist, warum etwas so ist, wie es ist. Neueste Version zuerst. Die Regeln und Entscheidungen stehen in CLAUDE.md.

## 111.x — nach dem Umzug (1.–2. Oktober 2026)

- **111.12.0** Anmeldung abgesichert: Das gemeinsame Passwort im Code ist weg. Jede Person mit Punkt auf der Kachel meldet sich mit ihrer eigenen PIN an. Die Server-Funktion `pin-anmelden` (in `supabase/functions/`) prüft sie über `pin_pruefen` und gibt einen einmaligen Schlüssel, den die App gegen eine Sitzung tauscht (`pinAnmelden`, `pinMeldung`). Nach 5 falschen Versuchen 5 Minuten Sperre, immer wieder. Admins setzen PINs unter Einstellungen → Nutzer, jede Person ihre eigene unter Allgemein. SQL `pin-anmeldung.sql`, danach `offenes-passwort-weg.sql`. Ohne SQL oder Server-Funktion zeigt die Kachel das Passwortfeld. Leitbild: Die App muss nur webbasiert bleiben, nicht zwingend eine Datei. Prüfstand: Test `pin`.
- **111.11.0** Pad: Nach dem Eintragen zählt die Stückzahl sichtbar vom alten zum neuen Stand hoch (`padZahlZaehlen`). Planwand: „Heute" und Taste H kommen als kurzer Schwung aus der Richtung, in die es geht (`planZeitSchwung`). Audit: Kleine Knöpfe bekommen am Tablet eine grössere Tippfläche, ohne anders auszusehen. Die Stückzahl-Felder der Produktion haben einen Namen für Vorleser. „Wetter nicht verfügbar" ist auf der blauen Karte wieder lesbar. PDF und WBG auf den Balken sind in der dunklen Ansicht lesbar. Prüfstand: Test „sieben" an die Pad-Startseite mit nur „Maschinen" angepasst.
- **111.10.0** Mehr Bewegung, ohne langsamer zu werden: Nach dem Verschieben gleiten ausweichende und aufschliessende Balken an ihren Platz, der abgelegte setzt sich (`planFliessenAnmelden`, `planBalkenGleiten`). Fenster blenden ein, auf dem Handy von unten. Das Pad legt sich über die Seite, neue Pad-Ansichten kommen mit Kacheln nacheinander herein, und dieselbe Ansicht lädt ohne „Wird geladen" neu. Meldungen fahren herein. Alles nur mit transform und opacity, bei „weniger Bewegung" nur Einblenden.
- **111.9.2** Pad: Startseite, Maschinenparks und Maschinenliste neu angeordnet — grosse Kacheln in der Mitte, scharfes weisses Logo, die Liste bricht von der Mitte aus um.
- **111.9.0** Pad: Der Textteil der Auftragskachel (Zeilen, Notiz, Info an der Maschine) wählt seine Schriftgrösse nach der Textmenge, bei sehr viel Text wird er scrollbar (`padTextEinpassen`).
- **111.8.2** Pad: Auf der Startseite nur noch „Maschinen".
- **111.8.1** Produktion, Woche: nur so breit wie nötig, auch die Karte darum.
- **111.8.0** Planwand-Suche: Reihenfolge „Neuester / Ältester Auftrag zuerst" statt vorwärts/rückwärts, Knöpfe „‹ Zurück" und „Weiter ›".
- **111.7.1** Startseite „Vorbereitung" zählt nur geplante Aufträge der nächsten zwei Wochen.
- **111.7.0** Materialfenster nach dem Verschieben wieder entfernt. Löschen ohne Rückfrage. Häkchen „FA erstellt" und „Material da" raus, in der Vorschau steht die FA Nr. oder „Kein FA vorhanden". Regler für Tage und Höhe breiter. Woche in drei Spalten. Pad: Seite darunter wird geleert, solange das Pad offen ist.
- **111.6.0** Grosses scharfes Logo auf der Startseite (`LOGO_WEISS`). Pad: Zeichnung und WBG im gemeinsamen Betrachter. PDFs mit `#view=FitH`.
- **111.5.x** Startseite still aktualisieren (`stillNeuZeichnen`), Personen nicht mehr im Abgleich. Pad: „Zurück" geht einen Schritt. Materialkachel gefüllt. Woche breiter. Anmeldekacheln alphabetisch. PIN-Anmeldung (`pinPasswort`). Wetter im Pad mit „14.00".
- **111.4.0** Bestellungen: Status auch in der Historie änderbar, `status_am` bei jeder Position (SQL `bestellstatus-zeit.sql`).
- **111.3.0** Notizen wieder frei bearbeitbar. Ein Vorschlagsverfahren gab es kurz und wurde verworfen. Taste **H** für „Heute".
- **111.2.0** Planwand flüssiger: Arbeitstage gemerkt und in Wochensprüngen gerechnet, Vorfilter nach Datum, der Scroll-Rahmen bleibt stehen, Zeichnen höchstens einmal pro Bild. Lädt ein Jahr zurück. Knopf „Heute". Excel in den Einstellungen unter „Backup". Escape schliesst das Infofenster.
- **111.1.0** Persönliche Einstellungen je Person. Anmeldeseite immer blau. Woche mit voller Auftragszeile. Symbol `hofer-tool.ico`.
- **111.0.x** App auf das neue Supabase-Projekt umgestellt. Ältere Aufträge laden beim Zurückfahren nach. Bestellmail mit grossen Logos und Aptos 12.

## Umzug (1. Oktober 2026)

Von `syshen69/hofer` und Supabase `yvbtgiqtndxqqxhjshnl` nach `HoferTool/hofertool` und `lzhqwbxfwqamauntehof`. Mitgekommen sind alle Tabellen, Daten, Logins mit Passwörtern und Dateien. Die alte Adresse leitet weiter. Werkzeug war ein PowerShell-Umzugsprogramm (pg_dump/psql, Storage-API). Offen: `solarlog.ps1` umstellen und das alte Projekt pausieren.

## 110.x — vor dem Umzug

- **110.9.x** Bestellmail mit Logos (hoferco.ch, salt-pepper.ch).
- **110.8.x** Kamera-Modul und Scanner-Reste entfernt.
- **110.7.0** Schnellerer Abgleich: Datenbankfunktion `stempel()` statt Tabellen herunterladen. Die Planwand lädt nur noch den sichtbaren Zeitraum.
- **110.6.1** Ein als extern markiertes Gerät wird beim Anmelden eines internen Kontos zurückgesetzt, ausserdem gibt es den Link `#/intern`.
- **110.5.0** Netzlaufwerk-Abgleich (`dokumente-abgleich.ps1`), Dienstkonto-Rolle.
- **110.4.0** Dokumente: Regeln für Dateinamen selbst festlegen, tolerante Erkennung, Ersetzen statt Anhäufen, Verlauf, WBG fünf Tage nach Auftragsende aufräumen.
- **110.3.0** Verschieben schneller: gleichzeitige Übertragung, abgeschlossene Aufträge bleiben stehen.
- **110.0–110.2** Rolle Extern (Zurbrügg) mit Datenbankregeln. „Zuletzt geändert von".

## 102–109 — Ausbau

Excel-Export · Ferienblock als ein Block · beliebige Farben und Farbwähler · Werkstofferkennung aus sechs Werkstofftabellen (98 % der infoBoard-Materialien erkannt) · Mail mit PDF als `.eml` · Teillieferung mit Menge · Ist/Soll auf den Balken · Sprung vom Problem zum Balken · Offline mit Warteschlange (`sw.js`) · Fehlerprotokoll · Zifferblock im Pad · Suche über alles (Strg + K) · Solarverlauf Tag/Woche/Monat · Materialkachel im Pad · Kopieren und Einfügen von Aufträgen · Rückgängig für Speichern · Zeitregler unter den Tagen.

## Bis 101 — Grundlagen

Planwand mit Ziehen, Verlängern, Nachrücken und Lücke schliessen · Produktion mit Tag und Woche · Pad Mode · Einrichtblätter mit Typen, Pfaden und Plätzen · Bestellungen mit Lieferanten und Artikeln · Einkaufsliste · Werkstatt-Rechner · Chat · Fahrzeuge · Ferien · infoBoard-Import (2'593 Balken, 659 Ferieneinträge) · Rollen und Rechte.
