# Erzeugt die Musik für das Werbevideo selbst (keine fremden Rechte):
# 120 BPM, a-Moll, ruhiger Anfang, Spannung bei den Problemen, Drop beim Tool.
import numpy as np
from scipy.signal import butter, lfilter, sosfilt
import wave

SR = 44100
import json, sys
CFG = json.load(open(sys.argv[1]))
LAENGE = CFG["laenge"]
N = int(SR * LAENGE)
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)

def t_(d): return np.arange(int(d * SR)) / SR
def put(sig, start, gl=1.0, gr=None):
    gr = gl if gr is None else gr
    i = int(start * SR)
    if i >= N: return
    s = sig[: N - i]
    L[i:i+len(s)] += s * gl; R[i:i+len(s)] += s * gr
def bp(x, lo, hi, o=2):
    return sosfilt(butter(o, [lo, hi], btype="band", fs=SR, output="sos"), x)
def lp(x, f, o=2):
    return sosfilt(butter(o, f, btype="low", fs=SR, output="sos"), x)
def hp(x, f, o=2):
    return sosfilt(butter(o, f, btype="high", fs=SR, output="sos"), x)
def note(n): return 440 * 2 ** ((n - 69) / 12)
def saw(f, d, detune=0.0):
    t = t_(d); ph = (t * f * (1 + detune)) % 1.0
    return 2 * ph - 1

# Klänge
def kick():
    t = t_(0.45); f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    k = np.sin(ph) * np.exp(-t * 7.5)
    k[:90] += rng.standard_normal(90) * 0.25 * np.linspace(1, 0, 90)
    return np.tanh(k * 1.6) * 0.9
def clap():
    t = t_(0.3); n = rng.standard_normal(len(t))
    env = np.exp(-t * 18)
    for o in (0.0, 0.012, 0.024): env += np.exp(-np.clip(t - o, 0, None) * 120) * (t >= o) * 0.6
    return bp(n, 900, 4500) * env * 0.5
def hat(offen=False):
    t = t_(0.25 if offen else 0.06); n = rng.standard_normal(len(t))
    return hp(n, 7000) * np.exp(-t * (14 if offen else 70)) * 0.22
def tick():
    t = t_(0.03); return hp(rng.standard_normal(len(t)), 5000) * np.exp(-t * 200) * 0.25
def bass(n, d):
    f = note(n); s = saw(f, d) + 0.6 * saw(f, d, 0.004) + 0.8 * np.sin(2 * np.pi * f / 2 * t_(d))
    env = np.minimum(1, t_(d) * 200) * np.exp(-t_(d) * 3)
    return np.tanh(lp(s, 700) * 1.5) * env * 0.32
def pad(noten, d, hell=2200):
    s = np.zeros(int(d * SR))
    for n in noten:
        for dt in (-0.006, 0, 0.007): s += saw(note(n), d, dt)
    s = lp(s / (len(noten) * 3), hell)
    t = t_(d); env = np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.4)
    return s * env * 0.5
def pluck(n, d=0.22):
    t = t_(d); f = note(n)
    s = (saw(f, d) + saw(f, d, 0.01)) * 0.5
    return lp(s, 3500) * np.exp(-t * 16) * 0.28
def riser(d):
    t = t_(d); n = rng.standard_normal(len(t))
    out = np.zeros_like(n); seg = int(SR * 0.05)
    for i in range(0, len(n), seg):
        frac = i / len(n); c = 300 + 7000 * frac ** 2
        out[i:i+seg] = bp(n[i:i+seg+2000], c * 0.7, min(c * 1.3, 20000))[:len(n[i:i+seg])]
    f = 200 + 1600 * (t / d) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.15
    return (out * 0.35 + tone) * (t / d) ** 1.5
def boom():
    t = t_(2.0); f = 35 + 60 * np.exp(-t * 6)
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    n = lp(rng.standard_normal(len(t)), 1200) * np.exp(-t * 4) * 0.4
    return np.tanh((b + n) * 1.4) * 0.8
def whoosh(d=0.5):
    t = t_(d); n = rng.standard_normal(len(t))
    env = np.sin(np.pi * t / d) ** 2
    return bp(n, 600, 6000) * env * 0.25

# Harmonie: Am F C G, je ein Takt (2 s)
FOLGE = [(57, [69, 72, 76]), (53, [65, 69, 72]), (48, [67, 72, 76]), (55, [67, 71, 74])]
TAKT = 4 * BEAT

def takt_nr(t): return int(round(t / TAKT))


T = CFG["t"]  # Zeitpunkte der Abschnitte, schon verschoben
def abschnitt(t):
    if t < T["groove"]: return "intro"
    if t < T["probleme"]: return "groove"
    if t < T["drop"]: return "probleme"
    if t < T["outro"]: return "drop"
    return "outro"
