"""Alle Prüfskripte nacheinander ausführen. Aufruf: python3 pruefstand/alle.py"""
import os, subprocess, sys

HIER = os.path.dirname(os.path.abspath(__file__))
SKRIPTE = ["final", "extern", "kopieren", "rueckgaengig", "ziehen3", "paddash"]

schlecht = []
for name in SKRIPTE:
    print(f"== {name}", flush=True)
    r = subprocess.run([sys.executable, os.path.join(HIER, name + ".py")],
                       cwd=HIER, capture_output=True, text=True, timeout=600)
    ausgabe = [z for z in r.stdout.splitlines() if '"GET ' not in z]
    print("\n".join(ausgabe[-6:]))
    if r.returncode != 0 or "Fehler: keine" not in r.stdout:
        schlecht.append(name)
        print(r.stderr[-1500:])

print()
print("Alles gut." if not schlecht else "Probleme in: " + ", ".join(schlecht))
sys.exit(1 if schlecht else 0)
