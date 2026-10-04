# Baut das Werbevideo 6 (englische Stimme, Texte im Bild deutsch): index.html aus vorlage.html.txt, Musik und Stimme.
# Start auf der Schweizer Karte, Inhaber und GL, eine Maschine mit Herstellern und Werkstoffen, Probleme, Hofer Tool, Bestellungen, Solar live.
import json, math, os, re, subprocess, sys

HIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STIMME = os.environ.get("STIMME", os.path.join(HIER, "stimme"))
os.chdir(HIER)
# Gemeinsame Dateien (Aufnahmen, Schrift, GSAP) teilt sich das Video mit Fassung 3
import shutil
for f in ["k_planwand.mp4", "k_suche.mp4", "k_pad.mp4", "gsap.min.js", "MotionPathPlugin.min.js", "inter.woff2", "logo-weiss.png",
          "einkauf.png", "bestellungen.png", "rechner.png", "start.png", "solarband.png"]:
    if not os.path.exists("assets/" + f) and os.path.exists("../werbung3/assets/" + f):
        shutil.copy("../werbung3/assets/" + f, "assets/" + f)

# ---------- Maschinen ----------
def pfeil(x1, y1, x2, y2, farbe, text, tx, ty):
    w = math.atan2(y2 - y1, x2 - x1); l = 16
    a = (x2 - l * math.cos(w - 0.45), y2 - l * math.sin(w - 0.45))
    b = (x2 - l * math.cos(w + 0.45), y2 - l * math.sin(w + 0.45))
    return (f'<g class="ax"><line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{farbe}" stroke-width="5" stroke-linecap="round"/>'
            f'<polygon points="{x2},{y2} {a[0]:.1f},{a[1]:.1f} {b[0]:.1f},{b[1]:.1f}" fill="{farbe}"/>'
            f'<text x="{tx}" y="{ty}" fill="{farbe}" font-family="Inter" font-weight="900" font-size="30">{text}</text></g>')

BAHN = "M352 300 L432 300 L438 307 L506 307 L506 318 L548 318 L566 334 L566 345"
PROFIL = "M360 318 L430 318 L438 323 L500 323 L500 331 L545 331 L555 339 L555 351 L545 359 L500 359 L500 367 L438 367 L430 372 L360 372 Z"
FX, FY, FZ, FC = "#ff6b81", "#4ade80", "#6ba4ff", "#f0b429"

