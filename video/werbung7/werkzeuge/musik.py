# Eigene Musik für das Werbevideo 5 (keine fremden Rechte): moderner Elektro-Pop, 4/4 mit Pumpen.
# Synthesizer (Supersaw, Pluck, Sub-Bass) und Schlagzeug, ganz in numpy gerechnet. Abschnitte und Schnitte kommen aus der Konfiguration.
import json, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt

CFG = json.load(open(sys.argv[1]))
SR = 44100
LAENGE = CFG["laenge"]
N = int(SR * LAENGE)
T = CFG["t"]
# Takt so gewählt, dass der Drop genau auf einem Taktanfang liegt (rund 119 BPM)
TAKT = T["drop"] / round(T["drop"] / 2.0)
BEAT = TAKT / 4
rng = np.random.default_rng(5)
L = np.zeros(N); R = np.zeros(N)
SYN_L = np.zeros(N); SYN_R = np.zeros(N)  # alles, was zum Kick pumpen soll

def t_(d): return np.arange(int(d * SR)) / SR
def _put(zl, zr, sig, start, gl, gr):
    i = int(round(start * SR))
    if i >= N or i < 0: return
    s = sig[: N - i]
    zl[i:i + len(s)] += s * gl; zr[i:i + len(s)] += s * gr
def put(sig, start, gl=1.0, gr=None): _put(L, R, sig, start, gl, gl if gr is None else gr)
def syn(sig, start, gl=1.0, gr=None): _put(SYN_L, SYN_R, sig, start, gl, gl if gr is None else gr)
def lp(x, f, o=2): return sosfilt(butter(o, f, btype="low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, btype="high", fs=SR, output="sos"), x)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], btype="band", fs=SR, output="sos"), x)
def hz(n): return 440 * 2 ** ((n - 69) / 12)
def adsr(d, a=0.01, r=0.08):
    n = int(d * SR); e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, min(n, int(r * SR)))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e

# ---- Klänge ----
def saw(f, d, phase=0.0):
    t = t_(d); x = (f * t + phase) % 1.0
    return 2 * x - 1
def supersaw(n, d, hell=3000):
    f = hz(n); s = np.zeros(int(d * SR))
    for k, ver in enumerate([-0.11, -0.06, -0.025, 0, 0.025, 0.06, 0.11]):
        s += saw(f * 2 ** (ver / 12), d, rng.random())
    return lp(s / 5, hell, 2) * adsr(d, 0.02, 0.15)
def akkord_pad(noten, d, hell=2800):
    s = sum(supersaw(n, d, hell) for n in noten)
    return s * 0.22
def pluck(n, d=0.35, hell=1.0):
    # additiv: Obertöne klingen schneller ab, das klingt wie ein gezupfter Synth
    t = t_(d); f = hz(n); s = np.zeros(len(t))
    for k in range(1, 14):
        if f * k > 15000: break
        s += np.sin(2 * np.pi * f * k * t) / k * np.exp(-t * (4 + k * 3.2 / hell))
    return s * 0.35 * adsr(d, 0.002, 0.05)
def subbass(n, d):
    t = t_(d); f = hz(n)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return np.tanh(s * 1.4) * adsr(d, 0.004, 0.04) * 0.42
def kick():
    t = t_(0.45); f = 45 + 140 * np.exp(-t * 35)
    k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    k[:90] += rng.standard_normal(90) * 0.4 * np.linspace(1, 0, 90)
    return np.tanh(k * 2.2) * 0.95
def clap():
    t = t_(0.3); n = rng.standard_normal(len(t)); e = np.zeros(len(t))
    for o in (0, 0.011, 0.022): e += (t >= o) * np.exp(-np.maximum(t - o, 0) * 60)
    e += (t >= 0.03) * np.exp(-np.maximum(t - 0.03, 0) * 13)
    return bp(n, 900, 7000) * e * 0.45
def hat(offen=False):
    t = t_(0.28 if offen else 0.045); n = rng.standard_normal(len(t))
    return hp(n, 8000) * np.exp(-t * (11 if offen else 90)) * (0.22 if offen else 0.16)
def crash():
    t = t_(2.4); n = rng.standard_normal(len(t))
    return hp(n, 4500) * np.exp(-t * 1.5) * 0.25
def riser(d):
    t = t_(d); n = rng.standard_normal(len(t))
    ton = sum(np.sin(2 * np.pi * np.cumsum(f0 * (1 + 3 * (t / d) ** 2)) / SR) for f0 in (220, 330)) * 0.06
    return (hp(n, 2000) * 0.25 + ton) * (t / d) ** 2.2
def boom():
    t = t_(2.0); f = 38 + 80 * np.exp(-t * 6)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2) * 1.8) * 0.85
def whoosh(d=0.45):
    t = t_(d); n = rng.standard_normal(len(t))
    return bp(n, 700, 7000) * np.sin(np.pi * t / d) ** 2 * 0.2
def drone(n, d):
    t = t_(d); f = hz(n)
    s = sum(saw(f * m, d, rng.random()) for m in (1, 1.005, 0.995))
    return lp(s, 500) * 0.12 * np.minimum(1, t / 1.5)

# Akkorde: Fm, Db, Ab, Eb (Grundtöne als MIDI), Pad in mittlerer Lage
FOLGE = [(53, [65, 68, 72]), (49, [65, 68, 73]), (56, [63, 68, 72]), (51, [63, 67, 70])]
ARP = [0, 7, 12, 7, 15, 12, 7, 12]
HOOK = [77, 75, 72, 75, 77, 80, 79, 75]  # kurze Melodie im Refrain, ein Ton pro Achtel auf ausgewählten Schlägen
def abschnitt(t):
    if t < T["groove"] - 0.01: return "intro"
    if t < T["probleme"] - 0.01: return "strophe"
    if t < T["drop"] - 0.01: return "probleme"
    if t < T["outro"] - 0.01: return "refrain"
    return "outro"

