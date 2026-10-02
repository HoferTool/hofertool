# Alle Prüfungen nacheinander. Aufruf im Ordner pruefstand:  python alle_tests.py
import subprocess, sys
TESTS = ['final', 'rechner', 'einkauf', 'bestellungen', 'start', 'ziehen3', 'kopieren', 'rueckgaengig', 'extern', 'paddash', 'escape', 'heute_backup', 'taste_h', 'bestzeit', 'acht', 'startruhe', 'padtext', 'padstart', 'padweg', 'suche_reihe', 'woche_breit', 'sieben', 'vorb', 'zurueck2022', 'mailbilder', 'geraetzurueck', 'vier2', 'ohnekamera', 'pin']
gut = 0
for t in TESTS:
    r = subprocess.run([sys.executable, t + ".py"], capture_output=True, text=True, timeout=400)
    zeilen = [z for z in (r.stdout + r.stderr).splitlines() if "Fehler:" in z or "Error" in z]
    ok = r.returncode == 0 and not any("Error" in z for z in zeilen) and all("Fehler: keine" in z for z in zeilen if "Fehler:" in z)
    gut += ok
    print(("OK    " if ok else "FEHLER") + "  " + t + ("" if ok else "  ->  " + " | ".join(zeilen[-2:])))
print("\n%d von %d Prüfungen ohne Fehler" % (gut, len(TESTS)))
