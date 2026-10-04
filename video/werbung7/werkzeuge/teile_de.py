# Sätze aus einzelnen Stücken zusammensetzen, damit die Bilder genau auf die Wörter passen.
# Gibt für jedes Stück den Beginn im Satz aus.
import subprocess, json, sherpa_onnx, numpy as np, wave
d = "/tmp/claude-0/tts/vits-piper-de_DE-thorsten-high/"
tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=d + "de_DE-thorsten-high.onnx", tokens=d + "tokens.txt", data_dir=d + "espeak-ng-data",
                                               noise_scale=0.6, noise_scale_w=0.75), num_threads=4)))
SAETZE = {
  4: (1.03, [("Wir fertigen auf Zeh-Enn-Zeh Drehmaschinen mit Stangen-Lader.", 0.15), ("Von Star,", 0.06), ("Hanwa,", 0.06), ("und Index.", 0.1), ("Und ganz neu: Wilmän Makodell.", 0)]),
  5: (1.0, [("Verschiedenste Materialien.", 0.12), ("Bis zweiundvierzig Millimeter Durchmesser.", 0)]),
  15: (1.0, [("Bestellungen.", 0.15), ("Zum Beispiel: fünfzig Wendeplatten von Fischer und Bolli.", 0.25), ("Position erfassen.", 0.88), ("Status auf bestellt.", 0.88), ("Ein Klick, und die Bestellung kommt als Pe De Eff in die Mehl.", 0)]),
}
# Satz 3 nennt Inhaber und GL: er steht nur lokal in werkzeuge/team_satz.json (Liste aus [Text, Pause]), nicht im Repository
import os
_ts = os.path.join(os.path.dirname(os.path.abspath(__file__)), "team_satz.json")
if os.path.exists(_ts): SAETZE[3] = (1.0, [tuple(x) for x in json.load(open(_ts, encoding="utf-8"))])
def roh(t, tempo):
    a = tts.generate(t, sid=0, speed=tempo); sherpa_onnx.write_wave("x.wav", a.samples, a.sample_rate)
    out = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", "x.wav", "-af",
        "aresample=44100:resampler=soxr,rubberband=pitch=1.25:formant=preserved,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse",
        "-f", "f32le", "-ac", "1", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32)
zeiten = {}
for nr, (tempo, teile) in SAETZE.items():
    stuecke, pos, beg = [], 0, []
    for t, pause in teile:
        a = roh(t, tempo); beg.append(round(pos / 44100, 2)); stuecke += [a, np.zeros(int(pause * 44100), np.float32)]; pos += len(a) + int(pause * 44100)
    x = np.concatenate(stuecke + [np.zeros(int(0.2 * 44100), np.float32)])
    w = wave.open(f"s{nr}.wav", "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
    zeiten[nr] = {"teile": beg, "laenge": round(len(x) / 44100, 2)}
print(json.dumps(zeiten)); json.dump(zeiten, open("teile7.json", "w"))
