# Satz-Datei "nr|text" → s<nr>.wav (Piper Thorsten high, 44.1 kHz, Anfang ohne Stille, 0.25 s Luft am Ende)
import sys, subprocess
M = "/tmp/claude-0/tts/vits-piper-de_DE-thorsten-high/de_DE-thorsten-high.onnx"
for z in open(sys.argv[1], encoding="utf-8"):
    if "|" not in z: continue
    i, t = z.rstrip("\n").split("|", 1)
    subprocess.run(["piper", "-m", M, "--length-scale", "0.86", "--noise-scale", "0.75", "--noise-w", "0.85", "--sentence-silence", "0.1", "-f", f"roh{i}.wav"],
                   input=t.encode(), capture_output=True, check=True)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", f"roh{i}.wav", "-af",
                    "aresample=44100:resampler=soxr,silenceremove=start_periods=1:start_threshold=-45dB,afade=t=in:d=0.01,apad=pad_dur=0.25", f"s{i}.wav"], check=True)
    print(i, end=" ", flush=True)
