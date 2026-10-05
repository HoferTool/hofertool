# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hofer + Co. Präzisionsdrehteile in Lohn-Ammannsegg, rund 20 Leute.

- **Planung im Büro** (Rollen `admin`, `planwand`): plant am PC auf der Planwand, verschiebt Aufträge, pflegt Bestellungen und Einstellungen. Braucht eine Oberfläche, die sich auf die eigene Arbeitsweise einstellen lässt.
- **Fertigung an den Maschinen** (Rollen `langdreher`, `kurzdreher`): arbeitet am Tablet im Pad Mode. Schaut Auftrag, Zeichnung, WBG und Einrichtblatt an und meldet Stückzahlen.
- **Mitarbeitende** (`mitarbeiter`): sehen alles, machen bei der Einkaufsliste mit.
- **Extern** (`extern`, Firma Zurbrügg): sieht nur Planwand und Produktion der eigenen Parks.

## Product Purpose

Die interne Web-App, die das infoBoard ablöst und Planung, Produktion, Einkauf, Dokumente und Absprachen der Firma an einem Ort bündelt: Planwand, Stückzahlen, Pad Mode, Bestellungen, Einkaufsliste, Werkstatt-Rechner, Notizen, Chat, Fahrzeuge, Dokumente.

## Positioning

Massgeschneidert für genau diesen Betrieb: Werkstofferkennung aus den eigenen Materialbezeichnungen, Einrichtblätter je Maschine, Abgleich mit dem Netzlaufwerk, Bestellmails im Firmenstil. Planende können die Oberfläche, etwa die Planwand, an sich anpassen (persönliche Einstellungen je Person).

## Operating Context

- Büro: Desktop-Browser, Tastatur (Taste H, Escape, Strg + K).
- Halle: Tablets an den Maschinen. Umgebung grob bestätigt (Abstand zum Bildschirm, Hallenlicht, Bedienung zwischen der Arbeit); genaue Geräte und Bedingungen sind noch nicht erfasst.
- Offline-Betrieb über Service Worker mit Warteschlange.
- Externe melden sich über einen Link mit `#/extern` an.

## Capabilities and Constraints

- Einzige feste Bedingung an die Technik: Die App bleibt **webbasiert**, also im Browser nutzbar. Heute ist sie eine einzige Datei `index.html` (HTML, CSS, JS als ES-Modul) ohne Build und ohne Frameworks. Das darf sich ändern, wenn es sich lohnt, etwa mit einem Build-Schritt oder einem Framework. Ausgeliefert über GitHub Pages. Daten in Supabase.
- Sprache: Deutsch in Schweizer Schreibweise („ss", Zahlen mit Apostroph wie 1'200).
- Die App muss schnell bleiben: Die Planwand lädt ein Jahr zurück und zeichnet höchstens einmal pro Bild. Nichts darf sie spürbar langsamer machen.
- Fachwörter: Auftrag, FA Nr., Park, Maschine, rüsten, QS, Einrichtblatt, WBG, Werkstoff.
- Feste Entscheidungen zu Planwand, Pad Mode, Produktion, Anmeldung und Bestellungen stehen in CLAUDE.md und werden nicht ohne Rückfrage geändert.

## Brand Commitments

- Name „Hofer Tool", Logo (`logo.png`, weisses Logo `LOGO_WEISS`), Symbol `hofer-tool.ico`.
- Werkstofffarben sind Bedeutung, nicht Dekor: V2A rot, V4A grau, Chromstahl rosa, Stahl blau, Alu weiss, Messing gelb, Neusilber orange.
- Zustandszeichen auf den Balken: ○ geplant, 🔧 rüsten, 🔍 QS, ▶ läuft, ✔ fertig, roter Punkt = keine Materialmenge.
- Anmeldeseite immer blau. Bestellmail in Aptos 12 mit den Logos von hoferco.ch und salt-pepper.ch.
- Wunsch des Auftraggebers (2. Oktober 2026): Die App soll moderner und dynamischer wirken, mit mehr Effekten und flüssigeren Übergängen, aber dadurch nicht langsamer werden.

## Evidence on Hand

- Prüfstand mit nachgebauter Datenbank in `pruefstand/`.
- Keine Kundenstimmen oder Kennzahlen zur Nutzung vorhanden; nichts davon erfinden.

## Product Principles

1. Tempo vor Effekt: Jede Bewegung und jeder Effekt muss auf einem Werkstatt-Tablet flüssig laufen; was bremst, fliegt raus.
2. Lesbar aus Arbeitsdistanz: Im Pad Mode zählen grosse Ziele und klarer Kontrast mehr als Dichte.
3. Planende stellen ihre Werkzeuge selbst ein; Anpassungen bleiben je Person erhalten.
4. Bedeutung bleibt fest: Werkstofffarben und Zustandszeichen werden nicht umgedeutet.
5. Einfach erklärt: Texte ohne Fachbegriffe aus der Informatik, Fachwörter aus der Fertigung bleiben.
