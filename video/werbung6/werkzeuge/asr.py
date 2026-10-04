import sys, sherpa_onnx, wave, numpy as np, subprocess
d="/tmp/claude-0/hf/stimmen/sherpa-onnx-whisper-small/"
r=sherpa_onnx.OfflineRecognizer.from_whisper(encoder=d+"small-encoder.int8.onnx",decoder=d+"small-decoder.int8.onnx",tokens=d+"small-tokens.txt",language="de",task="transcribe",num_threads=4)
for p in sys.argv[1:]:
    raw=subprocess.run(["ffmpeg","-nostdin","-v","error","-i",p,"-ac","1","-ar","16000","-f","s16le","-"],capture_output=True).stdout
    a=np.frombuffer(raw,np.int16).astype(np.float32)/32768
    s=r.create_stream(); s.accept_waveform(16000,a); r.decode_stream(s); print(p.split("/")[-1], "|", s.result.text)
