---
name: Hofer Tool
description: Interne Werkstatt-App der Hofer + Co. Präzisionsdrehteile, hell im Büro, dunkel an der Maschine.
colors:
  firmenblau: "#003884"
  firmenblau-tief: "#002b66"
  firmenblau-hauch: "#e8eef7"
  grund: "#f3f5f8"
  flaeche: "#ffffff"
  tinte: "#1d2430"
  gedaempft: "#5c6675"
  linie: "#d6dbe3"
  linie-stark: "#aeb7c4"
  gut: "#1f7a4d"
  warnung: "#b5761a"
  gefahr: "#b3261e"
  nacht-grund: "#14181d"
  nacht-flaeche: "#1c2229"
  nacht-marke: "#6ba4ff"
  pad-tiefe: "#0a1220"
  pad-karte: "#111d31"
  pad-karte-tief: "#0d1726"
  pad-text: "#eaf1fb"
  pad-gedaempft: "#8b9db8"
  pad-blau: "#1f6fe0"
  werkstoff-stahl: "#003884"
  werkstoff-v2a: "#b3261e"
  werkstoff-v4a: "#7a838d"
  werkstoff-chromstahl: "#d4638f"
  werkstoff-alu: "#ffffff"
  werkstoff-messing: "#f0b429"
  werkstoff-messing-ohne-blei: "#c9922a"
  werkstoff-neusilber: "#c2650f"
  werkstoff-titan: "#5b3a9e"
  werkstoff-kunststoff: "#0d7d8c"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  table:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: ".92rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: ".85rem"
    fontWeight: 600
    lineHeight: 1.3
  pad-overline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: ".7rem"
    fontWeight: 600
    letterSpacing: ".12em"
  mono:
    fontFamily: "ui-monospace, Menlo, Consolas, monospace"
    fontSize: ".85rem"
rounded:
  buero: "4px"
  balken: "3px"
  pille: "999px"
  pad-knopf: "14px"
  pad-karte: "22px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "16px"
  xl: "28px"
  kopf: "54px"
  nav: "62px"
components:
  knopf:
    backgroundColor: "{colors.flaeche}"
    textColor: "{colors.tinte}"
    rounded: "{rounded.buero}"
    padding: "11px 18px"
    height: "46px"
  knopf-haupt:
    backgroundColor: "{colors.firmenblau}"
    textColor: "{colors.flaeche}"
    rounded: "{rounded.buero}"
    padding: "11px 18px"
    height: "46px"
  knopf-haupt-hover:
    backgroundColor: "{colors.firmenblau-tief}"
  knopf-gefahr:
    backgroundColor: "{colors.gefahr}"
    textColor: "{colors.flaeche}"
    rounded: "{rounded.buero}"
  karte:
    backgroundColor: "{colors.flaeche}"
    rounded: "{rounded.buero}"
    padding: "16px"
  eingabe:
    backgroundColor: "{colors.flaeche}"
    textColor: "{colors.tinte}"
    rounded: "{rounded.buero}"
    padding: "10px 12px"
    height: "46px"
  park-pille:
    backgroundColor: "{colors.flaeche}"
    rounded: "{rounded.pille}"
    padding: "8px 16px"
  park-pille-aktiv:
    backgroundColor: "{colors.firmenblau}"
    textColor: "{colors.flaeche}"
  nav-punkt-aktiv:
    backgroundColor: "{colors.firmenblau-hauch}"
    textColor: "{colors.firmenblau}"
    height: "48px"
  planwand-balken:
    backgroundColor: "{colors.firmenblau}"
    textColor: "{colors.flaeche}"
    rounded: "{rounded.balken}"
    padding: "5px 7px"
  meldung:
    backgroundColor: "{colors.tinte}"
    textColor: "{colors.flaeche}"
    rounded: "{rounded.buero}"
    padding: "12px 14px"
  pad-karte:
    backgroundColor: "{colors.pad-karte}"
    textColor: "{colors.pad-text}"
    rounded: "{rounded.pad-karte}"
    padding: "20px 24px"
  pad-knopf:
    backgroundColor: "{colors.nacht-grund}"
    textColor: "{colors.pad-text}"
    rounded: "{rounded.pad-knopf}"
    padding: "18px 12px"
    height: "78px"
