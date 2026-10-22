# Drehen und Fräsen
Konventionelles Drehen und Fräsen, Schnittwerte und Schneidstoffe.

## Drehen

### Wie berechne ich die Drehzahl beim Drehen?
**n = vc × 1000 / (π × d)**

Beispiel: Ø 20 mm in V2A mit vc = 120 m/min
n = 120 × 1000 / (3,14 × 20) = **ca. 1'910 1/min**

Wichtig: Beim Drehen zählt der Durchmesser, **an dem gerade geschnitten wird**. Beim Plandrehen zur Mitte hin wird d immer kleiner, darum gibt es an der CNC die **konstante Schnittgeschwindigkeit G96** mit einer Drehzahlbegrenzung.

### Was ist der Unterschied zwischen Schruppen und Schlichten?
- **Schruppen**: viel Material schnell weg, grosse Schnitttiefe, grosser Vorschub. Oberfläche egal.
- **Schlichten**: genaues Mass und schöne Oberfläche, kleine Schnitttiefe (z. B. 0,2–0,5 mm), kleiner Vorschub.

Zum Schlichten etwas Zugabe stehen lassen, damit die Schneide sauber schneidet und nicht nur drückt.

### Warum muss der Drehmeissel auf Mitte stehen?
Steht die Schneide **zu hoch** oder **zu tief**, ändern sich Frei- und Spanwinkel. Folgen: das Werkzeug drückt, es bleibt beim Plandrehen ein **Butzen** in der Mitte stehen, oder die Schneide bricht. Höhe mit Reitstockspitze, Höhenlehre oder Probeplan prüfen und mit Unterlagen korrigieren.

### Wie beeinflussen Vorschub und Eckenradius die Oberfläche?
Theoretische Rautiefe: **Rt ≈ f² / (8 × r) × 1000** (in µm)
- f = Vorschub in mm/U, r = Eckenradius in mm

Beispiel: f = 0,1 mm/U, r = 0,4 mm → Rt ≈ 0,01 / 3,2 × 1000 ≈ **3,1 µm**.
Kleinerer Vorschub oder grösserer Radius ergibt eine schönere Oberfläche. Ein grosser Radius drückt aber mehr und kann bei dünnen Teilen rattern.

### Warum rattert es beim Drehen und was kann ich tun?
Ursachen: Teil steht zu weit aus dem Futter, Werkzeug zu weit ausgespannt, Schneide stumpf, Drehzahl ungünstig, zu grosser Eckenradius.
Massnahmen:
- Teil kürzer spannen oder mit Reitstock abstützen
- Werkzeug kurz spannen
- Drehzahl ändern (oft hilft schon 10–20 % weniger oder mehr)
- Vorschub etwas erhöhen
- schärfere Schneide oder kleineren Radius nehmen

### Wie drehe ich einen Kegel an der konventionellen Drehbank?
Für kurze Kegel den **Oberschlitten** um den halben Kegelwinkel schwenken: **tan(α/2) = (D − d) / (2 × L)**.
Beispiel: D = 30, d = 20, L = 40 → tan(α/2) = 10 / 80 = 0,125 → α/2 ≈ **7,1°**.
Dann mit dem Oberschlitten von Hand vorschieben. Lange, schlanke Kegel macht man mit Reitstockverstellung oder Kegellineal, heute meist an der CNC.

### Was ist ein Spanbrecher und warum brauche ich ihn?
Die Form auf der Wendeschneidplatte, die den Span **bricht**. Ohne passenden Spanbrecher entstehen lange **Fliessspäne**, die sich um Teil und Werkzeug wickeln: gefährlich, schlechte Oberfläche, Störungen im Automat. Jeder Spanbrecher funktioniert nur in einem bestimmten Bereich von Schnitttiefe und Vorschub (steht im Katalog).

## Fräsen

### Was ist der Unterschied zwischen Gleichlauf und Gegenlauf?
- **Gleichlauf**: Fräserschneide und Vorschub gehen in die **gleiche Richtung**. Die Schneide beginnt dick und endet dünn. Bessere Oberfläche, längere Standzeit. Standard an der CNC.
- **Gegenlauf**: entgegengesetzt. Die Schneide beginnt dünn und reibt zuerst. An alten konventionellen Fräsmaschinen mit Spiel in der Spindel nimmt man Gegenlauf, weil der Tisch sonst ruckweise hineingezogen wird.

