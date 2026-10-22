# CNC-Grundlagen
Koordinaten, Nullpunkte, G- und M-Codes, Korrekturen.

## Koordinaten und Nullpunkte

### Wie sind die Achsen an einer Drehmaschine?
- **Z-Achse**: entlang der Drehachse (Spindelachse). **Minus Z** geht in Richtung Spindel/Futter, also ins Teil hinein.
- **X-Achse**: quer dazu. Bei Drehmaschinen ist X meist als **Durchmesser** programmiert: X20. heisst Ø 20 mm.
- Dazu können **C** (Spindel als Drehachse), **Y** (angetriebene Werkzeuge quer) und weitere Achsen kommen.

### Was ist der Unterschied zwischen Maschinennullpunkt und Werkstücknullpunkt?
- **Maschinennullpunkt (M)**: vom Hersteller festgelegt, ändert nie.
- **Referenzpunkt (R)**: Punkt, den die Maschine nach dem Einschalten anfährt, damit sie weiss, wo sie ist.
- **Werkstücknullpunkt (W)**: legst du fest, meist auf der **Stirnseite des Teils** in der Drehmitte. Alle Masse im Programm beziehen sich darauf.

Wird der Werkstücknullpunkt falsch gesetzt, stimmt das ganze Programm nicht. Darum genau einrichten und mit dem ersten Teil prüfen.

### Was ist der Unterschied zwischen absolut (G90) und inkremental (G91)?
- **Absolut**: Jede Koordinate wird vom Werkstücknullpunkt aus gemessen. Gut lesbar, Standard.
- **Inkremental**: Jede Koordinate ist der Weg vom **letzten Punkt** aus.

An Fanuc-Drehmaschinen (System A, z. B. Star) gibt es oft kein G90/G91, sondern: **X, Z = absolut** und **U, W = inkremental**. Beispiel: W-2. fährt 2 mm in Minus Z vom aktuellen Punkt.

## Wichtige G-Codes

### Was machen G00, G01, G02 und G03?
- **G00**: Eilgang, so schnell wie möglich zum Punkt. **Nie ins Material!**
- **G01**: Gerade mit Vorschub F (schneiden).
- **G02**: Kreisbogen im **Uhrzeigersinn**.
- **G03**: Kreisbogen im **Gegenuhrzeigersinn**.

Beim Kreis gibt man das Ziel und den Radius **R** (oder den Mittelpunkt mit I, K) an. Achtung: Die Richtung hängt davon ab, von wo man auf die Ebene schaut; an Drehmaschinen mit Werkzeug hinter der Drehmitte ist es umgekehrt als bei Werkzeug vor der Drehmitte. Im Zweifel in der Simulation prüfen.

### Was bedeuten G96 und G97?
- **G96 S150**: konstante Schnittgeschwindigkeit 150 m/min. Die Drehzahl passt sich dem Durchmesser an.
- **G97 S2000**: feste Drehzahl 2'000 1/min.

Bei G96 immer eine **Drehzahlbegrenzung** setzen (an Fanuc oft **G50 S…** oder G92 S…, je nach Steuerung), sonst dreht die Spindel beim Plandrehen zur Mitte bis auf Höchstdrehzahl. Zum Bohren in der Mitte immer G97.

### Was ist der Unterschied zwischen G98 und G99?
An Fanuc-Drehmaschinen (System A):
- **G98**: Vorschub in **mm/min** (z. B. für angetriebene Werkzeuge, Fräsen)
- **G99**: Vorschub in **mm pro Umdrehung** (normales Drehen und Bohren)

Andere Steuerungen haben andere Codes (z. B. Siemens G94/G95). F0.1 mit G99 heisst 0,1 mm/U.

### Was macht die Schneidenradiuskorrektur G41/G42?
Die Schneide hat einen Eckenradius. Ohne Korrektur stimmen Fasen, Kegel und Radien nicht genau, weil die Steuerung mit einer spitzen Ecke rechnet.
- **G41**: Werkzeug links von der Kontur (in Fahrtrichtung gesehen)
- **G42**: Werkzeug rechts von der Kontur
- **G40**: Korrektur aus

