# Eigene Musik im Indie-Rock-Stil für das Werbevideo 4 (keine fremden Rechte).
# Verzerrte Gitarren (Karplus-Strong), Bass, Schlagzeug. Abschnitte und Schnitte kommen aus der Konfigurationsdatei.
import json, sys, wave
import numpy as np
from scipy.signal import butter, lfilter, sosfilt

CFG = json.load(open(sys.argv[1]))
SR = 44100
LAENGE = CFG["laenge"]
N = int(SR * LAENGE)
T = CFG["t"]
# Takt so gewählt, dass der Drop genau auf einem Taktanfang liegt
TAKT = T["drop"] / round(T["drop"] / 2.0)
BEAT = TAKT / 4
rng = np.random.default_rng(11)
L = np.zeros(N); R = np.zeros(N)

def t_(d): return np.arange(int(d * SR)) / SR
def put(sig, start, gl=1.0, gr=None):
    gr = gl if gr is None else gr
    i = int(start * SR)
    if i >= N or i < 0: return
    s = sig[: N - i]
    L[i:i + len(s)] += s * gl; R[i:i + len(s)] += s * gr
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], btype="band", fs=SR, output="sos"), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, btype="low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, btype="high", fs=SR, output="sos"), x)
def hz(n): return 440 * 2 ** ((n - 69) / 12)

# ---- Schlagzeug ----
def kick():
    t = t_(0.4); f = 50 + 120 * np.exp(-t * 30)
    k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8)
    k[:120] += rng.standard_normal(120) * 0.3 * np.linspace(1, 0, 120)
    return np.tanh(k * 2.0) * 0.9
def snare():
    t = t_(0.28); n = rng.standard_normal(len(t))
    ton = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.5
    return (bp(n, 1200, 8000) * np.exp(-t * 16) * 0.75 + ton) * 0.8
def hat(offen=False):
    t = t_(0.3 if offen else 0.05); n = rng.standard_normal(len(t))
    return hp(n, 7500) * np.exp(-t * (10 if offen else 80)) * 0.2
def crash():
    t = t_(2.2); n = rng.standard_normal(len(t))
    return hp(n, 4000) * np.exp(-t * 1.6) * 0.28
def tom(f0):
    t = t_(0.35); f = f0 * (1 + 0.6 * np.exp(-t * 20))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.6

# ---- Gitarre: gezupfte Saite (Karplus-Strong als Kammfilter), dann Verzerrer und Box ----
def saite(n, d, hell=0.5, abkling=0.996):
    p = max(2, int(SR / hz(n)))
    anreg = np.zeros(int(d * SR)); anreg[:p] = lp(rng.uniform(-1, 1, p), 2000 + 6000 * hell)
    a = np.zeros(p + 2); a[0] = 1; a[p] = -0.5 * abkling; a[p + 1] = -0.5 * abkling
    return lfilter([1.0], a, anreg)
def akkord(wurzel, d, gedaempft=False, hell=0.6):
    noten = [wurzel, wurzel + 7, wurzel + 12]
    s = np.zeros(int(d * SR))
    for k, n in enumerate(noten):
        v = int(k * 0.006 * SR)  # Anschlag nacheinander, wie ein Abwärtsschlag
        x = saite(n, d, hell, 0.97 if gedaempft else 0.997)
        s[v:] += x[: len(s) - v]
    if gedaempft: s *= np.exp(-t_(d) * 14)
    return s
def verzerren(x, gain=7.0):
    y = np.tanh(hp(x, 90) * gain)
    y = bp(y, 90, 5200, 2)
    return y * 0.32
def clean(x): return lp(x, 4500) * 0.5

# ---- Bass ----
def bass(n, d):
    t = t_(d); f = hz(n)
    s = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * t)
    env = np.minimum(1, t * 300) * np.exp(-t * 2.5)
    return np.tanh(lp(s, 900) * 1.6) * env * 0.3

def riser(d):
    t = t_(d); n = rng.standard_normal(len(t))
    ton = np.sin(2 * np.pi * np.cumsum(200 + 1800 * (t / d) ** 2) / SR) * 0.12
    return (hp(n, 1500) * 0.3 + ton) * (t / d) ** 2
def boom():
    t = t_(1.8); f = 40 + 70 * np.exp(-t * 7)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.5) * 1.6) * 0.8
def whoosh(d=0.45):
    t = t_(d); n = rng.standard_normal(len(t))
    return bp(n, 600, 6000) * np.sin(np.pi * t / d) ** 2 * 0.22

# Akkorde: Am F C G (Grundtöne als MIDI, tiefe Lage)
FOLGE = [45, 41, 48, 43]
def abschnitt(t):
    if t < T["groove"] - 0.01: return "intro"
    if t < T["probleme"] - 0.01: return "strophe"
    if t < T["drop"] - 0.01: return "probleme"
    if t < T["outro"] - 0.01: return "refrain"
    return "outro"

git_L = np.zeros(N); git_R = np.zeros(N)
def git(sig, start, links=0.9, rechts=0.6):
    i = int(start * SR)
    if i >= N: return
    s = sig[: N - i]
    git_L[i:i + len(s)] += s * links; git_R[i:i + len(s)] += s * rechts

