# Werbevideo Hofer Tool, Fassung 3 (HyperFrames)

74 Sekunden, 1920 × 1080, Frauenstimme und eigene Musik. Ablauf:

1. Präzision aus Lohn-Ammannsegg, seit 1928, Familie Hofer in der 4. Generation
2. (Platz für das GL-Team, siehe unten)
3. Maschinenpark: 20+ CNC-Maschinen, dann SW-20, SB-20, SR-32, SR-10 (Star), Hanwha und INDEX C100, jede mit Achsen X, Y, Z, C und Werkzeugbahn
4. Solaranlage auf dem Dach, mit dem Solarband der Startseite
5. Probleme: Stillstand ohne Material, Zettel und Ordner, „Was läuft gerade?“
6. Auftritt Hofer Tool, dann Planwand, Material in Farbe mit rotem Punkt, Suche, Pad Mode, iPhone, Bestellungen/Einkauf/Rechner/Dokumente, Schluss

Alle Aufnahmen kommen aus dem Prüfstand und zeigen nur Testdaten.

## Dateien

- `index.html`: fertige Komposition (wird von `werkzeuge/bauen.py` aus `werkzeuge/vorlage.html.txt` erzeugt, nicht von Hand ändern).
- `werkzeuge/bauen.py`: setzt Maschinen, Material, Solar und Zeiten ein, erzeugt Musik (`werkzeuge/musik.py`) und mischt die Stimme dazu. Ergibt `assets/ton.wav`.
- `werkzeuge/saetze.txt`: Sprechtext, ein Satz pro Zeile.
- `werkzeuge/aufnahme.py`: nimmt die Abläufe im Prüfstand neu auf.
- `team.json` (optional, neben `index.html`): `[{"name": "…", "rolle": "…", "foto": "datei.jpg"}]`. Dann schiebt `bauen.py` die GL-Szene nach der Familie ein und verschiebt alles danach im Takt der Musik.

## Neu erzeugen

Stimme (Piper, deutsche Frauenstimme „kerstin low“ von den sherpa-onnx tts-models auf GitHub), je Zeile von `saetze.txt`:

```
piper -m de_DE-kerstin-low.onnx --length-scale 0.9 --sentence-silence 0.12 -f roh$i.wav
ffmpeg -nostdin -i roh$i.wav -af "aresample=44100:resampler=soxr,afade=t=in:d=0.01,apad=pad_dur=0.25" stimme/s$i.wav
```

Dann `python3 werkzeuge/bauen.py` und `npx hyperframes@0.8.116 render --fps 30 --quality high -o werbung3.mp4`.
`ton.wav` ist nicht im Repository.
