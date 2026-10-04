# Werbevideo Hofer Tool, Fassung 6 (HyperFrames)

84 Sekunden, 1920 × 1080, englische Stimme, alle Texte im Bild deutsch, eigene Elektro-Pop-Musik. Ablauf:

1. Karte: Schweiz, Solothurn, Lohn-Ammannsegg, das Gebäude fällt auf den Punkt, seit 1928
2. Der Inhaber gross, dann die Geschäftsleitung kleiner und nur mit Namen
3. Eine CNC-Drehmaschine mit Stangenlader, Hersteller Star, Hanwha, Index, Willemin-Macodel (neu), Werkstoffe, bis 42 mm
4. Probleme: Stillstand, Zettel und Ordner, „Was läuft gerade?“
5. Hofer Tool: Planwand, Material mit rotem Punkt, Suche, Pad Mode, Handy
6. Bestellungen mit Beispiel (50 Wendeplatten): Position erfassen, Status Bestellt, Bestellung als PDF, Mail
7. Sammelanzeige mit allen weiteren Funktionen, Solaranlage live, Schluss

Alle Aufnahmen kommen aus dem Prüfstand und zeigen nur Testdaten. Nicht im Repository: Namen und Fotos der GL,
die Aufnahme der Bestellungen (zeigt eine Unterschrift mit Namen), Ton und fertige Videos.

## Neu erzeugen

1. Stimme: `python3 werkzeuge/tts_en.py werkzeuge/saetze.txt` im Ordner `stimme/` (Piper „ryan high“ von den sherpa-onnx tts-models auf GitHub).
   `werkzeuge/asr_en.py` prüft mit Whisper, ob man alles versteht.
2. Aufnahmen im Prüfstand: `werkzeuge/aufnahme.py` (Handy, Solar) und `werkzeuge/aufnahme_bestellungen.py` (Bestellungen, danach schneiden wie im Verlauf beschrieben).
3. `python3 werkzeuge/bauen.py` baut `index.html`, Musik und `assets/ton.wav`. `python3 werkzeuge/poster.py` macht das Titelbild `titelbild.png`.
4. `npx hyperframes@0.8.116 render --fps 30 --quality high -o werbung6.mp4`, danach Ton und Titelbild einsetzen:
   `ffmpeg -i werbung6.mp4 -i assets/ton.wav -i titelbild.png -map 0:v -map 1:a -map 2:v -c:v:0 copy -c:v:1 mjpeg -disposition:v:1 attached_pic -c:a aac -b:a 192k -shortest werbung6-ton.mp4`

`werkzeuge/umbau5.py` und `werkzeuge/umbau6.py` haben die Vorlage einmalig umgebaut; `zeiten6.json` ordnet die alten Szenenzeiten den neuen zu.
