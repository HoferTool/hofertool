# Fassung 13 (Text v5, Wunsch Patrick 5. November 2026): kurzer Anfang, nur der Inhaber wird genannt, Firma, Geschäftsleitung,
# Team, Maschinen, Feiern und Ordnung laufen ohne Stimme; danach ein dunkler Teil mit allem, was nicht lief, und erst dann das Tool.
# Baut index.html aus v12.css, v12pro.css, v13.css, v13.html, v13.js und dem Zeitplan der Stimme (werkzeuge/zeit13.json).
# Namen und Fotos der Leute kommen nur aus Dateien, die nicht ins Repository gehören (werkzeuge/team.json, assets/team/, assets/teamwand/).
# Aufruf im Ordner w11:  python3 werkzeuge/bauen13.py [--ohne-stimme] [--ohne-musik] [--nur-html]
import json, os, re, subprocess, sys, shutil
HIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(HIER)
ARG = sys.argv[1:]
Z = json.load(open("werkzeuge/zeit13.json"))
MONT = json.load(open("mont/namen.json"))
M_LANG = round(sum(d for _, d in MONT), 3)
S0, E0 = Z["S"], Z["E"]
# Stille Szenen nach Satz 2 (Sekunden): wie lange jede steht
GL_NACH, FOLIE_D, MASCH_D, ORD_D = 2.4, 2.6, 6.0, 6.0
A = {"dr": 0.0, "gl": round(S0[1] - 0.32, 3)}
A["team"] = round(E0[1] + GL_NACH, 3)
FOLIEN = [round(A["team"] + 0.25 + k * FOLIE_D, 3) for k in range(3)]
KAFFEE = round(FOLIEN[-1] + 1.4, 3)
A["masch"] = round(KAFFEE + 2.3, 3)
A["feiern"] = round(A["masch"] + MASCH_D, 3)
MONT0 = round(A["feiern"] + 0.7, 3)
A["ord"] = round(MONT0 + M_LANG + 0.3, 3)
DOCH = round(A["ord"] + ORD_D, 3)
# Die Stimme ab Satz 3 rutscht um DELTA nach hinten, damit die stillen Szenen Platz haben
SCHNITTE = [(round(E0[1] + 0.05, 3), round(DOCH + 0.32 - S0[2], 3))]
assert SCHNITTE[0][1] > 0
S_ALT, ENDE_ALT = list(Z["S"]), Z["ende"]
def spaeter(t): return round(t + sum(d for a, d in SCHNITTE if t >= a), 3)
Z["S"] = [spaeter(t) for t in Z["S"]]; Z["E"] = [spaeter(t) for t in Z["E"]]
Z["W"] = {k: spaeter(t) for k, t in Z["W"].items()}; Z["ende"] = spaeter(Z["ende"])
W, S_, E_, ENDE = Z["W"], Z["S"], Z["E"], Z["ende"]
S = lambda i: S_[i - 1]
E = lambda i: E_[i - 1]
SATZ = {3: "doch", 4: "magnet", 5: "matc", 6: "excel", 7: "zettel", 8: "tel", 9: "sonicht", 10: "tool", 11: "pw", 12: "mat",
        13: "eb", 14: "pad", 15: "qs", 16: "stat", 17: "best", 18: "ib", 19: "ende"}
for i, k in SATZ.items(): A[k] = round(S(i) - 0.32, 3)
A["solar"] = round(W["sogar"] - 0.35, 3)
REIHE = ["dr", "gl", "team", "masch", "feiern", "ord", "doch", "magnet", "matc", "excel", "zettel", "tel", "sonicht", "tool",
         "pw", "mat", "eb", "pad", "qs", "stat", "best", "ib", "solar", "ende"]
B = {k: (A[REIHE[n + 1]] if n + 1 < len(REIHE) else ENDE) for n, k in enumerate(REIHE)}
ZEL = {"dr": "zdr", "gl": "z3", "team": "z4", "masch": "z5", "feiern": "z6", "ord": "z7", "doch": "zdo", "magnet": "zmg", "matc": "zmc",
       "excel": "zxl", "zettel": "z8", "tel": "ztel", "sonicht": "zsn", "tool": "z9", "pw": "z10", "mat": "z11", "eb": "z12", "pad": "z13",
       "qs": "z14", "stat": "z15", "best": "z16", "ib": "z17", "solar": "z18", "ende": "z19"}
assert all(B[k] > A[k] + 0.5 for k in REIHE), [(k, A[k], B[k]) for k in REIHE if B[k] <= A[k] + 0.5]
rnd = __import__("random").Random(12)