### Wie berechne ich den Vorschub beim Fräsen?
**vf = n × fz × z**
- vf = Vorschub in mm/min
- n = Drehzahl in 1/min
- fz = Vorschub pro Zahn in mm (aus Katalog)
- z = Anzahl Schneiden

Beispiel: n = 3'000 1/min, fz = 0,05 mm, z = 4 → vf = **600 mm/min**.

### Wann nehme ich welchen Fräser?
- **Schaftfräser** (2–4 Schneiden): Nuten, Taschen, Konturen. 2 oder 3 Schneiden für Alu (viel Platz für Späne), 4 und mehr für Stahl.
- **Planfräser / Messerkopf**: grosse ebene Flächen.
- **Kugelfräser**: 3D-Flächen, Radien.
- **Fasenfräser**: Fasen und Entgraten.
- **Scheibenfräser**: schmale, tiefe Nuten, Schlitze.

### Wie spanne ich ein Teil im Schraubstock richtig?
- Schraubstock vorher **ausrichten** (mit Messuhr parallel zur Achse).
- Teil auf **Parallelunterlagen** legen, mit Kunststoffhammer andrücken, bis die Unterlagen sich nicht mehr schieben lassen.
- Nicht zu weit oben spannen, damit es nicht wegkippt; nicht übermässig fest bei dünnen Teilen (verzieht sich).
- Schneiden, die in den Schraubstock fahren könnten, vorher prüfen.

## Schnittwerte und Schneidstoffe

### Welche Schnittgeschwindigkeit nehme ich beim Drehen mit Hartmetall?
Grobe Richtwerte für **beschichtetes Hartmetall** (genau gilt der Katalog):

| Werkstoff | vc in m/min |
|---|---|
| Automatenstahl | 150–300 |
| Vergütungsstahl | 120–220 |
| Rostfrei (V2A/V4A) | 100–180 |
| Messing | 200–400 |
| Aluminium | 300–1'000 |
| Titan | 40–80 |

Zu hohe vc → Schneide verschleisst schnell, wird heiss. Zu tiefe vc → Aufbauschneide, schlechte Oberfläche.

### Was ist der Unterschied zwischen HSS und Hartmetall?
- **HSS** (Schnellarbeitsstahl): zäh, bricht nicht so schnell, günstig, nachschleifbar. Verträgt aber nur tiefe Schnittgeschwindigkeiten (wird bei etwa 600 °C weich).
- **Hartmetall (HM)**: sehr hart und hitzebeständig, 3- bis 5-mal höhere Schnittgeschwindigkeit, aber spröder. Braucht stabile, schwingungsarme Bedingungen.

Weitere: **Cermet** (schöne Oberflächen beim Schlichten von Stahl), **CBN** (gehärteter Stahl), **PKD/Diamant** (Alu und Nichteisenmetalle, nie für Stahl).

### Was bedeuten die Farben ISO P, M, K, N, S, H?
Die Gruppen der Werkstoffe für Schneidplatten:
- **P (blau)**: Stahl
- **M (gelb)**: rostfreier Stahl
- **K (rot)**: Gusseisen
- **N (grün)**: Nichteisenmetalle (Alu, Messing, Kupfer)
- **S (orange)**: hochwarmfeste Legierungen und Titan
- **H (grau)**: gehärteter Stahl

So findest du im Katalog die passende Sorte und die Schnittwerte.

### Was ist eine Aufbauschneide?
Material vom Werkstück **klebt** an der Schneide fest und bildet eine falsche Schneide. Die Oberfläche wird rau, das Mass schwankt. Typisch bei weichem Stahl, Alu und zu **tiefer** Schnittgeschwindigkeit. Abhilfe: vc erhöhen, scharfe Schneide mit positivem Spanwinkel, gute Kühlung, passende Beschichtung.

### Wann Emulsion und wann Schneidöl?
- **Emulsion** (Öl in Wasser): kühlt sehr gut, gut für hohe Schnittgeschwindigkeiten und Schleifen.
- **Schneidöl**: schmiert besser, schöne Oberflächen, gut für Gewinde, Reiben, kleine Teile und Langdrehautomaten. Langdreher laufen meistens mit Schneidöl.

Nie mischen, und in eine Maschine kommt immer das, was dort vorgesehen ist.