def maschine(p, marke, farbe, lr="", lg="", wz_fest=False):
    wz_tf = ' transform="translate(432 300)"' if wz_fest else ""
    achsen = (pfeil(130, 460, 250, 460, FZ, "Z", 258, 470) + pfeil(130, 460, 130, 398, FX, "X", 142, 405)
              + pfeil(130, 460, 88, 486, FY, "Y", 62, 482)
              + f'<g class="ax"><path d="M458 296 A14 52 0 1 0 482 296" fill="none" stroke="{FC}" stroke-width="5"/>'
                f'<polygon points="484,290 474,302 490,304" fill="{FC}"/><text x="494" y="292" fill="{FC}" font-family="Inter" font-weight="900" font-size="30">C</text></g>')
    return f'''<svg class="m-svg" id="{p}-svg" viewBox="0 0 900 640">
  <defs>
    <linearGradient id="{p}kg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef1f5"/><stop offset="1" stop-color="#a3adb9"/></linearGradient>
    <linearGradient id="{p}mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".5" stop-color="#8d96a0"/><stop offset="1" stop-color="#d5dae0"/></linearGradient>
    <radialGradient id="{p}fg"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".4" stop-color="#ffb020"/><stop offset="1" stop-color="rgba(255,120,0,0)"/></radialGradient>
    <clipPath id="{p}fc"><rect x="90" y="200" width="480" height="290" rx="14"/></clipPath>
  </defs>
  <ellipse cx="420" cy="602" rx="420" ry="24" fill="rgba(0,0,0,.45)"/>
  <rect x="80" y="560" width="70" height="34" fill="#2a323d"/><rect x="690" y="560" width="70" height="34" fill="#2a323d"/>
  <rect x="40" y="120" width="760" height="450" rx="26" fill="url(#{p}kg)"/>
  <rect x="40" y="120" width="760" height="58" rx="26" fill="{farbe}"/><rect x="40" y="150" width="760" height="28" fill="{farbe}"/>
  <text x="72" y="162" font-family="Inter" font-weight="900" font-size="32" fill="#fff" letter-spacing="5">{marke}</text>
  <rect x="84" y="194" width="492" height="302" rx="18" fill="#3a4452"/>
  <g clip-path="url(#{p}fc)">
    <rect x="90" y="200" width="480" height="290" fill="#0b1424"/>
    <path d="M90 250 H570 M90 300 H570 M90 350 H570 M90 400 H570 M90 450 H570 M150 200 V490 M250 200 V490 M350 200 V490 M450 200 V490 M550 200 V490" stroke="rgba(107,164,255,.08)" stroke-width="1"/>
    <rect x="90" y="315" width="250" height="60" fill="url(#{p}mg)"/>
    <rect x="300" y="282" width="60" height="126" rx="6" fill="#4b5563"/>
    <path d="{PROFIL}" fill="url(#{p}mg)"/>
    <path class="bahn" d="{BAHN}" pathLength="1" fill="none" stroke="{farbe}" stroke-width="5" stroke-dasharray="1" stroke-dashoffset="1" stroke-linejoin="round"/>
    <path d="{BAHN}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2" stroke-dasharray="6 8"/>
    <g class="wz"{wz_tf}>
      <rect x="-16" y="-130" width="32" height="112" rx="4" fill="#6b7685"/>
      <rect x="-22" y="-30" width="44" height="16" rx="3" fill="#4b5563"/>
      <polygon points="-14,-14 14,-14 0,0" fill="#f0b429"/>
      <circle class="funke" cx="0" cy="0" r="14" fill="url(#{p}fg)"/>
    </g>
    {achsen}
  </g>
  <polygon points="96,206 260,206 140,484 96,484" fill="rgba(255,255,255,.05)"/>
  <rect x="612" y="194" width="160" height="302" rx="12" fill="#1b2330"/>
  <rect x="628" y="210" width="128" height="92" rx="6" fill="{farbe}" opacity=".85"/>
  <path d="M640 232 H730 M640 252 H710 M640 272 H740" stroke="rgba(255,255,255,.6)" stroke-width="5" stroke-linecap="round"/>
  <g fill="#3a4452">{"".join(f'<rect x="{632 + c * 32}" y="{322 + r * 30}" width="24" height="20" rx="4"/>' for r in range(4) for c in range(4))}</g>
  <circle cx="692" cy="466" r="17" fill="#e11d48" stroke="#f0b429" stroke-width="4"/>
  <rect x="748" y="118" width="6" height="12" fill="#5d6a7a"/>
  <rect x="738" y="40" width="26" height="80" rx="5" fill="#1b2330"/>
  <rect {f'id="{lr}"' if lr else ''} x="741" y="44" width="20" height="22" rx="3" fill="#ff2d55" opacity=".25"/>
  <rect x="741" y="69" width="20" height="22" rx="3" fill="#f0b429" opacity=".25"/>
  <rect {f'id="{lg}"' if lg else 'class="lampe"'} x="741" y="94" width="20" height="22" rx="3" fill="#4ade80" opacity=".25"/>
</svg>'''

