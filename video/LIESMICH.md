# Promo-Video (HyperFrames)

Kurzes Werbevideo für das Hofer Tool, 27 Sekunden, 1920 × 1080, gebaut mit
[HyperFrames](https://github.com/heygen-com/hyperframes). Gehört nicht zur App
und wird von Vite nicht mitgebaut.

- `index.html`: alle sechs Szenen (Auftakt, Planwand, Produktion, Pad Mode, Mehr, Schluss) mit GSAP.
- `assets/`: Bildschirmfotos aus dem Prüfstand (nur Testdaten), weisses Logo, Schrift Inter, GSAP lokal.
- `bildschirmfotos.py`: nimmt die Bildschirmfotos neu auf (vorher im Hauptordner `npm run build`).

Neu rendern: `cd video` und `npx hyperframes render --quality high -o hofertool-promo.mp4`.