pump = np.ones(N)
def pumpen(t, tief=0.3):
    i = int(t * SR); seg = int(0.25 * SR)
    if i >= N: return
    seg = min(seg, N - i)
    pump[i:i+seg] = np.minimum(pump[i:i+seg], np.linspace(tief, 1, seg) ** 0.6)
anzahl = int(LAENGE / TAKT) + 1
for b in range(anzahl):
    t0 = b * TAKT
    if t0 >= LAENGE: break
    a = abschnitt(t0 + 0.01)
    wurzel, akk = FOLGE[b % 4]
    if a == "intro":
        put(pad(akk, TAKT + 0.3, 1400 + b * 200), t0, 0.5, 0.45)
        if t0 >= 1.9:
            for q in range(4): put(kick() * 0.6, t0 + q * BEAT)
        if t0 >= 5.9:
            for q in range(4):
                put(hat(), t0 + q * BEAT + BEAT / 2, 0.6, 0.8)
                put(bass(wurzel - 12, BEAT * 0.42) * 0.7, t0 + q * BEAT + BEAT / 2)
    elif a == "groove":
        put(pad(akk, TAKT + 0.3, 2200), t0, 0.4, 0.45)
        for q in range(4):
            put(kick() * 0.85, t0 + q * BEAT); pumpen(t0 + q * BEAT, 0.5)
            put(hat(q % 2 == 1) * 0.8, t0 + q * BEAT + BEAT / 2, 0.55, 0.75)
            put(hat() * 0.5, t0 + q * BEAT + BEAT / 4, 0.7, 0.4)
            for e in (0, 1): put(bass(wurzel - 12 + 12 * e, BEAT * 0.4) * 0.85, t0 + q * BEAT + e * BEAT / 2)
        put(clap() * 0.6, t0 + 3 * BEAT)
        arp = akk + [akk[0] + 12]
        for s_ in range(8): put(pluck(arp[(s_ * 3) % 4]) * 0.7, t0 + s_ * BEAT / 2, 0.75 if s_ % 2 else 0.45, 0.45 if s_ % 2 else 0.75)
    elif a == "probleme":
        put(pad([45, 52, 57], TAKT + 0.3, 650), t0, 0.6)
        for q in range(8): put(tick(), t0 + q * BEAT / 2, 0.5 if q % 2 else 0.9, 0.9 if q % 2 else 0.5)
        put(kick() * 0.7, t0); put(kick() * 0.6, t0 + 2.5 * BEAT)
        put(bass(33, TAKT * 0.9) * 0.6, t0)
    elif a == "drop":
        wurzel, akk = FOLGE[(b - int(T["drop"] / TAKT)) % 4]
        put(pad(akk, TAKT + 0.2, 3200), t0, 0.42, 0.5)
        for q in range(4):
            put(kick(), t0 + q * BEAT); pumpen(t0 + q * BEAT, 0.25)
            put(hat(q % 2 == 1), t0 + q * BEAT + BEAT / 2, 0.55, 0.75)
            put(hat() * 0.6, t0 + q * BEAT + BEAT / 4, 0.7, 0.4)
            put(hat() * 0.6, t0 + q * BEAT + 3 * BEAT / 4, 0.4, 0.7)
            for e in (0, 1): put(bass(wurzel - 12 + 12 * e, BEAT * 0.42), t0 + q * BEAT + e * BEAT / 2)
        put(clap(), t0 + BEAT); put(clap(), t0 + 3 * BEAT)
        arp = akk + [akk[0] + 12]
        for s_ in range(16):
            n = arp[(s_ * 3) % 4] + (12 if s_ % 8 == 7 else 0)
            put(pluck(n), t0 + s_ * BEAT / 4, 0.75 if s_ % 2 else 0.45, 0.45 if s_ % 2 else 0.75)
for t in CFG["booms"]: put(boom() * 0.8, t)
for t in CFG["whoosh"]: put(whoosh(0.45), t - 0.22, 0.6, 0.9)
for t in CFG["stich"]: put(boom() * 0.45, t); put(clap() * 0.8, t)
put(riser(2.0), T["drop"] - 2.0, 0.9)
put(riser(1.2) * 0.6, T["outro"] - 1.2)
put(boom() * 1.0, T["drop"])
put(boom() * 0.9, T["outro"])
put(pad([57, 64, 69, 72], LAENGE - T["outro"], 1800) * 1.2, T["outro"])
L *= 0.6 + 0.4 * pump; R *= 0.6 + 0.4 * pump
fade = np.ones(N); fi = int(0.05 * SR); fo = int(2.5 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
L *= fade; R *= fade
m = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / m * 1.2) * 0.85; R = np.tanh(R / m * 1.2) * 0.85
st = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(CFG["aus"], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
print("Musik", LAENGE)