css = "\n".join(open(f"werkzeuge/{n}", encoding="utf-8").read() for n in ("v12.css", "v12pro.css", "v13.css"))
html = open("werkzeuge/v13.html", encoding="utf-8").read()
js = open("werkzeuge/v13.js", encoding="utf-8").read()
if not os.path.exists("assets/logo-farbe.png"):
    shutil.copy("/home/claude/hofertool/public/logo-empfang.png", "assets/logo-farbe.png")
# Professioneller Stil: keine schiefen Aufkleber, keine Emojis in Schildern, ✅ als schlichtes Häkchen
html = re.sub(r"transform:\s*(translateX\(-50%\)\s*)?rotate\(-?[\d.]+deg\)", lambda m: "transform:" + (m.group(1) or "rotate(0deg)"), html)
EMO = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F\u2B50]")
def schild(m):
    return EMO.sub("", m.group(0).replace("✅", "✓")).replace(" </div>", "</div>")
html = re.sub(r'<div class="(?:sticker|titel)[^>]*>.*?</div>', schild, html)
# Szenen
html = re.sub(r"@@Z:(\w+)@@", lambda m: f'data-start="{A[m.group(1)]:.3f}" data-duration="{B[m.group(1)] - A[m.group(1)]:.3f}"', html)

# Geschäftsleitung als Sammelkarten
T = json.load(open("werkzeuge/team.json"))
def karte_gl(p, id_, stil, em):
    return (f'        <div class="sk {stil}" id="{id_}"><div class="foto"><img src="assets/team/{p["foto"]}" style="object-position:{p["ausschnitt"]}" alt=""/></div>'
            f'<div class="holo"></div><b>{"<br/>".join(p["name"].split(" ", 1))}</b><em>{em}</em><span class="sterne">★★★★★</span></div>')
gl = [karte_gl(T[0], "gl-patrick", "", "Inhaber")]
gl.append('        <div class="sticker weiss gross" id="gl-titel2" style="left:620px;top:120px;transform:rotate(-2deg)">Die Geschäftsleitung</div>')
for k, p in enumerate(T[1:5]):
    vor = p["name"].split()[0].lower()
    gl.append(karte_gl(p, f"gl-{vor}", "gl", "GL").replace('class="sk gl"', f'class="sk gl" style="left:{530 + k * 330}px"'))
html = html.replace("@@GL@@", "\n".join(gl))

# Teamwand: echte Fotos, wenn vorhanden (assets/teamwand/*.jpg, nie im Repository), sonst gezeichnete Köpfe
fotos = sorted(f for f in os.listdir("assets/teamwand")) if os.path.isdir("assets/teamwand") else []
N = len(fotos) or 10
def kopf(k):
    r = rnd.Random(k) if False else __import__("random").Random(k + 3)
    haut = r.choice(["#f2c9a0", "#e0ac7e", "#c98d5e", "#f5d6b8", "#a86d43"])
    haar = r.choice(["#3b2a1a", "#7a4b22", "#d9a441", "#1b1b1b", "#9b9b9b", "#b5562b"])
    bg = ["#dce9ff", "#fff3c4", "#ffe1ea", "#d8f7e9", "#ece4ff", "#ffe6cf"][k % 6]
    hut = '<path d="M50 95 Q100 40 150 95 Z" fill="#ffd23f" stroke="#0b1f3a" stroke-width="6"/><rect x="40" y="90" width="120" height="14" rx="7" fill="#ffd23f" stroke="#0b1f3a" stroke-width="6"/>' if k % 3 == 0 else \
          f'<path d="M58 100 Q100 45 142 100 L142 88 Q100 30 58 88 Z" fill="{haar}"/>'
    ohr = '<rect x="38" y="118" width="18" height="40" rx="8" fill="#ff3b5c" stroke="#0b1f3a" stroke-width="5"/><rect x="144" y="118" width="18" height="40" rx="8" fill="#ff3b5c" stroke="#0b1f3a" stroke-width="5"/>' if k % 4 == 1 else ""
    brille = '<rect x="70" y="122" width="26" height="18" rx="6" fill="none" stroke="#0b1f3a" stroke-width="5"/><rect x="104" y="122" width="26" height="18" rx="6" fill="none" stroke="#0b1f3a" stroke-width="5"/>' if k % 2 else \
             '<circle cx="84" cy="130" r="6" fill="#0b1f3a"/><circle cx="116" cy="130" r="6" fill="#0b1f3a"/>'
    return (f'<svg viewBox="0 0 200 200"><rect width="200" height="200" fill="{bg}"/>'
            f'<path d="M30 200 Q100 150 170 200 Z" fill="{["#1f6fe0", "#0b1f3a", "#16c784", "#ff8a1f"][k % 4]}" stroke="#0b1f3a" stroke-width="6"/>'
            f'<circle cx="100" cy="125" r="50" fill="{haut}" stroke="#0b1f3a" stroke-width="6"/>{hut}{ohr}{brille}'
            f'<path d="M82 152 Q100 168 118 152" fill="none" stroke="#0b1f3a" stroke-width="5" stroke-linecap="round"/></svg>')
