# Werbevideo Hofer Tool, Fassung 5 (HyperFrames)

83 Sekunden, 1920 × 1080, Männerstimme (heller gestimmt) und eigene Elektro-Pop-Musik. Ablauf:

1. Karte: Schweiz, Solothurn, Lohn-Ammannsegg, das Gebäude fällt auf den Punkt, seit 1928
2. Der Inhaber, dann die Geschäftsleitung nur mit Namen
3. Eine CNC-Drehmaschine mit Stangenlader, Hersteller Star, Hanwha, Index, Willemin-Macodel (neu), Werkstoffe und bis 42 mm
4. Probleme: Stillstand ohne Material, Zettel und Ordner, „Was läuft gerade?“
5. Hofer Tool: Planwand, Material mit rotem Punkt, Suche, Pad Mode, Handy, Bestellungen, weitere Funktionen
6. Solaranlage live in der App, Schluss

Alle Aufnahmen kommen aus dem Prüfstand und zeigen nur Testdaten.
Namen und Fotos der GL liegen nicht im Repository (`werkzeuge/team.json`, `assets/team/`).

## Neu erzeugen

1. Stimme: `python3 werkzeuge/tts.py werkzeuge/saetze.txt` im Ordner `stimme/` (Piper, „thorsten high“ von den sherpa-onnx tts-models auf GitHub),
   danach jede Datei heller stimmen:
   `ffmpeg -i sN.wav -af "rubberband=pitch=1.19:formant=preserved:pitchq=quality,highpass=f=110,equalizer=f=3000:t=q:w=1:g=4,equalizer=f=250:t=q:w=1:g=-3" …`
   `werkzeuge/asr.py` prüft mit Whisper, ob man alles versteht.
2. `werkzeuge/aufnahme.py` nimmt Handy und Solar im Prüfstand auf (390 × 800).
3. `python3 werkzeuge/bauen.py` baut `index.html`, Musik (`werkzeuge/musik.py`) und `assets/ton.wav`.
4. `npx hyperframes@0.8.116 render --fps 30 --quality high -o werbung5.mp4`, danach den Ton mit `assets/ton.wav` neu einsetzen.

`werkzeuge/umbau5.py` hat die Vorlage einmalig aus Fassung 4 umgebaut und wird nicht mehr gebraucht.
