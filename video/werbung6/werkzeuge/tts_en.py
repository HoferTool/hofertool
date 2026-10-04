# Satz-Datei "nr|text" -> s<nr>.wav mit Piper "ryan high" (englische Männerstimme), 44.1 kHz, ohne Stille vorne und hinten
import sys, subprocess, sherpa_onnx
d = "/tmp/claude-0/tts/vits-piper-en_US-ryan-high/"
tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=d + "en_US-ryan-high.onnx", tokens=d + "tokens.txt", data_dir=d + "espeak-ng-data",
                                               noise_scale=0.75, noise_scale_w=0.85), num_threads=4)))
TEMPO = float(sys.argv[2]) if len(sys.argv) > 2 else 1.08
for z in open(sys.argv[1], encoding="utf-8"):
    if "|" not in z: continue
    i, t = z.rstrip("\n").split("|", 1)
    a = tts.generate(t, sid=0, speed=TEMPO)
    sherpa_onnx.write_wave(f"roh{i}.wav", a.samples, a.sample_rate)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", f"roh{i}.wav", "-af",
                    "aresample=44100:resampler=soxr,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,afade=t=in:d=0.01,apad=pad_dur=0.2", f"s{i}.wav"], check=True)
    print(i, end=" ", flush=True)
