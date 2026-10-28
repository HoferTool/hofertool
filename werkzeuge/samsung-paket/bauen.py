# Baut das App-Paket für den URL Launcher der Samsung-Bildschirme
# (Tizen): hoferempfang.wgt und sssp_config.xml in public/samsung/.
# Am Bildschirm unter URL Launcher eintragen:
#   https://hofertool.github.io/hofertool/samsung
# Neue Bildschirme (Tizen 7, Samsung QM32C) verlangen: <name> gleich wie
# <widgetname>, Profil "tv", App-ID <Paket>.app, ein Symbol (1.1.0, 28. Oktober 2026).
# Nach einer Änderung hier VERSION hochzählen, sonst installiert der
# Bildschirm das Paket nicht neu. Aufruf: python werkzeuge/samsung-paket/bauen.py
import os, zipfile
VERSION = "1.1.0"
hier = os.path.dirname(os.path.abspath(__file__))
ziel = os.path.join(hier, "..", "..", "public", "samsung")
os.makedirs(ziel, exist_ok=True)
wgt = os.path.join(ziel, "hoferempfang.wgt")
with zipfile.ZipFile(wgt, "w", zipfile.ZIP_DEFLATED) as z:
    for name in ("config.xml", "index.html", "icon.png"):
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 26, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        with open(os.path.join(hier, name), "rb") as f:
            z.writestr(info, f.read())
groesse = os.path.getsize(wgt)
with open(os.path.join(ziel, "sssp_config.xml"), "w", encoding="utf-8", newline="\n") as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?>\n<widget>\n'
            f'  <ver>{VERSION}</ver>\n  <size>{groesse}</size>\n'
            '  <widgetname>hoferempfang</widgetname>\n  <webtype>tizen</webtype>\n</widget>\n')
print("ok", groesse, "Bytes")
