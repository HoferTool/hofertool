# Schnelle Bildfolge für die Feier-Szene: je Ausschnitt ein kurzes Stück, hochkant rechtsbündig auf dunkler Fläche.
# Quellen sind private Handyvideos von Patrick (nie im Repository).
import subprocess, json, sys
U = "/root/.claude/uploads/1da7acb4-a90e-52c3-b602-8619529742e8/"
TEILE = [
    ("bild", U + "accabf67-image.jpg", 0, "Grillieren", 1.2),
    ("vid", U + "ed2530b2-DBCE5CF7-D3B8-41B4-803B-A640548956EF.mp4", 0.1, "Zusammen kochen", 1.6),
    ("bild", "assets/fest_bogen.jpg", 0, "Bogenschiessen", 1.4),
    ("vid", U + "4bf5ee06-IMG_6793.mov", 1.6, "Ausflug", 1.8),
    ("vid", U + "c78ab20c-IMG_6887.mov", 0.9, "Ab in den Pool", 2.6),
    ("bild", "assets/fest_bier.jpg", 0, "Bierdegustation", 1.4),
    ("vid", U + "8e575bc9-5469BD45-F776-4588-BDE8-68207B0FE4A5.mp4", 2.6, "Unsere Hühner", 1.8),
    ("bild", "assets/fest_brenner.jpg", 0, "Flambieren", 1.5),
    ("bild", U + "f24b96d0-image.jpg", 0, "Coiffeur im Haus", 1.4),
    ("bild", "assets/fest_fitness.jpg", 0, "Fitness-Event", 1.4),
    ("vid", U + "9ecc5b6e-filtered-1A46E79D-015C-480E-9F88-FE45829A0481.mp4", 1.0, "Basteln fürs SR-32", 2.0),
    ("bild", "assets/fest_kostuem.jpg", 0, "Verkleiden", 1.5),
    ("vid", U + "fd68e2cd-2464A849-8014-41B7-9482-A3AE649E50DF.mp4", 2.6, "Anpacken", 2.0),
    ("bild", "assets/fest_pause.jpg", 0, "Pause muss sein", 1.5),
]
# Clip rechtsbündig auf dunkler Fläche, links bleibt Platz für den Text (kommt im HTML darüber)
F = ("color=c=0x0b1a33:s=1920x1080:r=30[bg];[0:v]fps=30,scale=-2:960[fg];"
     "[bg][fg]overlay=W-w-80:(H-h)/2:shortest=1,format=yuv420p")
teile = []
for k, (art, q, ab, _, D) in enumerate(TEILE):
    z = f"mont/m{k}.mp4"
    ein = ["-loop", "1", "-t", f"{D}", "-i", q] if art == "bild" else ["-ss", f"{ab}", "-t", f"{D}", "-i", q]
    if art == "vid": f = F
    else:  # Foto langsam heranzoomen; Querformat schmaler, damit links Platz für den Text bleibt
        from PIL import Image, ImageOps
        bw, bh = ImageOps.exif_transpose(Image.open(q)).size
        f = F.replace("[0:v]fps=30,", f"[0:v]fps=30,zoompan=z='1+0.0015*on':d=1:s={bw // 2 * 2}x{bh // 2 * 2}:fps=30,")
        if bw > bh: f = f.replace("scale=-2:960", "scale=780:-2")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *ein, "-filter_complex", f, "-an", "-t", f"{D}", "-c:v", "libx264", "-crf", "18", z], check=True)
    teile.append(z)
open("mont/liste.txt", "w").write("".join(f"file '{t.split('/')[1]}'\n" for t in teile))
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "mont/liste.txt", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "assets/k_montage.mp4"], check=True)
json.dump([[t[3], t[4]] for t in TEILE], open("mont/namen.json", "w"), ensure_ascii=False)
print("ok", len(TEILE))
