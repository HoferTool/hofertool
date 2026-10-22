# CNC programmieren
Beispiele und Hilfe beim Schreiben von Programmen (Fanuc-Drehen).

Alle Beispiele sind zum Lernen. Jede Maschine ist etwas anders (Parameter, Zyklen, M-Codes). Ein Programm läuft erst an der Maschine, wenn es geprüft ist: Simulation, Einzelsatz, reduzierter Eilgang, und der Einrichter hat es angeschaut.

## Grundaufbau

### Wie ist ein einfaches Drehprogramm aufgebaut?
```
O1000 (WELLE BEISPIEL)
G21 G99 G40         (mm, Vorschub mm/U, keine Radiuskorrektur)
T0101               (Werkzeug 1, Korrektur 1)
G50 S4000           (Drehzahl begrenzen)
G96 S180 M03        (konstante vc 180 m/min, Spindel ein)
G00 X22. Z2. M08    (Eilgang vor das Teil, Kuehlung ein)
...                 (Bearbeitung)
G00 X50. Z50. M09   (wegfahren, Kuehlung aus)
M05                 (Spindel aus)
M30                 (Programmende)
```
Reihenfolge merken: **Werkzeug wählen → Drehzahl → anfahren → bearbeiten → wegfahren**.

### Warum steht hinter Zahlen ein Punkt (X20.)?
Bei vielen Fanuc-Steuerungen wird eine Zahl **ohne Punkt** als kleinste Einheit gelesen: **X20** kann **0,020 mm** bedeuten statt 20 mm! Darum immer **X20.** oder X20.0 schreiben. Das ist einer der häufigsten Fehler beim Programmieren.

### Was ist ein Satz und was bedeutet N10?
Jede Zeile ist ein **Satz**. **N10, N20 …** sind Satznummern, damit man sich orientieren und Sprünge machen kann. Sie sind meist freiwillig. Am Ende eines Satzes steht bei Fanuc ein **;** (EOB), das der Editor selbst setzt.

## Beispiele

### Beispiel: Plandrehen und Längsdrehen mit Fase
Rohteil Ø 22, fertig Ø 20 auf 30 mm Länge, Fase 1 × 45° vorne.
```
T0101
G50 S4000
G96 S180 M03
G00 X24. Z0.2 M08
G01 X-0.8 F0.12      (plan drehen, ueber Mitte)
G00 Z1.
X18.                 (vor die Fase)
G01 Z0. F0.1
X20. Z-1.            (Fase 1 x 45 Grad)
Z-30.                (Laengs drehen)
X23.                 (aus dem Material)
G00 X50. Z50.
```
Die Fase: Bei Durchmesserprogrammierung wird X um 2 mm grösser (1 mm am Radius), Z um 1 mm.

### Beispiel: Radius drehen mit G02/G03
Schulter von Ø 20 auf Ø 30 mit Radius R2 in der Ecke (innen), Werkzeug vor der Drehmitte:
```
G01 Z-28. F0.1       (Ø 20 bis 2 mm vor die Schulter)
G02 X24. Z-30. R2.   (Radius in die Schulter)
G01 X30.             (Schulter plan hoch)
```
Ob G02 oder G03 stimmt, hängt von der Lage des Werkzeugs ab. In der Simulation prüfen!

### Beispiel: Bohren mit Entspanen (G83)
```
T0303 (BOHRER D5)
G97 S2500 M03
G00 X0. Z2. M08
G83 Z-20. Q2000 F0.06   (Tiefe 20, je 2 mm entspanen)
G80                     (Zyklus aus)
G00 Z50.
```
Q wird oft in **µm** angegeben (Q2000 = 2 mm). Die genaue Schreibweise der Bohrzyklen ist je nach Steuerung unterschiedlich, im Handbuch nachschauen.

### Beispiel: Gewinde M8×1,25 mit G76
```
T0505 (GEWINDE)
G97 S1200 M03
G00 X10. Z4.
G76 P010060 Q50 R0.02
G76 X6.466 Z-15. P767 Q300 F1.25
G00 X50. Z50.
```
- P01 00 60: 1 Schlichtschnitt, kein Auslauf, Flankenwinkel 60°
- Q50: kleinste Zustellung 0,05 mm, R0.02: Schlichtzugabe
- X6.466: Kerndurchmesser (8 − 1,227 × 1,25)
- P767: Gewindetiefe in µm (0,613 × 1,25)
- Q300: erste Zustellung 0,3 mm, F1.25: Steigung

Beim Gewinde immer **G97** (feste Drehzahl) und genug Anlauf vor dem Teil (mehrere Steigungen).

### Beispiel: Abstechen
```
T0202 (ABSTECHER B2)
G97 S2000 M03
G00 X24. Z-32.        (Position = Teillaenge + Breite Abstecher)
G01 X1. F0.05
X-0.5 F0.03           (langsam ueber die Mitte)
G00 X24.
```
Die Z-Position ist **Teillänge + Breite der Abstechplatte**, wenn die Platte mit ihrer linken Schneide gemessen ist. Gegen Ende langsamer, damit kein Butzen bleibt. Beim Langdreher übernimmt die Gegenspindel das Teil vorher.

## Fehlersuche

### Welche Fehler passieren beim Programmieren am häufigsten?
1. **Punkt vergessen** (X20 statt X20.).
2. **G00 ins Material** statt G01.
3. Falsches **Vorzeichen** bei Z (Plus statt Minus).
4. Falsche **Korrektur** aufgerufen (T0101 statt T0202).
5. **G96 ohne Drehzahlbegrenzung** oder G96 beim Bohren in der Mitte.
6. Kreisrichtung G02/G03 vertauscht.
7. Radiuskorrektur auf der Kontur eingeschaltet.
8. Kein Freifahren vor dem Werkzeugwechsel → Kollision.

### Wie finde ich einen Fehler in meinem Programm?
- Programm **Satz für Satz** lesen und bei jedem Satz fragen: Wo ist das Werkzeug jetzt, wo geht es hin?
- Auf Papier oder in der **Simulation** zeichnen.
- Im Einzelsatz die **Restwegeanzeige** beobachten.
- Mit einem Kollegen oder dem Einrichter zusammen durchgehen. Vier Augen sehen mehr.

### Wie rechne ich die Punkte einer Kontur aus?
1. Werkstücknullpunkt festlegen (meist Stirnseite, Mitte).
2. Jede Ecke der Kontur mit X (Durchmesser) und Z aufschreiben.
3. Für Fasen und Kegel mit **Trigonometrie** rechnen: z. B. Fase 30°, 2 mm lang in Z → am Radius 2 × tan 30° = 1,155 mm, am Durchmesser 2,31 mm.
4. Punkte in eine Tabelle schreiben, dann programmieren.

Der Rechner im HoferTool (Seite Rechner) hilft bei Drehzahl, Winkeln und Gravur.
