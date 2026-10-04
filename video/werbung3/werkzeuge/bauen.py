# Baut das Werbevideo 3 zusammen: Musik, Stimme und index.html aus vorlage.html.
# Das GL-Team (team.json) wird nach der Familie eingeschoben; alles danach rutscht um GL Sekunden.
import json, math, os, subprocess, sys

HIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TON = os.environ.get("STIMME", os.path.join(HIER, "stimme"))  # Sätze s1.wav … der Stimme
os.chdir(HIER)

TEAM = json.load(open("team.json")) if os.path.exists("team.json") else []
# Länge der Team-Szene: auf ganze Takte (2 s) gerundet, damit die Musik im Takt bleibt
GL = 0 if not TEAM else 2 * math.ceil((1.6 + 1.1 * len(TEAM)) / 2)
def T(x): return round(x + GL, 3) if x >= 9.7 - 1e-6 else x

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

# Zeiten aus den Sprechpausen von Satz 3 und 4 (SW zwanzig, SB zwanzig, …)
MASCHINEN = [
    dict(name="SW-20", kick="Star · Langdreher", sub="bis Ø 20 mm", farbe="#1f6fe0", marke="STAR", t=13.4),
    dict(name="SB-20", kick="Star · Langdreher", sub="bis Ø 20 mm", farbe="#1f6fe0", marke="STAR", t=14.4),
    dict(name="SR-32", kick="Star · Langdreher", sub="bis Ø 32 mm", farbe="#1f6fe0", marke="STAR", t=15.4),
    dict(name="SR-10", kick="Star · Langdreher", sub="bis Ø 10 mm", farbe="#1f6fe0", marke="STAR", t=16.4),
    dict(name="Hanwha", kick="Langdreher", sub="aus Korea", farbe="#f37321", marke="HANWHA", t=18.3, gross=200),
    dict(name="C100", kick="INDEX · Drehzentrum", sub="Drehen und Fräsen in einem", farbe="#d6002a", marke="INDEX", t=19.55),
]
ENDE_M = 21.95
karten, karten_js = [], []
for i, m in enumerate(MASCHINEN):
    aus = MASCHINEN[i + 1]["t"] if i + 1 < len(MASCHINEN) else ENDE_M
    chips = "".join(f'<div class="m-chip" style="color:{c};border-color:{c}">{a}</div>' for a, c in (("X", FX), ("Y", FY), ("Z", FZ), ("C", FC)))
    gross = f' style="font-size:{m["gross"]}px"' if m.get("gross") else ""
    karten.append(f'''          <div class="m-karte" id="mk{i}">
            {maschine("mk" + str(i), m["marke"], m["farbe"])}
            <div class="m-nr">{i + 1:02d} / {len(MASCHINEN):02d}</div>
            <div class="m-text"><div class="m-kick" style="color:{m["farbe"] if m["farbe"] != "#1f6fe0" else "#6ba4ff"}">{m["kick"]}</div><div class="m-name"{gross}>{m["name"]}</div><div class="m-sub">{m["sub"]}</div><div class="m-chips">{chips}</div></div>
          </div>''')
    karten_js.append(dict(t=m["t"], aus=aus, bahn=BAHN))

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
fragen = "".join(f'<div class="p3-m"><b>{m["name"]}</b><span>?</span></div>' for m in MASCHINEN)
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
mx = round(650 - (cx + s * (zx + zw / 2 - cx)))
my = round(200 - (cy + s * (zy - cy)))
ring = f'left:{zx + zw - 12 - 16 - 8 - 45}px;top:{zy - 45}px'

# ---------- GL-Team ----------
team_html = team_js = ""
if TEAM:
    karten_t = []
    n = len(TEAM); breite = 440; abst = 60
    links = (1920 - (n * breite + (n - 1) * abst)) // 2
    for i, p in enumerate(TEAM):
        foto = f'<img src="assets/{p["foto"]}" alt=""/>' if p.get("foto") else "".join(w[0] for w in p["name"].split()[:2])
        karten_t.append(f'<div class="gl-karte" style="left:{links + i * (breite + abst)}px"><div class="foto">{foto}</div><b>{p["name"]}</b><span>{p["rolle"]}</span></div>')
    team_html = (f'        <div id="gl" class="clip" data-start="9.7" data-duration="{GL}" data-track-index="1">\n'
                 f'          <div id="gl-titel" class="zentriert mega">Die Geschäftsleitung</div>\n          ' + "\n          ".join(karten_t) + "\n        </div>")
    team_js = (f'      wisch(9.7); knall("#gl-titel", 9.75, 0.35);\n'
               f'      tl.fromTo(".gl-karte", {{ y: 500, opacity: 0, rotationY: -40, transformPerspective: 1800 }}, {{ y: 0, opacity: 1, rotationY: 0, duration: 0.45, ease: E, stagger: 0.25 }}, 10.2);\n'
               f'      tl.fromTo(".gl-karte .foto", {{ scale: 1.3 }}, {{ scale: 1, duration: 1.5, ease: "power2.out", stagger: 0.25 }}, 10.2);\n'
               f'      tl.to("#gl-titel, .gl-karte", {{ opacity: 0, scale: 0.9, filter: "blur(10px)", duration: 0.25, ease: "power2.in" }}, {9.7 + GL - 0.3});')

