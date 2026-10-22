# Bohren, Reiben und Gewinde
Bohren, Senken, Reiben, Gewinde schneiden und formen.

## Bohren und Senken

### Wie berechne ich die Drehzahl beim Bohren?
**n = vc × 1000 / (π × d)**
- n = Drehzahl in 1/min
- vc = Schnittgeschwindigkeit in m/min (aus Tabelle oder vom Werkzeughersteller)
- d = Bohrerdurchmesser in mm

Beispiel: HSS-Bohrer Ø 8 mm in Stahl, vc = 25 m/min
n = 25 × 1000 / (3,14 × 8) = **ca. 995 1/min** → an der Maschine die nächste tiefere Stufe wählen.

### Welche Schnittgeschwindigkeit nehme ich beim Bohren?
Richtwerte für **HSS-Bohrer** (genauer gilt immer der Katalog des Werkzeugherstellers):

| Werkstoff | vc in m/min |
|---|---|
| Baustahl, Automatenstahl | 25–35 |
| Rostfrei (V2A, V4A) | 8–15 |
| Messing | 40–70 |
| Aluminium | 60–100 |
| Kunststoff | 30–60 |

Mit **Hartmetall** etwa 3- bis 5-mal schneller. Rostfrei langsam und mit genug Vorschub bohren, sonst verfestigt sich das Material und der Bohrer brennt.

### Warum zuerst zentrieren oder ankörnen?
Ein Bohrer hat in der Mitte eine Querschneide, die nicht gut schneidet. Ohne Führung **verläuft** er, die Bohrung sitzt schief oder falsch. Darum zuerst mit einem **NC-Anbohrer** oder **Zentrierbohrer** anbohren (an der CNC) oder ankörnen (von Hand). Bei grossen Bohrungen zuerst klein vorbohren.

### Was ist der Spitzenwinkel und welchen brauche ich?
Der Winkel an der Bohrerspitze. Normal für Stahl: **118°**. Für Hartmetallbohrer und rostfreie Stähle oft **130–140°**. Für Kunststoffe und Messing teilweise flacher oder spitzer, je nach Hersteller. Der NC-Anbohrer sollte einen etwas **grösseren** Winkel haben als der Bohrer danach (z. B. 120° oder 142° Anbohrer vor 140° Bohrer), damit der Bohrer zuerst in der Mitte anschneidet und nicht mit den Ecken.

### Was bedeutet Entspanen beim Tiefbohren?
Ab etwa **3 × Durchmesser** Tiefe kommen die Späne schlecht heraus. Der Bohrer fährt dann immer wieder ein Stück zurück, damit die Späne brechen oder herauskommen. An der CNC macht das der Zyklus **G83** (Tieflochbohren). Ohne Entspanen klemmen die Späne und der Bohrer bricht.

### Welchen Senker brauche ich für Senkschrauben?
Für metrische Senkschrauben (ISO 10642, DIN 7991) einen **Kegelsenker 90°**. Für Zylinderkopfschrauben einen **Flachsenker** mit Führungszapfen. Die Senkung nicht zu tief machen: Der Schraubenkopf soll bündig oder leicht versenkt sein.

## Reiben

### Wozu reibt man eine Bohrung?
Ein Bohrer macht keine genaue und glatte Bohrung. Mit der **Reibahle** wird die Bohrung auf ein genaues Mass gebracht, zum Beispiel **H7**, und die Oberfläche wird glatt (etwa Ra 0,8 bis 1,6). So passt später ein Stift oder eine Welle genau.

### Welches Vorbohrmass nehme ich vor dem Reiben?
Richtwerte für die Zugabe (Durchmesser):

| Fertigdurchmesser | Vorbohren kleiner um |
|---|---|
| bis 5 mm | 0,1–0,2 mm |
| 5–20 mm | 0,2–0,3 mm |
| 20–50 mm | 0,3–0,5 mm |

Beispiel: Ø 8 H7 → vorbohren mit **Ø 7,8 mm**.
Zu wenig Zugabe: die Reibahle drückt und reibt nur. Zu viel: sie wird überlastet und das Mass stimmt nicht.

