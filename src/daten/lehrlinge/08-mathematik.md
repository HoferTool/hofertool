# Mathematik
Rechnen für Werkstatt und Berufsfachschule.

## Grundlagen

### Wie rechne ich mit dem Dreisatz?
1. Was weiss ich? → auf **eins** zurückrechnen → auf das Gesuchte hochrechnen.

Beispiel: 4 Stangen wiegen 30 kg. Wie viel wiegen 7 Stangen?
- 1 Stange: 30 / 4 = 7,5 kg
- 7 Stangen: 7,5 × 7 = **52,5 kg**

Beim **umgekehrten** Dreisatz (mehr Maschinen, weniger Zeit) wird multipliziert statt geteilt: 3 Maschinen brauchen 12 Tage → 1 Maschine 36 Tage → 4 Maschinen 9 Tage.

### Wie rechne ich Prozent?
- **Prozentwert = Grundwert × Prozentsatz / 100**
- Beispiel: 10 % Ausschuss von 5'000 Teilen = 5'000 × 10 / 100 = **500 Teile**.
- Wie viel Prozent? 120 von 5'000 → 120 / 5'000 × 100 = **2,4 %**.

Achtung: Um 5'000 **gute** Teile zu haben bei 10 % Ausschuss, braucht man 5'000 / 0,9 ≈ 5'556, nicht 5'500.

### Wie stelle ich eine Formel um?
Was auf der einen Seite **mal** steht, kommt auf die andere Seite als **geteilt** (und umgekehrt). Was **plus** ist, wird **minus**.

Beispiel: n = vc × 1000 / (π × d), gesucht vc:
vc = n × π × d / 1000

Tipp: Immer das, was du suchst, allein auf eine Seite bringen, Schritt für Schritt, und auf beiden Seiten dasselbe machen.

### Wie rechne ich Einheiten um?
- 1 m = 1'000 mm, 1 mm = 1'000 µm
- 1 dm³ = 1 Liter = 1'000 cm³ = 1'000'000 mm³
- 1 kg = 1'000 g
- 1 min = 60 s, 1 h = 3'600 s
- Zoll: 1" = 25,4 mm

Fehlerquelle Nummer eins in Prüfungen: Einheiten nicht umgerechnet. Immer die Einheit hinschreiben.

## Trigonometrie

### Wann nehme ich Sinus, Cosinus oder Tangens?
Im rechtwinkligen Dreieck:
- **sin α = Gegenkathete / Hypotenuse**
- **cos α = Ankathete / Hypotenuse**
- **tan α = Gegenkathete / Ankathete**

Merksatz: **GAGA HHAG** → sin = G/H, cos = A/H, tan = G/A.
Hypotenuse = längste Seite, gegenüber dem rechten Winkel. Gegenkathete = gegenüber vom Winkel α, Ankathete = am Winkel α anliegend.

### Wie rechne ich eine Fase aus?
Fase 30° (zur Achse gemessen), Länge in Z = 2 mm. Wie viel kleiner wird der Radius?
- tan 30° = Gegenkathete / Ankathete → Gegenkathete = 2 × tan 30° = 2 × 0,577 = **1,155 mm** am Radius
- am Durchmesser das Doppelte: **2,31 mm**

Bei 45° ist es einfach: Länge in Z = Höhe am Radius.

### Wie rechne ich einen Kegel?
**tan(α/2) = (D − d) / (2 × L)**
Beispiel: D = 30 mm, d = 20 mm, L = 40 mm → tan(α/2) = 10 / 80 = 0,125 → α/2 = **7,13°**, ganzer Kegelwinkel α = 14,25°.
**Kegelverjüngung** C = (D − d) / L = 10 / 40 = 1 : 4.

### Was ist der Satz des Pythagoras?
**a² + b² = c²** (c = Hypotenuse)
Beispiel: Diagonale eines Vierkants mit Seite 10 mm: c = √(10² + 10²) = √200 = **14,14 mm**. Das braucht man, um zu wissen, aus welchem Rundmaterial ein Vierkant gefräst werden kann.
Für einen **Sechskant** mit Schlüsselweite s ist das Eckmass e = s × 1,155 (z. B. SW 12 → e ≈ 13,86 mm).

## Flächen, Volumen und Gewicht

### Welche Flächenformeln brauche ich?
- Rechteck: A = l × b
- Kreis: A = π × d² / 4 (oder π × r²)
- Kreisring (Rohr): A = π × (D² − d²) / 4
- Dreieck: A = g × h / 2
- Sechskant mit Schlüsselweite s: A ≈ 0,866 × s²
- Vierkant: A = s²

### Wie rechne ich das Gewicht einer Stange?
**Masse = Querschnittsfläche × Länge × Dichte**

Beispiel: Rundstange Stahl Ø 20 mm, 3 m lang:
- A = π × 20² / 4 = 314,16 mm²
- V = 314,16 × 3'000 = 942'478 mm³ = 942,5 cm³ = 0,9425 dm³
- m = 0,9425 × 7,85 = **7,40 kg**

Tipp: in **dm** rechnen, dann ergibt Volumen × Dichte (kg/dm³) direkt kg. Der Materialrechner auf der Planwand macht das auch.

### Wie viele Teile gibt eine Stange?
Teillänge + Abstechbreite + etwas Planzugabe = Verbrauch pro Teil. Von der Stangenlänge das **Reststück** abziehen (das der Lader nicht mehr verarbeiten kann).

Beispiel: Stange 3'000 mm, Reststück 250 mm, Teil 18 mm, Abstecher 2 mm, Planen 0,5 mm:
(3'000 − 250) / (18 + 2 + 0,5) = 2'750 / 20,5 = **134 Teile** (abrunden).

## Technische Rechnungen

### Wie rechne ich die Laufzeit eines Auftrags?
**Zeit = Stückzahl × Stückzeit**
Beispiel: 5'000 Teile × 42 s = 210'000 s = 3'500 min ≈ **58,3 Stunden**. Bei 24 Stunden Lauf pro Tag also etwa 2,5 Tage, dazu Rüsten und Stangenwechsel.

### Wie rechne ich die Schnittzeit beim Drehen?
**th = L / (f × n)**
- L = Weg in mm, f = Vorschub mm/U, n = Drehzahl 1/min
Beispiel: L = 30 mm, f = 0,1 mm/U, n = 2'000 1/min → th = 30 / 200 = **0,15 min = 9 s**.

### Was ist ein Hebel und wie rechne ich ihn?
**Kraft × Kraftarm = Last × Lastarm** (F1 × l1 = F2 × l2)
Beispiel: Mit 200 N an einem 300 mm langen Schlüssel ergibt sich ein **Drehmoment** M = F × l = 200 N × 0,3 m = **60 Nm**. Schrauben werden mit einem bestimmten Drehmoment angezogen (Drehmomentschlüssel).

### Wie rechne ich Druck und Kraft (Pneumatik, Hydraulik)?
**F = p × A**
- 1 bar = 10 N/cm²
Beispiel: Zylinder Ø 50 mm, 6 bar: A = π × 5² / 4 = 19,6 cm² → F = 60 N/cm² × 19,6 cm² ≈ **1'178 N** (etwa 120 kg). In Wirklichkeit etwas weniger wegen Reibung.
