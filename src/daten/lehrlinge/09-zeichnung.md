# Zeichnungstechnik
Ansichten, Schnitte, Bemassung, Toleranzen und Oberflächen.

## Ansichten und Schnitte

### Wie sind die Ansichten auf einer Zeichnung angeordnet?
In Europa gilt die **Projektionsmethode 1** (Symbol: Kegelstumpf mit dem Kreis rechts):
- **Vorderansicht** in der Mitte (die aussagekräftigste Ansicht)
- **Draufsicht** (von oben gesehen) **unter** der Vorderansicht
- **Seitenansicht von links** **rechts** neben der Vorderansicht

In Amerika gilt oft Methode 3, dort ist es umgekehrt. Darum immer auf das Symbol im Schriftfeld schauen.

### Welche Linien gibt es und was bedeuten sie?
- **Breite Volllinie**: sichtbare Kanten
- **Schmale Volllinie**: Masslinien, Schraffur, Gewindegrund
- **Strichlinie**: verdeckte Kanten
- **Strichpunktlinie (schmal)**: Mittellinien, Symmetrieachsen
- **Strichpunktlinie (breit)**: Kennzeichnung von Schnittverläufen oder besonderen Bereichen
- **Freihandlinie**: Bruchkante

### Was ist ein Schnitt und warum braucht man ihn?
Man denkt sich das Teil an einer Stelle **aufgeschnitten**, damit man das Innere (Bohrungen, Einstiche) sieht. Die Schnittfläche ist **schraffiert** (schmale Linien unter 45°). Schnittverlauf und Name (z. B. A–A) stehen in einer anderen Ansicht. Bei Drehteilen zeigt man oft einen **Halbschnitt**: eine Hälfte aussen, die andere geschnitten.

### Was bedeutet eine Einzelheit (Detail)?
Ein kleiner Bereich wird mit einem Kreis und einem Buchstaben markiert (z. B. „Z“) und **vergrössert** woanders gezeichnet, etwa „Z (5:1)“. So sieht man kleine Radien, Einstiche oder Fasen gut.

## Bemassung

### Was bedeuten die Zeichen vor einer Masszahl?
- **Ø** = Durchmesser
- **R** = Radius
- **SR / SØ** = Kugelradius / Kugeldurchmesser
- **□** = Quadrat (Vierkant)
- **SW** = Schlüsselweite (Sechskant)
- **1×45°** = Fase 1 mm unter 45°
- **(25)** in Klammern = Hilfsmass, nur zur Information, nicht prüfen
- **Masszahl in einem Rahmen** = theoretisch genaues Mass (bei Form- und Lagetoleranzen)

### Was ist der Massstab?
**M 1:1** = natürliche Grösse, **M 2:1** = doppelt so gross gezeichnet, **M 1:2** = halb so gross. Die Masszahlen geben **immer das echte Mass** an. Darum nie auf der Zeichnung mit dem Massstab abmessen, sondern immer die Zahl lesen.

### Was steht im Schriftfeld?
Zeichnungsnummer, Benennung, Werkstoff, Massstab, Allgemeintoleranzen, Projektionsmethode, Oberflächenangaben, Änderungsstand (Index), wer gezeichnet und geprüft hat. **Immer prüfen, ob du den neusten Index hast.**

## Toleranzen und Passungen

### Was sind Allgemeintoleranzen (ISO 2768)?
Für alle Masse **ohne** eigene Toleranz gilt die Allgemeintoleranz aus dem Schriftfeld, meist **ISO 2768-m** (mittel):

| Nennmass | f (fein) | m (mittel) |
|---|---|---|
| 0,5–3 | ±0,05 | ±0,1 |
| über 3–6 | ±0,05 | ±0,1 |
| über 6–30 | ±0,1 | ±0,2 |
| über 30–120 | ±0,15 | ±0,3 |
| über 120–400 | ±0,2 | ±0,5 |

### Was bedeutet 10 H7?
Eine ISO-Toleranz:
- **Grossbuchstabe** (H) = **Bohrung**, Kleinbuchstabe (g, h …) = **Welle**
- Der Buchstabe sagt, **wo** die Toleranz liegt (H: untere Grenze = Nennmass)
- Die Zahl (7) sagt, **wie gross** die Toleranz ist (Grundtoleranzgrad IT7)

