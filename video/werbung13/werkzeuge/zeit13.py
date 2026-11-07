# Fassung 13 (Text v5, November 2026): schneidet die ElevenLabs-Aufnahme (ein Stück, 18 Sätze mit langen Pausen dazwischen) in Sätze
# und rechnet den Zeitplan: wann jeder Satz im Video beginnt und wann die wichtigen Wörter fallen.
# Ohne Aufnahme (Aufruf ohne Datei) schätzt es die Zeiten aus den Silben, damit man das Bild schon bauen kann.
# Aufruf: python3 werkzeuge/zeit11.py [aufnahme.mp3]  -> stimme13/s1..s18.wav und werkzeuge/zeit13.json
import sys, json, subprocess, os, re

HIER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(HIER)
# Audio-Tags wie [warm] oder [long pause] liest ElevenLabs nicht vor
SAETZE = [x for x in (re.sub(r"\[[^\]]*\]", "", l).strip() for l in open("werkzeuge/sprechtext.txt", encoding="utf-8")) if x and not x.startswith("#")]
assert len(SAETZE) == 19, len(SAETZE)
MARKEN = {
    "lohn": (1, "Lohn-Ammannsegg"), "seit": (1, "Seit"),
    "inhaber": (2, "Inhaber"), "patrick": (2, "Patrick"), "team": (2, "Team"), "vollgas": (2, "Vollgas"),
    "doch": (3, "Doch"), "anders": (3, "anders"),
    "planung4": (4, "Planung"), "magnetwand": (4, "Magnetwand"), "faellt": (4, "fällt"), "niemand": (4, "niemand"), "wohin": (4, "wohin"),
    "zweimal": (5, "Zweimal"), "garnicht": (5, "gar"), "rest5": (5, "Rest"), "lager": (5, "Lager"), "gefunden": (5, "gefunden"),
    "zehn": (6, "zehn"), "excel": (6, "Excel"), "welche": (6, "Welche"), "ahnung": (6, "Ahnung"),
    "zettel": (7, "Zetteln"), "werkzeug7": (7, "Werkzeug"), "steht": (7, "steht"),
    "telefon": (8, "Telefon"), "wann": (8, "Wann"), "gute": (8, "Gute"),
    "weiter": (9, "weitergehen"),
    "tool": (10, "Tool"), "entwickelt": (10, "entwickelt"),
    "ziehen": (11, "ziehen"), "loslassen": (11, "loslassen"), "fertig11": (11, "fertig"), "sofort": (11, "sofort"),
    "rechnet": (12, "rechnet"), "bestellen12": (12, "bestellen"), "liegt": (12, "liegt"), "haus": (12, "Haus"), "bevor": (12, "Bevor"),
    "eines": (13, "Eines"), "direkt": (13, "direkt"), "tipp": (13, "Tipp"), "bestellt13": (13, "bestellt"),
    "stueck": (14, "Stückzahl"), "wechseln": (14, "Werkzeugwechsel"), "wartung": (14, "Wartung"), "daumen": (14, "Daumen"),
    "alle": (15, "alle"), "blick": (15, "Blick"),
    "tag": (16, "Tag"), "ausreden": (16, "Ausreden"),
    "zwanzig": (17, "Zwanzig"), "utilis": (17, "Utilis"), "klick": (17, "Klick"), "raus": (17, "raus"),
    "infoboard": (18, "Infoboard"), "pausenraum": (18, "Pausenraum"), "sogar": (18, "sogar"), "solar": (18, "Solaranlage"), "live": (18, "Live"),
    "praezise": (19, "Präzise"), "jetzt": (19, "jetzt"), "planung": (19, "Planung"),
}
LUECKE_MIN, LUECKE_MAX, VORNE, SCHLUSS = 0.4, 0.85, 1.6, 2.6
# Mehr Luft vor bestimmten Sätzen, damit das Bild wechseln kann (Satz ab 1 -> Sekunden)
EXTRA = {3: 0.3, 4: 0.3, 5: 0.3, 6: 0.3, 7: 0.3, 8: 0.3, 9: 0.5, 10: 0.6, 11: 0.5, 12: 0.2, 13: 0.2, 14: 0.2, 15: 0.2, 16: 0.2, 17: 0.2, 18: 0.2, 19: 0.9}


def silben(w):
    w = w.lower().replace("ä", "a").replace("ö", "o").replace("ü", "u")
    return max(1, len(re.findall(r"[aeiouy]+", w)))


def woerter(satz):
    return [w for w in satz.split() if re.search(r"\w", w)]


def dauer(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)


def pausen(p, db=-40, d=0.4):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", p, "-af", f"silencedetect=n={db}dB:d={d}", "-f", "null", "-"], capture_output=True, text=True).stderr
    a = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", r)]
    b = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", r)]
    return list(zip(a, b))