Dazu müssen in der Werkzeugkorrektur **Radius R** und **Schneidenlage T** stimmen. Einschalten und Ausschalten immer mit einer Fahrbewegung, nicht direkt auf der Kontur.

### Welche Zyklen gibt es an einer Fanuc-Drehmaschine?
Häufig (Namen und Schreibweise je nach Steuerung und Maschine):
- **G70**: Schlichtzyklus
- **G71**: Längs-Schruppzyklus
- **G72**: Plan-Schruppzyklus
- **G74 / G75**: Tiefbohren bzw. Einstechen mit Entspanen
- **G76**: Gewindezyklus mit mehreren Schnitten
- **G92**: einfacher Gewindezyklus (System A)
- **G83**: Tieflochbohren
- **G84**: Gewindebohren
- **G80**: Bohrzyklus aus

Bei Star-Langdrehern werden viele Konturen direkt mit G01/G02/G03 programmiert. Was deine Maschine kann, steht im Programmierhandbuch.

## Wichtige M-Codes

### Welche M-Codes sind fast überall gleich?
- **M00**: Programmhalt (z. B. zum Messen)
- **M01**: wahlweiser Halt (nur wenn „Optional Stop“ eingeschaltet)
- **M02 / M30**: Programmende (M30 springt zurück an den Anfang)
- **M03**: Spindel im Uhrzeigersinn
- **M04**: Spindel gegen Uhrzeigersinn
- **M05**: Spindel aus
- **M08 / M09**: Kühlmittel ein / aus
- **M98 / M99**: Unterprogramm aufrufen / Unterprogrammende

Alles darüber hinaus (Gegenspindel, Spannen, Führungsbuchse, Stangenlader, angetriebene Werkzeuge, Wartecodes) ist **von Maschine zu Maschine verschieden**. Immer im Handbuch der Maschine nachschauen oder beim Einrichter fragen.

### Was ist der Unterschied zwischen M00 und M01?
**M00** hält immer an. **M01** hält nur, wenn am Bedienfeld „Optional Stop“ (Wahlhalt) eingeschaltet ist. Praktisch beim Einfahren: nach jedem Werkzeug ein M01, so kann man kontrollieren. In der Serie schaltet man es aus.

## Werkzeugkorrekturen

### Mein Durchmesser ist zu gross. Wie korrigiere ich?
Bei Durchmesserprogrammierung: **Abweichung direkt in die Verschleisskorrektur X** eintragen, mit umgekehrtem Vorzeichen.

Beispiel: Soll Ø 10,00, gemessen Ø 10,03 → Verschleiss X **−0,03** (zum bestehenden Wert dazuzählen).
Gemessen Ø 9,98 → **+0,02**.

Bei Länge (Z) gleich: Schulter 0,05 zu lang (zu weit von der Stirnseite weg) → Z-Korrektur entsprechend in die Gegenrichtung.

Vor dem Korrigieren sicher sein, dass richtig gemessen wurde, und immer das **richtige Werkzeug** korrigieren. Bei grossen Werten zuerst den Einrichter fragen.

### Was ist der Unterschied zwischen Geometrie- und Verschleisskorrektur?
- **Geometrie**: die Grundwerte des Werkzeugs (Länge, Radius, Lage), gemessen beim Einrichten.
- **Verschleiss** (Wear): kleine Anpassungen während der Produktion, weil die Schneide abnutzt oder das Mass wandert.

So bleibt die Geometrie unverändert und man sieht, wie viel schon nachkorrigiert wurde. Nach dem Plattenwechsel den Verschleiss meist wieder auf den alten Startwert setzen.

### Was bedeutet T0101?
An Fanuc-Drehmaschinen: **T01 01** = Werkzeug **1** mit Korrektur **1**. Die ersten zwei Ziffern wählen das Werkzeug (den Platz), die letzten zwei die Korrekturnummer. T0100 schaltet die Korrektur von Werkzeug 1 aus. Bei Star ist die Schreibweise ähnlich, die Plätze sind aber fest dem Werkzeugträger zugeordnet.