b = 0
while b * TAKT < LAENGE:
    t0 = b * TAKT; a = abschnitt(t0 + 0.02); w = FOLGE[b % 4]
    if a == "intro":
        # Saubere Gitarre, Achtel, ab Takt 2 Kick und Bass dazu
        for e in range(8):
            n = [w + 12, w + 19, w + 24, w + 19][e % 4]
            git(clean(saite(n, BEAT * 1.2, 0.7)), t0 + e * BEAT / 2, 0.5, 0.8)
        if t0 >= TAKT:
            for q in range(4): put(kick() * 0.7, t0 + q * BEAT)
            put(bass(w, TAKT * 0.95) * 0.7, t0)
        if t0 >= 2 * TAKT:
            for q in range(8): put(hat(), t0 + q * BEAT / 2, 0.5, 0.7)
    elif a == "strophe":
        # Gedämpfte, verzerrte Achtel, treibender Beat
        for e in range(8):
            git(verzerren(akkord(w, BEAT / 2 * 0.95, True), 6), t0 + e * BEAT / 2, 0.9, 0.5)
            git(verzerren(akkord(w, BEAT / 2 * 0.95, True), 6), t0 + e * BEAT / 2 + 0.012, 0.5, 0.9)
            put(bass(w, BEAT / 2 * 0.9), t0 + e * BEAT / 2)
            put(hat(e % 2 == 1), t0 + e * BEAT / 2, 0.55, 0.75)
        for q in range(4):
            put(kick() if q in (0, 2) else snare(), t0 + q * BEAT)
        put(kick() * 0.7, t0 + 2.5 * BEAT)
    elif a == "probleme":
        # Halbtempo, dunkel: lange Akkorde, Tom-Schläge
        wurzel = [45, 45, 46, 44][b % 4]
        git(verzerren(akkord(wurzel, TAKT * 0.95, False, 0.3), 5) * 0.8, t0, 0.8, 0.8)
        put(bass(wurzel - 12, TAKT * 0.9) * 0.9, t0)
        put(kick(), t0); put(snare() * 0.9, t0 + 2 * BEAT)
        for q in range(8): put(hat() * 0.6, t0 + q * BEAT / 2, 0.4, 0.8)
        put(tom(110), t0 + 3.5 * BEAT, 0.7, 0.4)
    elif a == "refrain":
        # Offene, volle Akkorde, Achtel-Bass, Crash am Anfang jeder Vierergruppe
        dauer = TAKT * 0.98
        git(verzerren(akkord(w, dauer, False, 0.8), 9), t0, 1.0, 0.35)
        git(verzerren(akkord(w, dauer, False, 0.8), 9), t0 + 0.015, 0.35, 1.0)
        for e in range(8):
            put(bass(w, BEAT / 2 * 0.9), t0 + e * BEAT / 2)
            put(hat(e % 2 == 1) * 0.9, t0 + e * BEAT / 2, 0.55, 0.75)
            # Melodie oben: kurzes Riff
            if e in (0, 3, 5, 6):
                n = [w + 24, w + 27, w + 26, w + 24][[0, 3, 5, 6].index(e)]
                git(verzerren(saite(n, BEAT * 0.6, 0.9), 4) * 0.5, t0 + e * BEAT / 2, 0.6, 0.6)
        for q in range(4): put(kick() if q in (0, 2) else snare() * 1.1, t0 + q * BEAT)
        put(kick() * 0.8, t0 + 1.5 * BEAT)
        if (b - round(T["drop"] / TAKT)) % 4 == 0: put(crash(), t0, 0.8, 1.0)
    b += 1

# Schluss: ein grosser Akkord klingt aus
put(boom(), T["outro"])
git(verzerren(akkord(45, LAENGE - T["outro"], False, 0.8), 9) * 1.2, T["outro"], 0.9, 0.9)
put(crash() * 1.3, T["outro"])
put(kick(), T["outro"])
# Effekte
put(riser(2.0), T["drop"] - 2.0, 0.9); put(boom(), T["drop"]); put(crash() * 1.2, T["drop"])
put(riser(1.0) * 0.7, T["outro"] - 1.0)
for x in CFG["schnitte"]: put(whoosh(), x - 0.22, 0.6, 0.9)
for x in CFG["stiche"]: put(boom() * 0.4, x); put(snare() * 0.6, x)
# Trommelwirbel vor der Strophe
for k in range(8): put(snare() * (0.3 + k * 0.08), T["groove"] - 1.0 + k * BEAT / 4)

# Gitarren etwas leiser und breiter, dann alles zusammen
L += git_L * 0.85; R += git_R * 0.85
fade = np.ones(N); fi = int(0.03 * SR); fo = int(2.8 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo) ** 1.4
L *= fade; R *= fade
m = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / m * 1.4) * 0.85; R = np.tanh(R / m * 1.4) * 0.85
st = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(CFG["aus"], "wb") as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes(st.tobytes())
print("Musik", LAENGE, "s, Takt", round(TAKT, 4))
