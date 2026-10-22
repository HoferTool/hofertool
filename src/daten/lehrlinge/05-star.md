# Star Langdreher
Aufbau und Arbeitsweise eines Langdrehautomaten mit Fanuc-Steuerung.

## Aufbau

### Was ist ein Langdreher (Swiss-Type)?
Beim Langdreher bewegt sich nicht das Werkzeug in Z, sondern der **Spindelstock mit der Stange**. Die Stange läuft durch eine **Führungsbuchse**, und das Werkzeug schneidet immer **direkt vor der Führungsbuchse**. Dadurch biegt sich das Teil kaum durch, auch bei langen, dünnen Teilen. Ideal für kleine Präzisionsdrehteile in grosser Stückzahl.

### Wozu dient die Führungsbuchse?
Sie **führt die Stange** ganz nahe an der Schneide. Sie muss auf den **Stangendurchmesser** genau eingestellt sein: zu eng → die Stange klemmt oder frisst; zu weit → das Teil wird unrund und rattert. Darum braucht der Langdreher geschliffenes Stangenmaterial mit enger Toleranz (z. B. h8 oder h9). Bei manchen Teilen arbeitet man **ohne Führungsbuchse** (kurze Teile, ungeschliffenes Material).

### Was machen Haupt- und Gegenspindel?
- **Hauptspindel**: dreht die Stange, auf ihr wird die Vorderseite bearbeitet.
- **Gegenspindel**: fährt heran, **übernimmt** das Teil vor oder beim Abstechen und bearbeitet die **Rückseite** (Bohren, Gewinde, Fasen). Danach wird das fertige Teil ausgeworfen.

So kommt das Teil fertig aus der Maschine, ohne zweite Aufspannung.

### Was ist ein Stangenlader?
Er schiebt die Stange (meist 3 m lang) automatisch in die Spindel nach und legt neue Stangen ein, wenn eine fertig ist. Das Reststück am Ende ist **Abfall** und wird bei der Materialbestellung mitgerechnet.

### Was sind angetriebene Werkzeuge?
Werkzeuge mit eigenem Motor (Bohrer, Fräser), damit man auch **querbohren**, **fräsen** (z. B. Flächen, Schlitze, Sechskant) oder Gewinde quer machen kann. Die Spindel steht dabei still oder positioniert als **C-Achse**.

## Programm und Steuerung

### Warum hat ein Star-Programm zwei Teile ($1 und $2)?
Der Langdreher hat meist **zwei Kanäle** (Systeme), die gleichzeitig laufen:
- **$1 (Kanal 1)**: Hauptspindel mit den Werkzeugen der Hauptseite
- **$2 (Kanal 2)**: Gegenspindel mit den Rückseitenwerkzeugen

Damit beide nicht kollidieren und im richtigen Moment zusammenarbeiten (z. B. Übernahme beim Abstechen), gibt es **Wartecodes**: An dieser Stelle wartet ein Kanal, bis der andere auch dort ist. Die genauen Nummern der Wartecodes stehen im Handbuch der Maschine.

### Wie läuft ein Teil auf dem Langdreher typischerweise ab?
1. Stange steht vorne, Plan drehen (Stirnseite).
2. Kontur drehen, die Stange fährt dabei mit dem Spindelstock nach hinten (also kommt mehr Material aus der Führungsbuchse).
3. Bohren, Fräsen, Gewinde auf der Vorderseite.
4. Gegenspindel fährt heran und spannt.
5. Abstechen, beide Spindeln synchron.
6. Gegenspindel bearbeitet die Rückseite, Teil wird ausgeworfen.
7. Hauptspindel holt neues Material nach (Stange vorziehen).

Kanal 2 arbeitet die Rückseite oft gleichzeitig mit dem nächsten Teil auf Kanal 1 ab. So wird die Stückzeit kurz.

### Was muss ich beim Einfahren eines neuen Programms beachten?
- Zuerst **Simulation** oder Probelauf ohne Material (wenn möglich).
- Im **Einzelsatz** und mit **reduziertem Eilgang** (z. B. 25 %) und Vorschub-Override fahren.
- Hand am **Vorschub-Halt** / Not-Aus.
- Bei jedem Werkzeug auf die **Restwegeanzeige** schauen: Passt der Weg zu dem, was das Werkzeug machen soll?
- Erstes Teil komplett messen, bevor es in Serie geht.

Ein neues Programm fährt man nie allein ein, solange man nicht sicher ist. **Frag den Einrichter.**

### Die Maschine zeigt einen Alarm. Was mache ich?
1. **Ruhig bleiben**, Alarmtext und Nummer lesen und aufschreiben.
2. Nicht einfach quittieren und wieder starten, ohne zu wissen, was los war.
3. Häufig: Tür offen, Stange zu Ende, Spannung nicht erreicht, Werkzeugbruch, Schmierung leer, Überlast.
4. Bei Unsicherheit: Einrichter oder Ausbildner holen.

Im Alarmverzeichnis des Handbuchs steht zu jeder Nummer, was sie bedeutet.

### Warum stimmt die Länge der Teile nicht mehr?
Häufige Ursachen beim Langdreher:
- Führungsbuchse zu weit oder verschlissen → Stange rutscht oder wackelt.
- Spannzange der Hauptspindel verschlissen oder schlecht eingestellt.
- Abstechstahl verschlissen → zieht beim Abstechen.
- Stangenmaterial nicht gerade oder mit Übermass.
- Gegenspindel übernimmt nicht sauber.

Zuerst messen, ob der Fehler immer gleich ist (Korrektur) oder schwankt (mechanisches Problem).

### Was ist die Stückzeit und warum ist sie wichtig?
Die Zeit von einem fertigen Teil bis zum nächsten. Mit ihr rechnet man, wie lange ein Auftrag dauert, und plant die Maschine. Bei Hofer wird sie im Pad Mode bei „Art. Info“ eingetragen. Eine Sekunde weniger bei 10'000 Teilen sind fast 3 Stunden.