def wortzeiten(satz, laenge, wav=None):
    """Anfang jedes Wortes im Satz (Sekunden ab Satzanfang)."""
    ws = woerter(satz)
    # Stücke zwischen Satzzeichen; in der Aufnahme sind das die kleinen Pausen
    stuecke, cur = [], []
    for w in ws:
        cur.append(w)
        if re.search(r"[,.:!?]$", w): stuecke.append(cur); cur = []
    if cur: stuecke.append(cur)
    teile = None
    if wav:
        ps = [(a, b) for a, b in pausen(wav, -38, 0.11) if a > 0.05 and b < laenge - 0.05]
        sprache, t = [], 0.0
        for a, b in ps: sprache.append((t, a)); t = b
        sprache.append((t, laenge))
        if len(sprache) == len(stuecke): teile = sprache
        elif len(sprache) > len(stuecke):
            # die längsten Pausen zählen
            ps2 = sorted(sorted(ps, key=lambda x: x[1] - x[0], reverse=True)[:len(stuecke) - 1])
            sprache, t = [], 0.0
            for a, b in ps2: sprache.append((t, a)); t = b
            sprache.append((t, laenge)); teile = sprache
    if teile is None:
        # geschätzt: Silben plus Pause nach Satzzeichen
        gew = [sum(silben(w) for w in s) * 0.19 for s in stuecke]
        pause = [0.42 if re.search(r"[.:!?]$", s[-1]) else 0.22 for s in stuecke]
        ges = sum(gew) + sum(pause[:-1])
        f = laenge / ges if ges else 1
        teile, t = [], 0.0
        for g, p in zip(gew, pause): teile.append((t, t + g * f)); t += (g + p) * f
    zeiten = []
    for s, (a, b) in zip(stuecke, teile):
        sil = [silben(w) for w in s]; ges = sum(sil); t = a
        for w, n in zip(s, sil): zeiten.append(t); t += (b - a) * n / ges
    return ws, zeiten


def schaetzen(satz):
    ws = woerter(satz); st = [s for s in re.split(r"(?<=[,.:!?])\s", satz)]
    return sum(silben(w) for w in ws) * 0.19 + 0.22 * satz.count(",") + 0.42 * len(re.findall(r"[.:!?]\s", satz))


ROH = sys.argv[1] if len(sys.argv) > 1 else None
os.makedirs("stimme13", exist_ok=True)
laenge, wavs, roh_luecken = [], [], []
if ROH:
    gesamt = dauer(ROH)
    ps = pausen(ROH, -40, 0.4)
    # die 17 längsten Pausen trennen die 18 Sätze
    # Nicht einfach die längsten Pausen: ElevenLabs macht im Satz manchmal längere Pausen als zwischen den Sätzen.
    # Darum die Grenzen so wählen, dass jeder Satz etwa so lang ist, wie seine Buchstaben erwarten lassen, und die Pausen lang sind.
    ps = pausen(ROH, -40, 0.25)
    n, m = len(SAETZE), len(ps)
    zeichen = [len(re.sub(r"\W", "", x)) for x in SAETZE]
    tempo = sum(zeichen) / gesamt
    mitte = [(a + b) / 2 for a, b in ps]
    INF = float("inf")
    def kosten(von, bis, k):
        d = bis - von; e = zeichen[k] / tempo
        return ((d - e) / max(e, 1.0)) ** 2
    # best[k][j]: Satz k endet an Pause j
    best = [[INF] * m for _ in range(n)]; vor = [[-1] * m for _ in range(n)]
    for j in range(m): best[0][j] = kosten(0, mitte[j], 0) - 0.6 * (ps[j][1] - ps[j][0])
    for k in range(1, n - 1):
        for j in range(m):
            for i in range(j):
                if best[k - 1][i] == INF: continue
                c = best[k - 1][i] + kosten(mitte[i], mitte[j], k) - 0.6 * (ps[j][1] - ps[j][0])
                if c < best[k][j]: best[k][j], vor[k][j] = c, i
    j = min(range(m), key=lambda j: best[n - 2][j] + kosten(mitte[j], gesamt, n - 1))
    wahl = []
    for k in range(n - 2, -1, -1): wahl.append(j); j = vor[k][j]
    trenn = [ps[j] for j in sorted(wahl)]
    grenzen = [0.0] + [(a + b) / 2 for a, b in trenn] + [gesamt]
    roh_luecken = [b - a for a, b in trenn]
    for i in range(len(SAETZE)):
        a, b = grenzen[i], grenzen[i + 1]; ziel = f"stimme13/s{i + 1}.wav"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", ROH, "-ss", f"{a}", "-to", f"{b}", "-ar", "44100", "-ac", "1",
                        "-af", "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.03,"
                               "areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.08,areverse", ziel], check=True)
        laenge.append(dauer(ziel)); wavs.append(ziel)
else:
    laenge = [schaetzen(s) for s in SAETZE]; wavs = [None] * len(SAETZE)
    roh_luecken = [0.8] * (len(SAETZE) - 1)

S, t = [], VORNE
for i, l in enumerate(laenge):
    if i:
        t += min(LUECKE_MAX, max(LUECKE_MIN, roh_luecken[i - 1] * 0.8)) + EXTRA.get(i + 1, 0)
    S.append(t); t += l
ENDE = t + SCHLUSS
W, WORTE = {}, []
alle = [wortzeiten(s, l, w) for s, l, w in zip(SAETZE, laenge, wavs)]
for k, (nr, wort, *n) in MARKEN.items():
    ws, zs = alle[nr - 1]
    treffer = [z for w, z in zip(ws, zs) if w.strip(",.:!?").startswith(wort.strip(",.:!?"))]
    assert treffer, f"Wort {wort} nicht in Satz {nr}"
    W[k] = round(S[nr - 1] + treffer[(n or [1])[0] - 1], 3)
json.dump({"S": [round(x, 3) for x in S], "E": [round(s + l, 3) for s, l in zip(S, laenge)], "W": W, "ende": round(ENDE, 2),
           "geschaetzt": ROH is None}, open("werkzeuge/zeit13.json", "w"), indent=1)
print("Länge", round(ENDE, 1), "s", "(geschätzt)" if not ROH else "")
for i, (s, l) in enumerate(zip(S, laenge)): print(i + 1, round(s, 2), "Dauer", round(l, 2))