---

# Design System: Hofer Tool

## Overview

**Creative North Star: "Der Leitstand"**

Das Hofer Tool ist die Schaltzentrale eines Drehteile-Betriebs mit rund 20 Leuten. Es hat zwei Räume, die bewusst verschieden aussehen. Im **Büro** ist es ein heller, ruhiger Arbeitstisch: graublauer Grund, weisse Karten, feine Linien, kantige 4px-Ecken und ein einziges kräftiges Firmenblau. Hier wird geplant, gelesen und verglichen, die Dichte ist hoch, und die Farbe gehört den Daten. In der **Halle** wird daraus der Pad Mode, eine dunkle Anzeige direkt an der Maschine: tiefes Nachtblau, Glasflächen mit weichem Schimmer, grosse runde Kacheln und Zahlen, die man aus einem Meter Abstand liest.

Beide Räume teilen dieselbe Grammatik. Eine Systemschrift mit Ziffern in gleicher Breite, damit Spalten fluchten. Werkstofffarben und Zustandszeichen bedeuten überall dasselbe. Das Firmenblau führt, und alles andere tritt zurück. Das Büro bleibt flach und kommt ohne Schatten aus. Tiefe gibt es nur im Pad, wo sie zeigt, was man antippen kann.

Der Auftraggeber will es moderner, dynamischer und flüssiger, aber nie langsamer. Bewegung ist deshalb Rückmeldung und kein Schmuck: kurz (120–380 ms), nur mit `transform` und `opacity`, und sie fällt bei „weniger Bewegung" ganz weg.