b = 0
while b * TAKT < LAENGE:
    t0 = b * TAKT; a = abschnitt(t0 + 0.02); wurzel, akk = FOLGE[b % 4]
    if a == "intro":
        syn(lp(akkord_pad(akk, TAKT), 1200 + 300 * b), t0, 0.7, 0.7)
        for e in range(8): syn(pluck(akk[0] + ARP[e] - 12, 0.3, 0.6) * 0.8, t0 + e * BEAT / 2, 0.45 + 0.1 * (e % 2), 0.6 - 0.1 * (e % 2))
        if t0 >= TAKT * 0.9:
            for q in range(4): put(kick() * 0.85, t0 + q * BEAT)
            for e in range(4): put(hat(), t0 + e * BEAT + BEAT / 2, 0.5, 0.7)
    elif a == "strophe":
        syn(akkord_pad(akk, TAKT, 2000) * 0.6, t0, 0.6, 0.6)
        for e in range(8):
            syn(pluck(akk[0] + ARP[e], 0.32) * 0.8, t0 + e * BEAT / 2, 0.4 + 0.2 * (e % 2), 0.6 - 0.2 * (e % 2))
            if e % 2 == 1: syn(subbass(wurzel - 12, BEAT / 2 * 0.9), t0 + e * BEAT / 2)
            put(hat(e % 2 == 1), t0 + e * BEAT / 2, 0.55, 0.75)
        for q in range(4): put(kick(), t0 + q * BEAT)
        put(clap(), t0 + BEAT); put(clap(), t0 + 3 * BEAT)
    elif a == "probleme":
        # dunkel und halbes Tempo: Bordun, tickende Hi-Hats, Kick nur auf 1 und 3
        syn(drone([41, 41, 40, 39][b % 4], TAKT), t0, 0.8, 0.8)
        syn(lp(akkord_pad([65, 68, 72] if b % 2 == 0 else [64, 67, 71], TAKT), 900) * 0.5, t0, 0.6, 0.6)
        put(kick(), t0); put(kick() * 0.8, t0 + 2 * BEAT); put(clap() * 0.7, t0 + 2 * BEAT)
        for e in range(16): put(hat() * (0.6 if e % 4 else 1.0), t0 + e * BEAT / 4, 0.4, 0.8)
    elif a == "refrain":
        syn(akkord_pad(akk + [akk[0] + 12], TAKT, 4200), t0, 0.85, 0.85)
        for e in range(8):
            syn(pluck(akk[0] + ARP[e] + 12, 0.25, 1.4) * 0.55, t0 + e * BEAT / 2, 0.35 + 0.3 * (e % 2), 0.65 - 0.3 * (e % 2))
            syn(subbass(wurzel - 12, BEAT / 2 * 0.85), t0 + e * BEAT / 2 + (BEAT / 4 if e % 2 else 0) * 0)
            put(hat(e % 2 == 1), t0 + e * BEAT / 2, 0.55, 0.75)
            if e in (0, 2, 3, 5, 6):
                syn(pluck(HOOK[(e + b * 2) % 8], 0.45, 2.0) * 0.7, t0 + e * BEAT / 2, 0.6, 0.6)
        for q in range(4): put(kick(), t0 + q * BEAT)
        put(clap() * 1.1, t0 + BEAT); put(clap() * 1.1, t0 + 3 * BEAT)
        if (b - round(T["drop"] / TAKT)) % 4 == 0: put(crash(), t0, 0.8, 1.0)
    b += 1

# Pumpen: alle Synths ducken sich zu jedem Kick (ab dem Groove), wie beim Sidechain im Studio
pump = np.ones(N); tb = np.arange(N) / SR
ph = (tb % BEAT) / BEAT
p = 0.25 + 0.75 * np.minimum(1, ph / 0.45) ** 1.6
an = (tb >= TAKT * 0.9) & ~((tb >= T["probleme"]) & (tb < T["drop"])) & (tb < T["outro"])
pump[an] = p[an]
L += SYN_L * pump; R += SYN_R * pump

# Schluss: ein grosser Akkord klingt aus
d = LAENGE - T["outro"]
put(boom(), T["outro"]); put(crash() * 1.3, T["outro"]); put(kick(), T["outro"])
put(akkord_pad([53, 65, 68, 72, 77], d, 3500) * 1.2 * np.exp(-t_(d) * 0.7), T["outro"], 0.9, 0.9)
put(subbass(41, min(d, 3.0)) * np.exp(-t_(min(d, 3.0)) * 1.2), T["outro"])
# Effekte
put(riser(2.0), T["drop"] - 2.0, 0.9); put(boom(), T["drop"]); put(crash() * 1.2, T["drop"])
put(riser(1.5) * 0.6, T["groove"] - 1.5)
put(riser(1.0) * 0.7, T["outro"] - 1.0)
for x in CFG["schnitte"]: put(whoosh(), x - 0.22, 0.6, 0.9)
for x in CFG["stiche"]: put(boom() * 0.35, x); put(clap() * 0.5, x)

fade = np.ones(N); fi = int(0.02 * SR); fo = int(3.0 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo) ** 1.4
L *= fade; R *= fade
m = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / m * 1.4) * 0.85; R = np.tanh(R / m * 1.4) * 0.85
st = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(CFG["aus"], "wb") as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes(st.tobytes())
print("Musik", LAENGE, "s, Takt", round(TAKT, 4))
