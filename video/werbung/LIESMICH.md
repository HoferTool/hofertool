# Werbevideo Hofer Tool (HyperFrames)

50 Sekunden, 1920 × 1080, mit Stimme und Musik. Ablauf: Firma (Lohn-Ammannsegg, seit 1928,
4. Generation), Probleme ohne Tool (Zettel, Papier, „Was läuft gerade?“), Auftritt Hofer Tool,
dann echte Abläufe aus der App mit Testdaten: Planwand ziehen, Suche mit Strg + K, Pad Mode
mit Stückzahl, Handy, Bestellungen/Einkauf/Rechner, Schluss.

- `index.html`: alle Szenen mit GSAP, Ton aus `assets/ton.wav`.
- `assets/k_*.mp4`: Bildschirmaufnahmen aus dem Prüfstand (nur Testdaten).
- `werkzeuge/aufnahme.py`, `werkzeuge/einkauf.py`: nehmen die Abläufe und Bilder neu auf (Pfade darin anpassen).
- `werkzeuge/saetze.txt`: Sprechtext. Stimme: Piper, deutsche Stimme „thorsten high“ (sherpa-onnx tts-models auf GitHub).
- `werkzeuge/musik.py`: erzeugt die Musik selbst (120 BPM, keine fremden Rechte).
- `werkzeuge/mischen.sh`: legt die Sätze an ihre Zeiten, duckt die Musik unter der Stimme, ergibt `ton.wav`.

`ton.wav` ist nicht im Repository (9 MB). Zuerst Stimme und Musik erzeugen und mischen,
dann `cd video/werbung` und `npx hyperframes render --quality high -o hofertool-werbung.mp4`.
