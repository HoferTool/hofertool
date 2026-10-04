#!/bin/bash
# Startzeiten der Sätze in Sekunden
ST=(0.6 4.0 7.8 14.6 22.25 24.6 30.1 34.0 38.9 41.5 46.0)
in=""; fc=""; mix=""
for i in $(seq 1 11); do
  in="$in -i s$i.wav"; ms=$(python3 -c "print(int(${ST[$((i-1))]}*1000))")
  fc="$fc[$((i-1)):a]aresample=44100,adelay=${ms}|${ms}[v$i];"; mix="$mix[v$i]"
done
ffmpeg -v error -y $in -filter_complex "${fc}${mix}amix=inputs=11:normalize=0,apad=whole_dur=50,atrim=0:50,highpass=f=90,acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=4,equalizer=f=3000:t=q:w=1:g=3,aformat=channel_layouts=stereo[v]" -map "[v]" stimme.wav
ffmpeg -v error -y -i musik.wav -i stimme.wav -filter_complex "[1:a]asplit=2[sc][vo];[0:a]volume=0.55[mu];[mu][sc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=300[duck];[duck][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=11[out]" -map "[out]" -ar 44100 ton.wav
ffmpeg -hide_banner -i ton.wav -af ebur128=framelog=quiet -f null - 2>&1 | grep "I:" | tail -1