# Teamwand auf drei Folien (Wunsch Patrick 3. November 2026: «mehrere Slides QS-Gruppe / Maschinenpark / Rest»).
# Wer wohin gehört, steht nur in werkzeuge/teamwand.json (nie im Repository): {"weg": [Nr], "gruppen": [[Titel, [Nr]], …]},
# Nr = Stelle in assets/teamwand (1 = erstes Bild). Ohne Datei werden alle Bilder gleichmässig verteilt.
if os.path.exists("werkzeuge/teamwand.json"):
    TWJ = json.load(open("werkzeuge/teamwand.json"))
else:
    alle = list(range(1, N + 1)); d = -(-N // 3)
    TWJ = {"weg": [], "gruppen": [["Maschinenpark", alle[:d]], ["Qualitätssicherung", alle[d:2 * d]], ["Logistik und Büro", alle[2 * d:]]]}
# Einträge sind Nummern der Teamwand oder Dateinamen in assets/team/; ein * vorne = erscheint kurz nach den anderen.
rest = [n for n in range(1, N + 1) if n not in TWJ["weg"] and not any(n in g for _, g in TWJ["gruppen"])]
GRUPPEN = [(t, [n for n in g if n not in TWJ["weg"]]) for t, g in TWJ["gruppen"]]
GRUPPEN[0] = (GRUPPEN[0][0], GRUPPEN[0][1] + rest)
tw = []
for g, (titel, nr) in enumerate(GRUPPEN):
    n = max(1, len(nr)); FX, FY, FB, FH = 90, 250, (1330 if g == len(GRUPPEN) - 1 else 1740), 790  # letzte Folie: rechts kommt die Kaffeemaschine
    best = None
    for sp in range(1, n + 1):
        zl = -(-n // sp); w = min((FB - (sp - 1) * 24) / sp, (FH - (zl - 1) * 24) / zl, 560)
        if best is None or w >= best[0]: best = (w, sp, zl)
    w, sp, zl = best; w = int(w); h = w  # quadratisch wie die Fotos, sonst wird abgeschnitten
    for k, nrk in enumerate(nr):
        zi, si = k // sp, k % sp
        imz = min(sp, n - zi * sp)  # Bilder in dieser Zeile, zentriert
        x = FX + (FB - (imz * w + (imz - 1) * 24)) / 2 + si * (w + 24)
        y = FY + (FH - (zl * h + (zl - 1) * 24)) / 2 + zi * (h + 24)
        spaet = isinstance(nrk, str) and nrk.startswith("*")
        if isinstance(nrk, str): inhalt = f'<img src="assets/team/{nrk.lstrip("*")}" alt=""/>'
        else: inhalt = f'<img src="assets/teamwand/{fotos[nrk - 1]}" alt=""/>' if nrk - 1 < len(fotos) else kopf(nrk)
        tw.append(f'<div class="polaroid tw twg{g}" data-r="0" data-spaet="{1 if spaet else 0}" style="left:{x:.0f}px;top:{y:.0f}px;width:{w}px;height:{h}px"><div class="foto">{inhalt}</div></div>')
    html = html.replace(f"@@TWTITEL{g}@@", titel)
for g in range(len(GRUPPEN), 4): html = html.replace(f"@@TWTITEL{g}@@", "")
html = html.replace("@@TEAMWAND@@", "".join(tw))

# Zettel
TEXTE = ["Auftrag 4711 ???", "Material bestellt?", "ANRUFEN!!", "Maschine 7 → ?", "Werkzeug fehlt", "FA ???", "Kunde ruft zurück", "Wo ist der Ordner?",
         "Stückzahl: 1'2??", "DRINGEND!", "Termin verschoben", "siehe anderer Zettel", "Wer hat …?", "Platte T3100", "Bis Freitag!!", "?"]
zt = []
for k, t in enumerate(TEXTE):
    x, y = rnd.uniform(30, 1180), rnd.uniform(170, 800)
    r = round(rnd.uniform(-18, 18), 1)
    zt.append(f'        <div class="zettel {["gelb", "weiss", "rosa", "blau"][k % 4]}" data-r="{r}" style="left:{x:.0f}px;top:{y:.0f}px">{t}</div>')
html = html.replace("@@ZETTEL@@", "\n".join(zt))
html = html.replace("@@MUENZEN@@", "".join(f'<div class="emo muenze" style="left:{rnd.uniform(1240, 1820):.0f}px;top:{rnd.uniform(880, 990):.0f}px">🪙</div>' for _ in range(14)))

# Videoausschnitte
def dauer(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
def ausschnitt(vid, src, key_src, key_neu, start, ende, tempo=1.0):
    laenge = dauer("assets/" + src)
    vor, nach = key_neu - start, ende - key_neu
    if vor > 0: tempo = min(tempo, key_src / vor)
    if nach > 0: tempo = min(tempo, (laenge - key_src - 0.05) / nach)
    von, bis = key_src - vor * tempo, key_src + nach * tempo
    ziel = f"c13_{vid}.mp4"
    if "--nur-html" not in ARG or not os.path.exists("assets/" + ziel):
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", "assets/" + src, "-vf",
                        f"trim=start={max(0, von):.3f}:end={bis:.3f},setpts=(PTS-STARTPTS)/{tempo:.4f},fps=30,tpad=stop_mode=clone:stop_duration=3",
                        "-t", f"{ende - start:.3f}", "-an", "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", "assets/" + ziel], check=True)
    print(f"  {vid:7} {src:24} {von:6.2f}–{bis:6.2f}  Tempo {tempo:.2f}")
    return ziel, start, ende - start
VID = {
    "v-pw": ("k_planwand.mp4", 1.5, W["ziehen"], A["pw"] + 0.05, B["pw"]),
    "v-mat": ("k_material.mp4", 12.0, W["bestellen12"] + 0.25, A["mat"] + 0.05, W["liegt"] - 0.05),
    "v-mih": ("k_materialimhaus.mp4", 3.6, W["haus"], W["liegt"] - 0.1, B["mat"]),
    "v-eb": ("k_einrichtblatt.mp4", 5.6, W["tipp"] + 0.3, A["eb"] + 0.05, B["eb"]),
    "v-pd": ("k_pad.mp4", 2.5, W["stueck"] + 0.3, A["pad"] + 0.05, W["wechseln"] - 0.05),
    "v-wt": ("k_wartung.mp4", 9.5, W["wartung"] + 0.3, W["wechseln"] - 0.1, B["pad"]),
    "v-qs1": ("k_qscheck.mp4", 2.5, W["alle"], A["qs"] + 0.05, B["qs"]),
    "v-st": ("k_statistik.mp4", 8.5, W["tag"], A["stat"] + 0.05, B["stat"]),
    "v-be1": ("k_best.mp4", 3.5, W["zwanzig"] + 0.3, A["best"] + 0.05, W["klick"] - 0.1),
    "v-be2": ("k_best.mp4", 14.5, W["raus"] - 0.15, W["klick"] - 0.15, B["best"]),
    "v-ib": ("k_infoboard.mp4", 1.0, W["infoboard"], W["infoboard"] - 0.45, B["ib"]),
    "v-pr": ("k_pausenraum.mp4", 6.5, W["pausenraum"] + 1.0, W["pausenraum"] - 0.45, B["ib"]),
    "v-sol": ("k_solar.mp4", 1.5, W["live"], A["solar"] + 1.0, B["solar"]),
    "v-mont": ("k_montage.mp4", 0.0, MONT0, MONT0, B["feiern"]),
    "v-schublade": ("k_schublade.mp4", 2.0, A["ord"] + 4.45, A["ord"] + 2.3, B["ord"]),
}
for k, (vid, p) in enumerate(VID.items()):
    ziel, a, d = ausschnitt(vid, *p)
    html = html.replace(f"@@V:{vid}@@", f'class="clip" id="{vid}" src="assets/{ziel}" data-start="{a:.3f}" data-duration="{d:.3f}" data-track-index="{2 + k % 6}"')
assert "@@" not in html, re.findall(r"@@[^@]*@@", html)[:5]

zp = ("      const ZP = " + json.dumps({"W": W, "S": S_, "E": E_, "A": A, "B": B}) + ";\n"
      "      const W = ZP.W, A = ZP.A, B = ZP.B, S = (i) => ZP.S[i - 1], E = (i) => ZP.E[i - 1];\n"
      "      const ZEL = " + json.dumps(ZEL) + ";\n"
      "      const MONT = " + json.dumps([d for _, d in MONT]) + ", MONT0 = " + json.dumps(MONT0) + ";\n"
      "      const FOLIEN = " + json.dumps(FOLIEN[:len(GRUPPEN)]) + ", KAFFEE = " + json.dumps(KAFFEE) + ";\n"
      "      gsap.registerPlugin(MotionPathPlugin);\n")
audio = "" if ("--ohne-stimme" in ARG and "--ohne-musik" in ARG) else f'      <audio id="ton" src="assets/ton.wav" data-start="0" data-duration="{ENDE:.3f}" data-volume="1"></audio>\n'
seite = f'''<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="assets/gsap.min.js"></script>
    <script src="assets/MotionPathPlugin.min.js"></script>
    <style>
{css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{ENDE:.3f}" data-width="1920" data-height="1080">
{audio}{html}
      <div id="wisch"><i></i><i></i><i></i></div>
    </div>
    <script>
{zp}{js}
    </script>
  </body>
</html>
'''
open("index.html", "w", encoding="utf-8").write(seite)
print("index.html", len(seite) // 1024, "KB, Länge", ENDE)
if "--nur-html" in ARG: sys.exit()

# Ton
if "--ohne-musik" not in ARG:
    cfg = dict(laenge=ENDE, aus="musik.wav", t=dict(groove=A["gl"] + 0.02, probleme=A["doch"] + 0.02, drop=W["tool"] - 0.05, outro=S(19) - 0.1),
               schnitte=[A[k] for k in REIHE[1:] if k not in ("tool", "sonicht")],
               stiche=[W["seit"] + 0.1, W["patrick"], FOLIEN[0], FOLIEN[1], FOLIEN[2], A["masch"] + 1.8, A["ord"] + 4.45,
                       W["faellt"] + 0.35, W["zweimal"] + 0.45, W["garnicht"] + 0.1, W["gefunden"], W["ahnung"], W["steht"] + 0.1, W["gute"],
                       W["sofort"], W["bevor"] + 0.77, W["bestellt13"], W["daumen"], W["ausreden"] + 0.1, W["raus"], W["live"], S(19) + 0.3])
    json.dump(cfg, open("musik.json", "w"))
    subprocess.run([sys.executable, "werkzeuge/musik.py", "musik.json"], check=True)
if "--ohne-stimme" in ARG:
    if "--ohne-musik" not in ARG:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", "musik.wav", "-af", "volume=0.6,loudnorm=I=-16:TP=-1.0", "-ar", "44100", "assets/ton.wav"], check=True)
    sys.exit()
ein, fc, mix = [], "", ""
# Jeder Satz wird an den Schnitten in seinem Bereich geteilt; jedes Stück kommt an seine verschobene Zeit.
n = 0
for i in range(19):
    a0 = S_ALT[i]; a1 = S_ALT[i + 1] if i < 18 else ENDE_ALT
    grenzen = [a0] + [a for a, _ in SCHNITTE if a0 < a < a1] + [None]
    for k in range(len(grenzen) - 1):
        von, bis = grenzen[k], grenzen[k + 1]
        ein += ["-i", f"stimme13/s{i + 1}.wav"]; ms = int(spaeter(von) * 1000)
        trim = f"atrim=start={von - a0:.3f}" + (f":end={bis - a0:.3f}" if bis else "") + ",asetpts=PTS-STARTPTS,"
        fc += f"[{n}:a]{trim}aresample=44100,adelay={ms}|{ms}[v{n}];"; mix += f"[v{n}]"; n += 1
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *ein, "-filter_complex",
                f"{fc}{mix}amix=inputs={n}:normalize=0,apad=whole_dur={ENDE},atrim=0:{ENDE},highpass=f=70,"
                "equalizer=f=140:t=q:w=1:g=-1,equalizer=f=400:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=4,equalizer=f=9000:t=q:w=1:g=2,"
                "acompressor=threshold=-24dB:ratio=4:attack=3:release=90:makeup=7,asoftclip=type=tanh,aformat=channel_layouts=stereo[v]",
                "-map", "[v]", "stimme.wav"], check=True)
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", "musik.wav", "-i", "stimme.wav", "-filter_complex",
                "[1:a]asplit=2[sc][vo];[0:a]volume=0.42,equalizer=f=2500:t=q:w=1:g=-4[mu];[mu][sc]sidechaincompress=threshold=0.02:ratio=7:attack=8:release=300[duck];"
                "[duck][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=11[out]",
                "-map", "[out]", "-ar", "44100", "assets/ton.wav"], check=True)
