# Werbevideo Hofer Tool, Fassung 4 (HyperFrames)

76 Sekunden, 1920 × 1080, Männerstimme und eigene Indie-Rock-Musik. Ablauf:

1. Flug über die Schweizer Karte auf den Kanton Solothurn und Lohn-Ammannsegg, das Firmengebäude fällt auf den Punkt („Hofer + Co. Präzisionsdrehteile“, seit 1928)
2. Die Geschäftsleitung (Namen und Fotos von hoferco.ch, Seite Team)
3. Maschinenhalle: CNC-Drehmaschinen mit Stangenlader, oben die Hersteller Star, Hanwha, INDEX und neu Willemin-Macodel
4. Bis 42 mm Stangendurchmesser
5. Probleme: Stillstand ohne Material, Zettel und Ordner, „Was läuft gerade?“
6. Hofer Tool: Planwand, Material in Farbe, Suche, Pad Mode, Handy, Bestellungen, weitere Funktionen
7. Zum Schluss als Pluspunkt: die Solaranlage auf dem Dach, live in der App

Die Aufnahmen aus der App kommen aus dem Prüfstand und zeigen nur Testdaten.

## Was nicht im Repository liegt

Das Repository ist öffentlich. Darum fehlen hier `werkzeuge/team.json` (Namen und Funktionen der GL),
`assets/team/` (Fotos) und die daraus erzeugte `index.html`. Ohne `team.json` baut `bauen.py` die Szene ohne Karten.

`team.json`: `[{"name": "…", "rolle": "…", "aufgaben": "…", "foto": "datei.jpg", "ausschnitt": "50% 30%"}]`

## Neu erzeugen

1. Stimme: `werkzeuge/saetze.txt` (Zeilen `nr|text`, mit Lautschrift-Tricks wie „Tuhl“ für „Tool“).
   `PIPER_STIMME=…/de_DE-thorsten-high.onnx python3 werkzeuge/tts.py werkzeuge/saetze.txt` im Ordner `stimme/`.
   Die Stimme stammt aus den sherpa-onnx tts-models auf GitHub (vits-piper-de_DE-thorsten-high).
2. Aussprache prüfen: `WHISPER=…/sherpa-onnx-whisper-small/ python3 werkzeuge/asr.py stimme/s*.wav` schreibt auf, was ein Spracherkenner versteht.
3. Karte: `node werkzeuge/karte.js` (braucht `npm i swiss-maps topojson-client d3-geo`) erzeugt `karte.json`.
4. `python3 werkzeuge/bauen.py` erzeugt `index.html`, Musik (`werkzeuge/musik.py`) und `assets/ton.wav`.
   Fehlende Aufnahmen und Bilder holt es aus `../werbung3/assets/`.
5. `npx hyperframes@0.8.116 render --fps 30 --quality high -o werbung4.mp4`