# ---------- HTML ----------
html = open("werkzeuge/vorlage.html.txt", encoding="utf-8").read()
ersatz = {
    "<!--MASCHINEN-->": "\n".join(karten),
    "<!--ICONS-->": '<i class="m-ic"></i>' * 24,
    "<!--PANELS-->": "".join(panels),
    "<!--STRAHLEN-->": strahlen,
    "<!--STANGEN-->": stangen,
    "<!--P1MASCHINE-->": maschine("p1", "CNC", "#5d6a7a", lr="p1-lr", lg="p1-lg", wz_fest=True),
    "<!--FRAGEN-->": fragen,
    "<!--BURST-->": burst,
    "<!--MATPLAN-->": "".join(matplan),
    "<!--LEGENDE-->": legende,
    "<!--TEAM-->": team_html,
    "<!--TEAMJS-->": team_js,
    "@@KARTEN@@": json.dumps([dict(t=k["t"], aus=k["aus"], bahn=k["bahn"]) for k in karten_js]),
    "@@MATFARBEN@@": matfarben,
    "@@MATX@@": str(mx), "@@MATY@@": str(my),
    "@@GL@@": str(GL),
}
for a, b in ersatz.items(): html = html.replace(a, b)
html = html.replace('<div id="mat-ring"></div>', f'<div id="mat-ring" style="{ring}"></div>')
import re
html = re.sub(r"@@([0-9.]+)@@", lambda m: f"{T(float(m.group(1))):g}", html)
assert "@@" not in html and "<!--" not in html.replace("<!-- ", ""), "Platzhalter übrig"
open("index.html", "w", encoding="utf-8").write(html)
print("index.html, GL =", GL, "Länge", T(74))
if "--nur-html" in sys.argv: sys.exit()

# ---------- Musik ----------
SCHNITTE = [5.2, 9.7, 22.1, 25.6, 28.9, 30.75, 33.5, 40.6, 45.2, 47.7, 50.3, 54.0, 58.9, 63.35]
STICHE = [m["t"] for m in MASCHINEN] + [27.17, 35.25, 63.95, 64.6, 65.2, 65.8, 66.85]
cfg = dict(laenge=T(74), aus="musik.wav", t=dict(groove=T(9.7), probleme=T(25.6), drop=T(38.0), outro=T(68.6)),
           booms=[0.5, 5.2] + ([9.7] if GL else []), whoosh=[T(x) for x in SCHNITTE], stich=[T(x) for x in STICHE])
json.dump(cfg, open("musik.json", "w"))
subprocess.run([sys.executable, "werkzeuge/musik.py", "musik.json"], check=True)

# ---------- Stimme ----------
START = [0.5, 5.3, 9.8, 18.0, 22.2, 25.7, 29.0, 33.7, 38.1, 40.8, 45.2, 50.4, 54.1, 59.0, 63.7, 68.8]
saetze = [(os.path.join(TON, f"s{i + 1}.wav"), T(t)) for i, t in enumerate(START)]
if TEAM and os.path.exists(os.path.join(TON, "gl.wav")):
    saetze.append((os.path.join(TON, "gl.wav"), 9.85))
ein, fc, mix = [], "", ""
for i, (pfad, t) in enumerate(saetze):
    ein += ["-i", pfad]; ms = int(t * 1000)
    fc += f"[{i}:a]aresample=44100,adelay={ms}|{ms}[v{i}];"; mix += f"[v{i}]"
L = T(74)
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *ein, "-filter_complex",
                f"{fc}{mix}amix=inputs={len(saetze)}:normalize=0,apad=whole_dur={L},atrim=0:{L},highpass=f=90,"
                "acompressor=threshold=-22dB:ratio=3:attack=4:release=120:makeup=5,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1.2:g=4,aformat=channel_layouts=stereo[v]",
                "-map", "[v]", "stimme.wav"], check=True)
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", "musik.wav", "-i", "stimme.wav", "-filter_complex",
                "[1:a]asplit=2[sc][vo];[0:a]volume=0.5[mu];[mu][sc]sidechaincompress=threshold=0.02:ratio=8:attack=10:release=350[duck];"
                "[duck][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=11[out]",
                "-map", "[out]", "-ar", "44100", "assets/ton.wav"], check=True)
r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", "assets/ton.wav", "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True)
print([z.strip() for z in r.stderr.splitlines() if "I:" in z][-1])