**10 H7** = 10,000 bis 10,015 mm. Die Werte stehen in der Tabelle (Tabellenbuch).

### Was bedeutet die Passung 10 H7/g6?
- Bohrung **10 H7**: +0,015 / 0 → 10,000 bis 10,015
- Welle **10 g6**: −0,005 / −0,014 → 9,986 bis 9,995
- **Kleinstes Spiel**: 10,000 − 9,995 = 0,005 mm
- **Grösstes Spiel**: 10,015 − 9,986 = 0,029 mm

Immer Spiel → **Spielpassung**: die Welle läuft leicht drehbar. Andere Arten: **Übergangspassung** (z. B. H7/k6, mal Spiel, mal leicht fest) und **Presspassung** (z. B. H7/p6, immer Übermass, wird eingepresst).

### Was ist Mittelmass und warum soll ich darauf zielen?
Das Mittelmass liegt genau in der Mitte der Toleranz. Beispiel Ø 20 h6 (0 / −0,013): Mittelmass 19,9935 → praktisch auf **19,993–19,994** zielen. So hat man nach beiden Seiten Platz, wenn die Schneide verschleisst oder die Temperatur ändert.

### Was bedeuten Form- und Lagetoleranzen?
Sie stehen in einem **Rahmen** mit Symbol, Wert und manchmal Bezug (A, B …):
- **⏤** Geradheit, **⏥** Ebenheit, **○** Rundheit, **⌭** Zylinderform
- **⫽** Parallelität, **⟂** Rechtwinkligkeit, **∠** Neigung
- **⌖** Position, **◎** Koaxialität/Konzentrizität, **⌯** Symmetrie
- **↗** Rundlauf, **⌰** Gesamtrundlauf

Beispiel: ↗ 0,02 A heisst: Beim Drehen um die Achse A darf die Fläche höchstens 0,02 mm schlagen (mit Messuhr prüfen).

## Oberflächen und Gewinde

### Was bedeutet Ra 0,8?
**Ra** = Mittenrauwert in µm, der Durchschnitt der Rauheit. Je kleiner, desto glatter.
- Ra 6,3: grob gedreht
- Ra 3,2: normal gedreht
- Ra 1,6: fein gedreht
- Ra 0,8: geschlichtet, gerieben
- Ra 0,4 und kleiner: geschliffen, poliert

**Rz** ist die gemittelte Rautiefe und ist ungefähr 4- bis 7-mal so gross wie Ra. Gemessen wird mit einem Rauheitsmessgerät (Tastschnitt).

### Wie liest man das Oberflächenzeichen?
Ein Haken (√) mit Angaben:
- Haken mit **Querstrich** oben: Material muss **abgetragen** werden (spanend).
- Haken mit **Kreis**: Material darf **nicht abgetragen** werden.
- Darüber oder daneben: der Wert, z. B. **Ra 1,6**.
- Steht ein Zeichen im Schriftfeld mit Klammer daneben, gilt es für alle Flächen ohne eigenes Zeichen.

### Wie ist ein Gewinde auf der Zeichnung dargestellt?
- **Aussengewinde**: Aussendurchmesser **breite** Linie, Kerndurchmesser **schmale** Linie. In der Stirnansicht der Kern als schmaler **Dreiviertelkreis**.
- **Innengewinde**: Kerndurchmesser (Bohrung) **breit**, Aussendurchmesser **schmal**, Dreiviertelkreis aussen.
- Die nutzbare Gewindelänge endet mit einer breiten Linie.
- Bemassung z. B. **M8×12** oder M8 mit Tiefe 12, Kernloch Ø 6,8×15.

### Was ist eine Werkstückkante nach ISO 13715?
Ein Zeichen mit Winkel und Zahl sagt, wie die Kanten sein müssen:
- **+** Wert: Grat erlaubt bis zu diesem Mass
- **−** Wert: Kante gebrochen / gefast bis zu diesem Mass
- **±**: scharfkantig, beides erlaubt bis zu diesem Mass

Beispiel −0,2 = Kanten mit bis 0,2 mm brechen (keine scharfen Kanten, kein Grat).
