# Satz-Datei "nr|text" -> s<nr>.wav: Piper "thorsten high" (deutsche Männerstimme), höher gesetzt und heller,
# damit sie dem frischen Klang aus Fassung 6 näher kommt. 44.1 kHz, ohne Stille vorne und hinten.
import sys, subprocess, sherpa_onnx
d = "/tmp/claude-0/tts/vits-piper-de_DE-thorsten-high/"
tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=d + "de_DE-thorsten-high.onnx", tokens=d + "tokens.txt", data_dir=d + "espeak-ng-data",
                                               noise_scale=0.6, noise_scale_w=0.75), num_threads=4)))
TEMPO = float(sys.argv[2]) if len(sys.argv) > 2 else 1.05
HOCH = sys.argv[3] if len(sys.argv) > 3 else "1.25"
for z in open(sys.argv[1], encoding="utf-8"):
    if "|" not in z: continue
    i, t = z.rstrip("\n").split("|", 1)
    a = tts.generate(t, sid=0, speed=TEMPO)
    sherpa_onnx.write_wave(f"roh{i}.wav", a.samples, a.sample_rate)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", f"roh{i}.wav", "-af",
                    f"aresample=44100:resampler=soxr,rubberband=pitch={HOCH}:formant=preserved,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse,afade=t=in:d=0.01,apad=pad_dur=0.2", f"s{i}.wav"], check=True)
    print(i, end=" ", flush=True)