**Key Characteristics:**
- Zwei Räume: helles, flaches Büro und dunkler, tiefer Pad Mode.
- Ein Firmenblau (#003884) als einzige Markenfarbe; Personen können ein anderes Thema wählen.
- Werkstofffarben sind Daten, nicht Dekor.
- Ziffern immer in gleicher Breite (`tabular-nums`), Zahlen mit Apostroph (1'200).
- Grosse Tippziele: 46px im Büro, 78px im Pad.
- Bewegung kurz und günstig, nur `transform` und `opacity`.

## Colors

Kühle, fast farblose Flächen mit einem tiefen Firmenblau; die bunten Farben gehören den Werkstoffen und Zuständen.

### Primary
- **Firmenblau** (firmenblau): kommt aus dem Logo. Hauptknöpfe, aktiver Navigationspunkt, Kopfzeilenlinie, aktive Reiter und Park-Pillen, Fokusring, die ganze Anmeldeseite. In der dunklen Ansicht wird es zu **Nachtblau-Hell** (nacht-marke).
- **Firmenblau Tief** (firmenblau-tief): Hover und gedrückter Zustand von Hauptknöpfen.
- **Firmenblau Hauch** (firmenblau-hauch): Hintergrund des aktiven Navigationspunkts, Hover auf klickbaren Zeilen und Zellen.

### Neutral
- **Werkstattgrau** (grund): Seitenhintergrund im Büro, ein kühles Grau mit einem Stich Blau.
- **Blattweiss** (flaeche): Karten, Dialoge, Eingaben, Kopfzeile, Navigation.
- **Tinte** (tinte): Text und Meldungshintergrund.
- **Gedämpft** (gedaempft): Feldbeschriftungen, Tabellenköpfe, Hinweise.
- **Haarlinie** (linie) und **Kante** (linie-stark): Trennlinien in Tabellen und Kartenränder, Ränder von Eingaben und Knöpfen.

### Zustände
- **Gut** (gut): erledigt, Erfolgsmeldung, laufende Balken.
- **Warnung** (warnung): Achtung-Meldungen und Warnknöpfe.
- **Gefahr** (gefahr): Fehler, Löschen, überschrittene Termine (Zeile mit 9 % Rot unterlegt).

### Pad Mode
- **Hallennacht** (pad-tiefe): Grund mit zwei radialen Blauverläufen, wie Licht auf Metall.
- **Kachelblau** (pad-karte → pad-karte-tief): Kartenverlauf von oben links nach unten rechts (160°).
- **Anzeigeweiss** (pad-text) und **Anzeigegrau** (pad-gedaempft): Text und Überzeilen.
- **Signalblau** (pad-blau): aktive Reiter, Auftragsnummern, Schimmer.

### Werkstoffe
Stahl blau, V2A rot, V4A grau, Chromstahl rosa, Aluminium weiss, Messing gelb, Messing ohne Blei senf, Neusilber orange, Titan violett, Kunststoff türkis. Sie stammen aus der Planfarben-Liste (22 Farben, jede mit eigener Schriftfarbe) und färben Balken, Materialkacheln und Werkstoffmarken.

### Named Rules
**The One Blue Rule.** Das Firmenblau ist die einzige Markenfarbe. Kein zweites Akzentblau im Büro. Wer ein anderes Thema wählt (rot, grün, gelb, rosa, violett, orange), tauscht nur `--marke` und `--aktion`.

**The Material Is Meaning Rule.** Werkstofffarben werden nie als Dekor eingesetzt und nie umgedeutet. Rot auf einem Balken heisst V2A, nicht Fehler.

**The Theme Swap Rule.** Farbe immer über die Variablen (`--marke`, `--flaeche`, `--tinte` …). Fest eingetragene Werte brechen die dunkle Ansicht und die Themen.

## Typography

**Display Font:** system-ui (mit -apple-system, Segoe UI, Roboto, sans-serif)
**Body Font:** dieselbe Systemschrift
**Label/Mono Font:** ui-monospace (mit Menlo, Consolas) für Pfade, Links und Rohtext

**Character:** Eine einzige, schnell ladende Systemschrift, nüchtern wie ein Werkstattschild. Charakter entsteht durch Gewicht (600–700) und gleich breite Ziffern, nicht durch eine besondere Schrift.

### Hierarchy
- **Headline** (650, 1.4rem auf dem Handy und 1.6rem ab 780px, −0.01em): Seitentitel.
- **Title** (650, 1rem bis 1.05rem): Kartenköpfe und Dialogtitel.
- **Body** (400, 16px, 1.45): Fliesstext, Eingaben, Knöpfe (600).
- **Table** (400, .92rem): Tabellenzellen; Köpfe .78rem in 650 und gedämpft.
- **Label** (600, .85rem, gedämpft): Feldbeschriftungen über Eingaben.
- **Pad-Überzeile** (600, .7rem, .12em Abstand, GROSS): kleine Überschrift über den Werten im Pad, zum Beispiel „STÜCKZAHL · ANTIPPEN".
- **Pad-Wert** (700, 1.6rem bis 3rem und mehr): Auftragsnummer, Stückzahl, Uhrzeit. Der Text der Auftragskachel passt seine Grösse an die Textmenge an.

### Named Rules
**The Aligned Digits Rule.** `font-variant-numeric: tabular-nums` gilt überall. Zahlen mit Apostroph (1'200) über `zahlText()`.

**The Readable From The Machine Rule.** Im Pad steht der wichtigste Wert jeder Kachel in mindestens 1.6rem und 700.

## Layout

Handy zuerst. Unter 780px: Kopfzeile 54px oben, Navigation als Leiste unten (62px, waagrecht scrollbar, Punkte mindestens 72px breit), Inhalt mit 16px/14px Rand. Ab 780px wandert die Navigation als 208px breite Spalte nach links, und der Inhalt bekommt 24px/28px Rand. Ausnahmen gibt es bei 620px (Dialoge kommen von unten), 720px und 900px.

Inhalt maximal 1100px breit, ausser die Planwand: Sie läuft so breit wie nötig (`max-content`), mit einer Tagesspalte, die über den Regler „Tage" und „Höhe" einstellbar ist. Die Wochenansicht der Produktion ist nur so breit wie ihre Daten.

Abstände in einem lockeren 4er-Raster: 4, 8, 10, 14, 16, 28. Karten haben 16px Innenabstand und 14px Abstand untereinander. Der Pad Mode ist ein bildschirmfüllendes Raster mit 6 Spalten, 16–18px Lücke und Kacheln, die die Höhe ausfüllen.

## Elevation & Depth

Das Büro ist **flach**: keine Schatten auf Karten, Knöpfen oder Tabellen. Tiefe entsteht durch Tonwerte (Werkstattgrau unter Blattweiss), Ränder und einen 4px-Farbstreifen links bei Hinweis- und Fehlerkarten. Die einzige Ebene darüber ist der Dialog mit seinem 60 % dunklen Schleier.

Der Pad Mode ist **gehoben**: Kacheln schweben mit grossen, weichen Schatten über der Hallennacht und tragen oben eine 1px-Lichtkante. Beim Antippen sinken sie 2px ab, und der Schatten wird kürzer.

### Shadow Vocabulary
- **Pad-Schwebe** (`box-shadow: 0 22px 50px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08)`): Karten und Kacheln im Pad.
- **Pad-Gedrückt** (`box-shadow: 0 8px 20px rgba(0,0,0,.4)`): Kachel im gedrückten Zustand.
- **Leiste** (`box-shadow: 0 2px 8px rgba(0,0,0,.25)`): schwebende Werkzeugleisten.
- **Innere Markierung** (`box-shadow: inset 0 0 0 2px var(--marke)`): ausgewählte Zelle oder Kachel, statt Schatten nach aussen.

### Named Rules
**The Flat Office Rule.** Im Büro gibt es keine Schatten nach aussen. Auswahl zeigt sich durch eine Innenlinie oder Firmenblau-Hauch.

**The Glass Only At The Machine Rule.** Verläufe, Unschärfe (`backdrop-filter`) und Schimmer gibt es nur im Pad Mode.

## Shapes

Im Büro kantig und technisch: 4px auf Karten, Knöpfen, Eingaben und Dialogen, 3px auf Planwand-Balken und 2px auf kleinen Marken. Rund sind nur die Park-Pillen (999px) und Kreise wie Avatare. Auf dem Handy bekommen Dialoge oben 8px, weil sie von unten hereinfahren.

Im Pad weich und griffig: 12–16px auf Knöpfen und Reitern, 20–22px auf grossen Karten, 50 % auf runden Anzeigen.

## Components

### Buttons
- **Shape:** leicht gerundete Kanten (4px), mindestens 46px hoch.
- **Standard:** Blattweiss mit Kante und Tinte, Schrift 600.
- **Haupt:** Firmenblau mit weisser Schrift; Hover Firmenblau Tief.
- **Gefahr / Warnung / Still:** Gefahrrot gefüllt, Warnrand mit hellem Hover, durchsichtig.
- **Hover / Focus:** Fokus ist ein 3px-Ring in der Aktionsfarbe mit 1px Abstand. Gedrückt sinkt der Knopf 1px. Gesperrt 55 % Deckkraft.

### Chips
- **Park-Pillen:** rund, Blattweiss mit Kante; aktiv in Firmenblau gefüllt und weiss.
- **Marken:** kleine Etiketten (.7rem, 2px Ecken) in Firmenblau.
- **Werkstoffmarke:** Quadrat in der Werkstofffarbe vor dem Kurznamen, z. B. „■ V2A rostfrei".

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** Blattweiss auf Werkstattgrau.
- **Shadow Strategy:** keine, siehe Flat Office Rule.
- **Border:** 1px Haarlinie; Hinweis und Fehler mit 4px-Streifen links in Firmenblau oder Gefahrrot.
- **Internal Padding:** 16px.

### Inputs / Fields
- **Style:** Blattweiss, 1px Kante, 4px, mindestens 46px hoch, Beschriftung darüber (.85rem, 600, gedämpft).
- **Focus:** 3px-Ring in der Aktionsfarbe.
- **Hinweis:** .78rem gedämpft unter dem Feld.

### Navigation
- **Handy:** Leiste unten mit Zeichen über Text (.7rem); aktiv mit Firmenblau-Linie oben, Firmenblau-Hauch und 600.
- **Ab 780px:** Spalte links, 48px hohe Zeilen mit Zeichen und Text (.95rem); aktiv mit 3px-Linie links.
- **Reiter:** Text 600 gedämpft, aktiv Firmenblau mit 3px-Unterstrich.

### Planwand-Balken (Signature)
Ein Auftrag als Balken über seine Arbeitstage: gefüllt in der Werkstofffarbe, 3px Ecken, Schrift .76rem in 650. Vorne steht das Zustandszeichen (○ 🔧 🔍 ▶ ✔), dann die Auftragsnummer und darunter Ist / Soll. Abgeschlossene Aufträge sind grau und durchgestrichen. Ein roter Punkt ● heisst: keine Materialmenge. Ein Balken, der gerade gezogen wird, hat 35 % Deckkraft.

### Pad-Kachel (Signature)
Dunkle Glaskarte (22px) mit Verlauf, Lichtkante und Schimmer oben links. Darin eine Überzeile, ein grosser Wert und eine kleine Zusatzzeile. Die Materialkachel ist in der Werkstofffarbe gefüllt. Unten eine Reihe grosser Aktionsknöpfe (78px, 16px Ecken): Zeichnung, WBG, Einrichtblatt, Werkzeugwechsel und rechts der Zustand („▶ Läuft") in Gut-Grün.

### Meldung
Unten rechts (ab 780px 340px breit, auf dem Handy über der Navigation): Tinte-Hintergrund, weisse Schrift, 4px-Streifen links in Gut, Warnung oder Gefahr. Sie blendet in 350 ms aus.

### Dialog
Schleier mit 60 % Dunkel, Karte bis 400px breit, 20px Innenabstand. Die Knopfzeile klebt unten und darf umbrechen. Auf dem Handy kommt der Dialog als Blatt von unten (bis 92 % Höhe). Escape schliesst.

## Do's and Don'ts

### Do:
- **Do** Farben immer über die Variablen setzen, damit die dunkle Ansicht und die Themen funktionieren.
- **Do** Bewegung nur über `transform` und `opacity`, 120–380 ms, mit `cubic-bezier(.2,.8,.2,1)` für Wege und Ease für Ein- und Ausblenden.
- **Do** jede neue Bewegung unter `prefers-reduced-motion: reduce` abschalten (die Regel steht schon global).
- **Do** Tippziele mindestens 46px im Büro, im Pad wie die bestehenden Knöpfe (78px).
- **Do** Zahlen mit `tabular-nums` und Apostroph.
- **Do** im Pad den Hauptwert gross und hell, die Überzeile klein und gedämpft.

### Don't:
- **Don't** Schatten, Verläufe oder Glas ins Büro tragen; das bleibt dem Pad Mode vorbehalten.
- **Don't** Werkstofffarben für Zustände, Warnungen oder Schmuck verwenden.
- **Don't** die Anmeldeseite in einer anderen Farbe als Blau zeigen.
- **Don't** Effekte auf der Planwand, die bei jedem Bild neu rechnen (`filter`, `box-shadow`-Animation, `backdrop-filter`): Die Planwand zeichnet höchstens einmal pro Bild und muss mit einem Jahr Daten flüssig bleiben.
- **Don't** fremde Schriften laden: Die Systemschrift ist sofort da, auch offline.
