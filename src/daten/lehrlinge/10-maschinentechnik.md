# Maschinentechnik
Aufbau von Werkzeugmaschinen, Antriebe, Pneumatik, Hydraulik und Wartung.

## Aufbau und Antriebe

### Wie ist eine CNC-Maschine grundsätzlich aufgebaut?
- **Maschinenbett / Gestell**: schwer und steif, dämpft Schwingungen.
- **Führungen**: Linear- oder Gleitführungen, auf denen die Schlitten fahren.
- **Vorschubantriebe**: Servomotor + Kugelgewindetrieb pro Achse.
- **Hauptspindel**: dreht Werkstück (Drehen) oder Werkzeug (Fräsen).
- **Messsysteme**: Drehgeber oder Glasmassstäbe sagen der Steuerung, wo die Achse ist.
- **Steuerung** (z. B. Fanuc): liest das Programm und steuert alles.
- Dazu Kühlmittel, Schmierung, Hydraulik/Pneumatik, Späneförderer, Schutzhaube.

### Was ist ein Kugelgewindetrieb und warum braucht man ihn?
Eine Gewindespindel, in deren Mutter **Kugeln** laufen. Statt zu gleiten, **rollen** die Kugeln. Vorteile:
- sehr wenig Reibung, wenig Verschleiss
- **spielfrei** (die Mutter ist vorgespannt), darum genaue Positionen
- hoher Wirkungsgrad, schnelle Bewegungen

Er wandelt die Drehung des Motors in eine gerade Bewegung des Schlittens um.

### Was ist ein Servomotor?
Ein Motor, dessen Position und Drehzahl dauernd **gemessen und geregelt** werden. Die Steuerung vergleicht, wo die Achse sein soll und wo sie ist, und korrigiert sofort (Regelkreis). Darum fährt eine CNC-Achse auf tausendstel Millimeter genau.

### Was ist der Unterschied zwischen gesteuert und geregelt?
- **Steuern**: Befehl geben, ohne zu prüfen, ob es geklappt hat (offene Kette). Beispiel: Lampe einschalten.
- **Regeln**: Ergebnis wird gemessen und mit dem Sollwert verglichen, die Abweichung wird ausgeglichen (geschlossener Kreis). Beispiel: Achsposition an der CNC, Temperatur im Ofen.

### Welche Lager gibt es?
- **Wälzlager** (Kugel-, Rollen-, Nadellager): rollen, wenig Reibung, in Spindeln und Motoren.
- **Gleitlager**: gleiten auf einem Schmierfilm, dämpfen gut, z. B. Buchsen.

Spindellager sind vorgespannte Präzisions-Schrägkugellager. Ein Crash kann sie beschädigen, darum Kollisionen immer melden.

## Pneumatik und Hydraulik

### Was ist der Unterschied zwischen Pneumatik und Hydraulik?
- **Pneumatik**: arbeitet mit **Druckluft**, meist etwa **6 bar**. Schnell, sauber, für kleinere Kräfte (Spannen, Auswerfer, Türen).
- **Hydraulik**: arbeitet mit **Öl**, oft 50 bis über 200 bar. Grosse Kräfte, genau steuerbar (Spannfutter, Pressen).

### Was macht die Wartungseinheit der Druckluft?
Sie bereitet die Druckluft auf:
1. **Filter** mit Wasserabscheider (Wasser regelmässig ablassen)
2. **Druckregler** mit Manometer
3. teilweise **Öler**

Schmutz und Wasser in der Luft machen Ventile und Zylinder kaputt.

### Was ist ein einfach- und ein doppeltwirkender Zylinder?
- **Einfachwirkend**: Luft drückt nur in eine Richtung, zurück geht er mit einer **Feder**.
- **Doppeltwirkend**: Luft drückt in **beide** Richtungen (zwei Anschlüsse).

Ein **5/2-Wegeventil** (5 Anschlüsse, 2 Stellungen) steuert typischerweise einen doppeltwirkenden Zylinder.

## Wartung und Instandhaltung

### Was gehört zur täglichen Wartung an einer CNC?
- **Schmierung**: Ölstand der Zentralschmierung prüfen, nachfüllen.
- **Kühlmittel**: Stand und Konzentration (Emulsion mit Refraktometer) prüfen.
- **Hydraulik/Druckluft**: Druck ablesen, Wasser im Filter ablassen.
- **Späne** aus dem Arbeitsraum und Späneförderer entfernen.
- Auf ungewohnte **Geräusche**, Lecks und Alarme achten.

Was genau und wie oft, steht im Wartungsplan der Maschine. Im HoferTool steht unter Maschinen die Wartungshistorie.

### Warum braucht eine CNC Backup-Batterien?
Bei vielen Maschinen speichern Batterien die **Position der Absolutgeber** (und teils Parameter), solange der Strom aus ist. Sind sie leer, verliert die Maschine ihren Bezug und muss neu referenziert werden, im schlimmsten Fall gehen Daten verloren. Darum wechselt man sie regelmässig und **bei eingeschalteter Maschine** (sonst gehen die Daten genau dann verloren). Im HoferTool mahnt die Startseite rechtzeitig.

### Was mache ich nach einer Kollision (Crash)?
1. **Not-Aus**, nichts mehr bewegen.
2. Sofort den Einrichter oder Ausbildner holen, auch wenn scheinbar nichts kaputt ist.
3. Nicht selbst weiterfahren: Werkzeughalter, Revolver oder Spindel können verschoben sein, das nächste Teil stimmt nicht mehr.
4. Ehrlich erzählen, was passiert ist. Fehler passieren allen; verschweigen ist gefährlich und teuer.

## Elektro-Grundlagen

### Was ist das Ohmsche Gesetz?
**U = R × I**
- U = Spannung in Volt (V)
- R = Widerstand in Ohm (Ω)
- I = Strom in Ampere (A)
Leistung: **P = U × I** in Watt (W).

Beispiel: 230 V und 2 A → P = 460 W.

### Darf ich an elektrischen Teilen der Maschine arbeiten?
**Nein**, nur ausgebildete Elektrofachleute. Schaltschränke bleiben zu. Auch bei ausgeschalteter Maschine können Kondensatoren noch Spannung haben. Sieht ein Kabel beschädigt aus: Maschine ausschalten und melden.

### Was bedeuten die Leuchtfarben an der Maschine?
Meist (je nach Hersteller):
- **Grün**: Maschine läuft im Automatik.
- **Gelb/Orange**: Halt, Warnung, wartet (z. B. Programmende, Stange zu Ende).
- **Rot**: Alarm, Störung.

Die Signalsäule sieht man von weitem, so merkt man, wo es Arbeit gibt.
