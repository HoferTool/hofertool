# Schneidet die ElevenLabs-Aufnahme (ein Stück, alle Sätze) in 19 Sätze und rechnet den neuen Zeitplan:
# Die Bilder folgen der Stimme. Anker = alte Zeit im Video -> Zeit des Wortes in der neuen Aufnahme.
# Aufruf: python3 werkzeuge/schnitt_el.py aufnahme.mp3  -> stimme_el/s1..s19.wav und werkzeuge/zeitplan.json
import sys, json, subprocess, os
ROH = sys.argv[1]
# Grenzen der Sätze in der Aufnahme (Sekunden), aus der Pausensuche, je Satz [von, bis]
SAETZE = [(0.0, 3.246), (3.246, 8.858), (8.858, 16.489), (16.489, 24.05), (29.145, 38.030), (38.030, 42.512),
          (42.512, 45.957), (45.957, 51.189), (51.189, 55.489), (55.489, 58.279), (58.279, 63.317), (63.317, 69.147),
          (69.147, 73.249), (73.249, 78.388), (78.388, 81.251), (81.251, 91.792), (91.792, 93.386), (93.386, 99.468),
          (99.468, 107.39)]
EIN = 9.5
ALT = [0.4, 3.2, 7.9, 15.7] + [t + EIN for t in [15.6, 22.5, 27.1, 29.9, 33.8, 37.7, 40.0, 44.6, 49.4, 52.7, 57.0, 59.6, 71.3, 73.7, 78.6]]
ALT_ENDE = 83.9 + EIN
# Wörter, auf die Bilder warten: (Satz-Nr ab 1, alte Zeit im Video, Zeit in der Aufnahme)
WORTE = [(3, 10.97, 13.04), (3, 11.84, 13.71), (3, 12.75, 14.40), (3, 14.15, 15.48),
         (4, 17.9, 20.40), (4, 19.3, 21.97), 
         (5, 18.85 + EIN, 33.05), (5, 19.3 + EIN, 33.78), (5, 20.0 + EIN, 34.62), (5, 21.4 + EIN, 36.62),
         (6, 24.3 + EIN, 40.36),
         (16, 63.7 + EIN, 85.61), (16, 65.7 + EIN, 86.82), (16, 67.85 + EIN, 88.48), (16, 69.45 + EIN, 90.30)]
LUECKE_MIN, LUECKE_MAX, SCHLUSS = 0.35, 1.0, 1.8

def dauer(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
os.makedirs("stimme_el", exist_ok=True)
anfang, laenge = [], []
for i, (a, b) in enumerate(SAETZE, 1):
    # Satz roh ausschneiden, dann Stille vorne und hinten weg; gemessen wird, wie viel vorne wegfiel
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", ROH, "-ss", f"{a}", "-to", f"{b}", "-ar", "44100", "/tmp/_r.wav"], check=True)
    voll = dauer("/tmp/_r.wav")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", "/tmp/_r.wav", "-af",
                    "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.03", "/tmp/_v.wav"], check=True)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", "/tmp/_v.wav", "-af",
                    "areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.08,areverse", f"stimme_el/s{i}.wav"], check=True)
    rest = dauer(f"stimme_el/s{i}.wav")
    anfang.append(a + voll - dauer("/tmp/_v.wav")); laenge.append(rest)
# Neue Startzeiten: Satz an Satz, mit einer Lücke wie früher (begrenzt)
NEU = [ALT[0]]
for i in range(1, len(ALT)):
    alt_luecke = ALT[i] - ALT[i - 1] - 0.0
    NEU.append(NEU[-1] + laenge[i - 1] + min(LUECKE_MAX, max(LUECKE_MIN, 0.25 * (alt_luecke - laenge[i - 1]) + LUECKE_MIN)))
NEU_ENDE = NEU[-1] + laenge[-1] + SCHLUSS
anker = [(0.0, 0.0)] + [(ALT[i], NEU[i]) for i in range(len(ALT))]
for nr, alt, wort in WORTE:
    anker.append((alt, NEU[nr - 1] + (wort - anfang[nr - 1])))
anker.append((ALT_ENDE, NEU_ENDE))
anker.sort()
for (a1, n1), (a2, n2) in zip(anker, anker[1:]):
    assert a2 > a1 and n2 > n1, f"Anker nicht steigend: {a1}->{n1}, {a2}->{n2}"
json.dump({"start": [round(x, 3) for x in NEU], "ende": round(NEU_ENDE, 2), "anker": [[round(a, 3), round(n, 3)] for a, n in anker]},
          open("werkzeuge/zeitplan.json", "w"), indent=1)
print("Länge neu", round(NEU_ENDE, 1), "s")
for i in range(len(ALT)): print(i + 1, round(ALT[i], 2), "->", round(NEU[i], 2), "Dauer", round(laenge[i], 2))