### Worauf muss ich beim Reiben achten?
- **Niedrige Drehzahl** (etwa die Hälfte bis ein Drittel vom Bohren), dafür **genug Vorschub**.
- Gut kühlen und schmieren.
- Reibahle **nie rückwärts drehen**, sonst brechen die Schneiden aus.
- Gerade in die Bohrung, nicht verkanten.
- Mit Grenzlehrdorn prüfen: Gutseite geht hinein, Ausschussseite nicht.

## Gewinde

### Wie gross muss das Kernloch für ein Gewinde sein?
Faustregel für metrisches Regelgewinde: **Kernloch = Nenndurchmesser − Steigung**.

| Gewinde | Steigung | Kernloch (Schneiden) |
|---|---|---|
| M3 | 0,5 | 2,5 |
| M4 | 0,7 | 3,3 |
| M5 | 0,8 | 4,2 |
| M6 | 1,0 | 5,0 |
| M8 | 1,25 | 6,8 |
| M10 | 1,5 | 8,5 |
| M12 | 1,75 | 10,2 |
| M16 | 2,0 | 14,0 |

Beim **Gewindeformen** ist das Loch grösser (etwa Nenndurchmesser − halbe Steigung, z. B. M6 → ca. 5,5 mm). Genaue Werte stehen beim Werkzeughersteller.

### Was ist der Unterschied zwischen Gewinde schneiden und formen?
- **Schneiden**: Es entstehen Späne. Geht in fast allen Werkstoffen.
- **Formen (Furchen)**: Das Material wird verdrängt, **keine Späne**. Das Gewinde ist fester, der Former hält länger. Geht nur in zähen Werkstoffen (Stahl, rostfrei, Alu, Messing mit wenig Blei), nicht in sprödem Guss oder spröden Kunststoffen. Braucht ein grösseres Kernloch und gute Schmierung.

### Welchen Gewindebohrer nehme ich für Sackloch und Durchgangsloch?
- **Durchgangsloch**: Gewindebohrer mit **Schälanschnitt** (gerade Nuten). Er schiebt die Späne nach vorne aus dem Loch.
- **Sackloch**: Gewindebohrer mit **Spiralnuten** (Rechtsdrall). Er fördert die Späne nach hinten heraus.

Beim Sackloch tiefer vorbohren als das Gewinde lang ist, damit die Späne und der Anschnitt Platz haben.

### Wie schneide ich ein Gewinde von Hand?
1. Kernloch bohren und leicht ansenken (90°).
2. Gewindebohrer im Windeisen **senkrecht** ansetzen, mit Winkel prüfen.
3. Mit Schneidöl langsam eindrehen, nach jeder halben bis ganzen Umdrehung ein Stück **zurückdrehen**, damit der Span bricht.
4. Beim Handsatz der Reihe nach: **Vorschneider, Mittelschneider, Fertigschneider** (Ringe am Schaft zeigen die Reihenfolge).

Nie mit Gewalt drehen: Ein abgebrochener Gewindebohrer ist sehr schwer herauszubekommen.

### Was bedeutet M8×1 oder M8-6H?
- **M8** = metrisches Gewinde, Nenndurchmesser 8 mm, Regelsteigung (1,25 mm).
- **M8×1** = Feingewinde mit Steigung 1 mm.
- **6H** = Toleranzklasse für ein **Innengewinde** (Grossbuchstabe), **6g** für ein **Aussengewinde** (Kleinbuchstabe). 6H/6g ist die normale Passung.
- **LH** = Linksgewinde.

### Wie prüfe ich ein Gewinde?
Mit **Gewindelehrdorn** (Innengewinde) oder **Gewindelehrring** (Aussengewinde): Gutseite muss sich ganz von Hand eindrehen lassen, Ausschussseite darf höchstens etwa zwei Umdrehungen hinein. Die Steigung prüft man mit der **Gewindeschablone** (Gewindekamm).