# ---------- Solar ----------
panels = []
def rand(y): return 350 - (y - 170) * 100 / 130 + 14, 1150 + (y - 170) * 100 / 130 - 14
for r in range(3):
    y0 = 178 + r * 40; y1 = y0 + 35
    l0, r0 = rand(y0); l1, r1 = rand(y1)
    for c in range(10):
        f0, f1 = c / 10, (c + 1) / 10
        pts = [(l0 + (r0 - l0) * f0 + 3, y0), (l0 + (r0 - l0) * f1 - 3, y0), (l1 + (r1 - l1) * f1 - 3, y1), (l1 + (r1 - l1) * f0 + 3, y1)]
        panels.append('<polygon class="s-p" fill="url(#s-pg)" stroke="#9cc3ff" stroke-width="1.5" points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + '"/>')
strahlen = "".join(f'<line x1="{80 * math.cos(a):.1f}" y1="{80 * math.sin(a):.1f}" x2="{112 * math.cos(a):.1f}" y2="{112 * math.sin(a):.1f}"/>'
                   for a in [k * math.pi / 6 for k in range(12)])

# ---------- Regal im Stillstand ----------
stangen = "".join(f'<rect class="p1-st" x="40" y="{y}" width="640" height="22" rx="11" fill="#c9ced4" stroke="#8d96a0" stroke-width="2"/>'
                  for y in (102, 126, 272, 296, 442, 466))

# ---------- Was läuft ----------
fragen = "".join(f'<div class="p3-m"><b>{m["name"]}</b><span>?</span></div>' for m in [{"name": n} for n in ["SW-20", "SB-20", "SR-32", "SR-10", "Hanwha", "C100"]])
burst = '<div class="r-st"></div>' * 16

# ---------- Material ----------
MAT = {"V2A": ("v2a", "#b3261e", False), "V4A": ("v4a", "#7a838d", False), "Chromstahl": ("chrom", "#d4638f", False), "Stahl": ("stahl", "#003884", False),
       "Alu": ("alu", "#eef1f5", True), "Messing": ("messing", "#f0b429", True), "Neusilber": ("neusilber", "#c2650f", False)}
ZEILEN = [
    ("SW-20", [(190, 420, "V2A", "10007"), (630, 380, "Messing", "10012"), (1030, 560, "Stahl", "10019")]),
    ("SB-20", [(190, 300, "Alu", "10003"), (510, 520, "V4A", "10009"), (1050, 400, "Neusilber", "10021")]),
    ("SR-32", [(190, 600, "Chromstahl", "10004"), (810, 360, "V2A", "10014"), (1190, 420, "Messing", "10022")]),
    ("SR-10", [(190, 380, "Neusilber", "10005"), (590, 440, "Stahl", "10011"), (1050, 520, "Alu", "10017")]),
    ("Hanwha", [(190, 500, "Messing", "10006"), (710, 420, "Chromstahl", "10013"), (1150, 380, "V4A", "10020")]),
    ("C100", [(190, 440, "Stahl", "10008"), (650, 520, "V2A", "10015"), (1190, 420, "Alu", "10023")]),
]
ZIEL = ("SR-10", "10011")
matplan = ['<div class="mat-zeile" style="top:0;height:62px">' + "".join(
    f'<b style="left:{190 + k * 300}px;top:18px">{tag}</b>' for k, tag in enumerate(["Mo", "Di", "Mi", "Do", "Fr"])) + "</div>"]
for z, (name, balken) in enumerate(ZEILEN):
    top = 70 + z * 74
    inhalt = f'<b>{name}</b>'
    for x, w, mat, nr in balken:
        k, farbe, hell = MAT[mat]
        ziel = (name, nr) == ZIEL
        punkt = '<em style="position:absolute;right:16px;top:0">●</em>' if ziel else ""
        zid = ' id="mat-ziel"' if ziel else ""
        inhalt += (f'<div class="mat-balken mb-{k}{" hell" if hell else ""}"{zid} '
                   f'style="left:{x}px;width:{w - 12}px;background:{farbe}">{"○" if ziel else "▶"} {nr} · {mat}{punkt}</div>')
    matplan.append(f'<div class="mat-zeile" style="top:{top}px">{inhalt}</div>')
legende = "".join(f'<div class="mat-chip"><i style="background:{f}"></i>{n}</div>' for n, (k, f, h) in MAT.items())
matfarben = "\n      ".join(
    f'F(".mb-{k}", {{ scale: 1, filter: "brightness(1)" }}, {{ scale: 1.06, filter: "brightness(1.5)", duration: 0.08, yoyo: true, repeat: 1, ease: "power1.out", ...nicht }}, {46.3 + i * 0.17:.2f});'
    for i, (k, f, h) in enumerate(MAT.values()))
# Zielbalken: Mitte in Plankoordinaten, Kamera so schieben, dass er bei (650, 200) landet
zx, zy, zw = 590, 70 + 3 * 74 + 37, 440
s, cx, cy = 1.9, 850, 270
matx = round(650 - (cx + s * (zx + zw / 2 - cx)))
maty = round(200 - (cy + s * (zy - cy)))
ring = f'left:{zx + zw - 12 - 16 - 8 - 45}px;top:{zy - 45}px;opacity:0'


# ---------- Karte ----------
K = json.load(open("werkzeuge/karte.json"))
NS = 'vector-effect="non-scaling-stroke"'
karte = (f'<path id="k-land" d="{K["land"]}" fill="#0f1c33" stroke="#6ba4ff" stroke-width="3" {NS}/>'
         + "".join(f'<path class="k-kt" d="{d}" fill="#132442" stroke="rgba(107,164,255,.55)" stroke-width="1.2" {NS}/>' for d in K["kantone"])
         + f'<path id="k-so" d="{K["so"]}" fill="#1f6fe0" fill-opacity="0" stroke="#9cc3ff" stroke-width="2.5" {NS}/>'
         + "".join(f'<path class="k-gm" d="{d}" fill="none" stroke="rgba(156,195,255,.45)" stroke-width="1" {NS}/>' for d in K["gemeinden"])
         + f'<path d="{K["seen"]}" fill="#1b4a8a" fill-opacity=".8" stroke="none"/>'
         + f'<path id="k-lohn" d="{K["lohn"]}" fill="#1f6fe0" fill-opacity=".2" stroke="#ffffff" stroke-width="3" {NS}/>')
karte_js = json.dumps({"so": K["soMitte"], "lohn": K["lohnMitte"]})

# Firmengebäude (fällt auf den Punkt), mit Solar auf dem Dach und Logo an der Front
dach = []
for r in range(2):
    for c in range(8):
        x = 150 + c * 50 + r * 18; y = 70 + r * 26
        dach.append(f'<polygon class="k-dach" points="{x},{y} {x + 44},{y} {x + 58},{y + 22} {x + 14},{y + 22}" fill="#2b5fb8" stroke="#9cc3ff" stroke-width="1.5"/>')
haus = f'''          <svg id="k-haus" viewBox="0 0 700 400">
            <ellipse cx="350" cy="384" rx="330" ry="18" fill="rgba(0,0,0,.5)"/>
            <polygon points="120,60 560,60 640,130 200,130" fill="#2a3442"/>
            {"".join(dach)}
            <polygon points="560,60 640,130 640,380 560,320" fill="#2b3646"/>
            <rect x="60" y="130" width="580" height="250" fill="#d9dee5"/>
            <polygon points="60,130 120,60 200,130" fill="#bfc6cf"/>
            <rect x="60" y="130" width="580" height="16" fill="#1f6fe0"/>
            <rect x="90" y="250" width="110" height="130" fill="#3a4452"/>
            <rect x="230" y="270" width="380" height="70" rx="4" fill="#9fb6d1" opacity=".7"/>
            <rect x="230" y="160" width="380" height="88" rx="8" fill="#0b1424"/>
            <image href="assets/logo-weiss.png" x="268" y="168" width="200" height="74"/>
            <text x="480" y="216" fill="#eaf1fb" font-family="Inter" font-weight="800" font-size="20" letter-spacing="3">SEIT 1928</text>
          </svg>'''

# ---------- Team (von hoferco.ch, Seite Team) ----------
# Namen und Fotos liegen nicht im Repository (Personendaten), sondern in werkzeuge/team.json und assets/team/
TEAM = [(p["name"], p["rolle"], p["aufgaben"], p["foto"], p["ausschnitt"]) for p in json.load(open("werkzeuge/team.json", encoding="utf-8"))] if os.path.exists("werkzeuge/team.json") else []
breite, klein, abst = 330, 280, 24
links0 = (1920 - (breite + 40 + 4 * klein + 3 * abst)) // 2
# Patrick (Inhaber) gross mit Abzeichen, die GL kleiner und nur mit Namen
def teamkarte(i, n, f, pos):
    if i == 0:
        return (f'          <div class="t-karte inhaber" id="t-inhaber" style="left:{links0}px"><div class="t-foto"><img src="assets/team/{f}" style="object-position:{pos}" alt=""/></div>'
                f'<b>{n}</b><em>Inhaber</em></div>')
    return (f'          <div class="t-karte klein" id="t-gl{i - 1}" style="left:{links0 + breite + 40 + (i - 1) * (klein + abst)}px"><div class="t-foto"><img src="assets/team/{f}" style="object-position:{pos}" alt=""/></div>'
            f'<b>{n}</b></div>')
team = "\n".join(teamkarte(i, n, f, pos) for i, (n, r, a, f, pos) in enumerate(TEAM))
inh_x = 960 - (links0 + breite // 2)

# ---------- Eine Maschine mit Stangenlader ----------
FARBE = {"star": "#1f6fe0", "hanwha": "#f37321", "index": "#d6002a", "wm": "#0f8f8a"}
MX, MY, MS = 150, 300, 1.0
lb, hb = 560 * MS, 100 * MS
maschine_html = (f'<div class="h-lader" style="left:{MX - lb + 30 * MS:.0f}px;top:{MY + 300 * MS:.0f}px;width:{lb:.0f}px;height:{hb:.0f}px"><i></i><b></b></div>\n'
                 f'<div id="c-ma" style="left:{MX}px;top:{MY}px;width:{900 * MS:.0f}px;height:{640 * MS:.0f}px">'
                 + maschine("cm", "CNC", "#1f6fe0", wz_fest=True).replace('class="m-svg" ', "") + "</div>")
# Hersteller als Schilder untereinander, Zeit = wann die Stimme den Namen sagt
SCHILD = [("star", "STAR", 18.6), ("hanwha", "HANWHA", 19.6), ("index", "INDEX", 20.3), ("wm", "WILLEMIN-MACODEL", 21.4)]
schilder_html = "\n".join(f'            <div class="c-zeile"><div class="c-schild" id="hs-{k}" style="background:{FARBE[k]}">{t}{"<small>NEU</small>" if k == "wm" else ""}</div></div>'
                          for k, t, _ in SCHILD)
schilder_js = json.dumps([[k, t] for k, _, t in SCHILD])
# Werkstoffe in den Farben der Planwand
# Die Stimme sagt nur "viele verschiedene Materialien"; gezeigt werden die üblichen (ohne Kunststoff, Titan, Ecobrass)
WERKSTOFFE = [(n, f, round(22.7 + i * 0.17, 2)) for i, (n, f) in enumerate([("Stahl", "#003884"), ("V2A", "#b3261e"), ("V4A", "#7a838d"), ("Chromstahl", "#d4638f"),
              ("Aluminium", "#eef1f5"), ("Messing", "#f0b429"), ("Neusilber", "#c2650f"), ("Bronze", "#a0682a")])]
werkstoffe_html = "\n".join(f'            <div class="c-w" id="cw{i}"><i style="background:{f}"></i>{n}</div>' for i, (n, f, _) in enumerate(WERKSTOFFE))
werkstoffe_js = "\n      ".join(f'F("#cw{i}", {{ opacity: 0, scale: 0.4, y: 40 }}, {{ opacity: 1, scale: 1, y: 0, duration: 0.3, ease: "back.out(2.5)" }}, {t - 0.05});'
                                 for i, (_, _, t) in enumerate(WERKSTOFFE))

# ---------- Weitere Funktionen ----------
WORTE = ["Einkaufsliste", "Werkstatt-Rechner", "Dokumente", "Notizen", "Fortschritt", "Werkzeugwechsel", "Einrichtblatt", "HOCO Nummern", "Ferien", "Gravur", "DXF", "G-Code", "Suche", "Offline", "und vieles mehr"]
POS = [(150, 170), (640, 130), (1240, 190), (300, 360), (760, 330), (1200, 380), (130, 560), (560, 530), (1040, 570), (1500, 560), (220, 760), (660, 730), (1080, 760), (1480, 760), (700, 900)]
wolke = "".join(f'<div class="o-wort{" gross" if w == "und vieles mehr" else ""}" style="left:{x}px;top:{y}px">{w}</div>' for w, (x, y) in zip(WORTE, POS))

# ---------- iPhones ----------
def handy(id_, video, start, dauer, x, y):
    return f'''        <div class="geraet handy-g" id="{id_}" style="left:{x}px;top:{y}px">
          <div class="ip-knopf" style="left:-5px; top:190px; height:44px"></div>
          <div class="ip-knopf" style="left:-5px; top:260px; height:80px"></div>
          <div class="ip-knopf" style="left:-5px; top:360px; height:80px"></div>
          <div class="ip-knopf" style="left:460px; top:280px; height:120px"></div>
          <div class="ip-rahmen"></div><div class="ip-innen"></div>
          <div class="vwrap"><div class="ip-status"><b>08:19</b><span><i style="height:8px"></i><i style="height:12px"></i><i style="height:16px"></i><i style="height:20px"></i><em></em></span></div><video id="v-{id_}" class="clip" style="top:54px;width:424px;height:870px" src="assets/{video}" muted playsinline data-start="{start}" data-duration="{dauer}" data-track-index="3"></video></div>
          <div class="ip-insel"></div>
          <div class="ip-glanz"><i class="glanz"></i></div>
        </div>'''

# ---------- Material: Zeitpunkte ----------
matfarben = "\n      ".join(
    f'F(".mb-{k}", {{ scale: 1, filter: "brightness(1)" }}, {{ scale: 1.06, filter: "brightness(1.5)", duration: 0.08, yoyo: true, repeat: 1, ease: "power1.out", ...nicht }}, {42.2 + i * 0.17:.2f});'
    for i, (k, f, h) in enumerate(MAT.values()))

# ---------- HTML ----------
html = open("werkzeuge/vorlage.html.txt", encoding="utf-8").read()
ersatz = {
    "<!--CSS_BASIS-->": open("werkzeuge/css_basis.txt", encoding="utf-8").read(),
    "<!--CSS_ALT-->": open("werkzeuge/css_alt.txt", encoding="utf-8").read(),
    "<!--KARTE-->": karte, "<!--HAUS-->": haus, "<!--TEAM-->": team,
    "<!--MASCHINE-->": maschine_html, "<!--SCHILDER-->": schilder_html, "<!--WERKSTOFFE-->": werkstoffe_html,
    "@@WERKSTOFF_JS@@": werkstoffe_js, "@@ZEITEN@@": open("werkzeuge/zeiten6.json").read(), "@@INH_X@@": str(inh_x),
    "<!--PANELS-->": "".join(panels), "<!--STRAHLEN-->": strahlen, "<!--STANGEN-->": stangen,
    "<!--P1MASCHINE-->": maschine("p1", "CNC", "#5d6a7a", lr="p1-lr", lg="p1-lg", wz_fest=True),
    "<!--FRAGEN-->": fragen, "<!--BURST-->": burst, "<!--MATPLAN-->": "".join(matplan), "<!--LEGENDE-->": legende,
    "<!--WOLKE-->": wolke,
    "<!--HANDY1-->": handy("g-handy1", "k_handy.mp4", 56.9, 2.5, 1120, 60),
    "<!--HANDY2-->": handy("g-handy2", "k_solar.mp4", 74.5, 4.0, 1330, 70),
    "@@KARTE_JS@@": karte_js, "@@SCHILDER_JS@@": schilder_js,
    "@@MATFARBEN@@": matfarben, "@@MATX@@": str(matx), "@@MATY@@": str(maty),
}
for a, b in ersatz.items(): html = html.replace(a, b)
html = html.replace('<div id="mat-ring"></div>', f'<div id="mat-ring" style="{ring}"></div>')
assert "@@" not in html and not re.search(r"<!--[A-Z0-9_]+-->", html), "Platzhalter übrig"
open("index.html", "w", encoding="utf-8").write(html)
print("index.html", len(html) // 1024, "KB")
if "--nur-html" in sys.argv: sys.exit()

# ---------- Musik ----------
L = 83.9
cfg = dict(laenge=L, aus="musik.wav", t=dict(groove=7.7, probleme=27.0, drop=37.6, outro=78.5),
           schnitte=[7.7, 15.5, 27.0, 29.8, 33.7, 39.9, 44.5, 49.3, 52.6, 56.9, 59.4, 71.0, 73.6],
           stiche=[1.45, 4.7, 18.6, 19.6, 20.3, 21.4, 24.3, 28.2, 77.45])
json.dump(cfg, open("musik.json", "w"))
subprocess.run([sys.executable, "werkzeuge/musik.py", "musik.json"], check=True)

# ---------- Stimme ----------
START = [0.4, 3.2, 7.9, 15.7, 22.5, 27.1, 29.9, 33.8, 37.7, 40.0, 44.6, 49.4, 52.7, 57.0, 59.6, 71.3, 73.7, 78.6]
ein, fc, mix = [], "", ""
for i, t in enumerate(START):
    ein += ["-i", os.path.join(STIMME, f"s{i + 1}.wav")]; ms = int(t * 1000)
    fc += f"[{i}:a]aresample=44100,adelay={ms}|{ms}[v{i}];"; mix += f"[v{i}]"
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *ein, "-filter_complex",
                f"{fc}{mix}amix=inputs={len(START)}:normalize=0,apad=whole_dur={L},atrim=0:{L},highpass=f=70,"
                # Mehr Wums: Druck im Bass, Präsenz, kräftig komprimiert, leicht gesättigt
                "equalizer=f=140:t=q:w=1:g=-1,equalizer=f=400:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=4,equalizer=f=9000:t=q:w=1:g=2,"
                "acompressor=threshold=-24dB:ratio=4:attack=3:release=90:makeup=7,asoftclip=type=tanh,aformat=channel_layouts=stereo[v]",
                "-map", "[v]", "stimme.wav"], check=True)
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", "musik.wav", "-i", "stimme.wav", "-filter_complex",
                "[1:a]asplit=2[sc][vo];[0:a]volume=0.42,equalizer=f=2500:t=q:w=1:g=-4[mu];[mu][sc]sidechaincompress=threshold=0.02:ratio=7:attack=8:release=300[duck];"
                "[duck][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=11[out]",
                "-map", "[out]", "-ar", "44100", "assets/ton.wav"], check=True)
r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", "assets/ton.wav", "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
print([z.strip() for z in r.stderr.splitlines() if "I:" in z][-1])
