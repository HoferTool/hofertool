# Werbevideo Hofer Tool, November 2026 (HyperFrames)

2:44 Min., 1920 × 1080, Stimme von ElevenLabs (Text in `werkzeuge/sprechtext.txt`), eigene Musik (`werkzeuge/musik.py`). Ablauf:

1. Firma von oben (Drohnenfoto), «Präzisionsdrehteile, seit 1928»; gesprochen wird nur der Inhaber
2. Ohne Stimme, nur eingeblendet: Geschäftsleitung, Team auf drei Folien, Halle mit den Maschinen, Feiern (Montage), Ordnung
3. Dunkler Teil: Magnetwand, Material doppelt oder gar nicht bestellt, Rest im Lager nicht gefunden, zehn Excel-Versionen,
   Zettel und Stillstand, Telefon «Wann ist der Auftrag fertig?», «So konnte es nicht weitergehen»
4. «Also haben wir ein Tool entwickelt», danach Planwand, Material, Einrichtblatt, Pad Mode, QS Check, Statistik,
   Bestellungen (20 Wendeplatten bei Utilis), Infoboard und Pausenraum, Solaranlage live, Schluss

Nicht im Repository: alle Fotos und Videos (`assets/`, `mont/`), Namen und Fotos der Leute (`werkzeuge/team.json`,
`werkzeuge/teamwand.json`), die Stimme und fertige Videos.

## Neu erzeugen

1. `python3 werkzeuge/montage.py` setzt die Feier-Montage `assets/k_montage.mp4` aus den Clips und Fotos zusammen.
2. `python3 werkzeuge/zeit13.py aufnahme.mp3` schneidet die ElevenLabs-Aufnahme in die 19 Sätze (`stimme13/`); die Grenzen wählt es
   so, dass jeder Satz etwa so lang ist, wie seine Buchstaben erwarten lassen, weil ElevenLabs im Satz manchmal längere Pausen macht
   als dazwischen. Ohne MP3 schätzt es die Zeiten. `werkzeuge/asr.py stimme13/s*.wav` prüft mit Whisper (sherpa-onnx), ob jeder Satz stimmt.
3. `python3 werkzeuge/bauen13.py` baut `index.html`, Musik und `assets/ton.wav` (mit `--ohne-stimme` nur Musik).
4. `npx hyperframes@0.8.116 render --fps 30 --quality high -o werbung13.mp4 .`
