"""Einrichtblatt: T3421–T3423 stehen direkt unter der Reihe T3100–T3400
(seit 1.603.2), nicht hinten in einer eigenen Reihe."""
import json, subprocess, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
js = """import("./src/einrichtblatt/vorlagen.js").then(m=>{const v=m.vorlageFuer({name:"SB-20RG"});
console.log(JSON.stringify(m.reihenMitRest(v,{T3421:1,T3422:1,T3423:1,T2000:1})));})"""
r = json.loads(subprocess.check_output(["node", "-e", js]).decode())
fehler = []
def pruef(name, ok):
    print(("ok   " if ok else "FEHL ") + name)
    if not ok: fehler.append(name)
pruef("Reihe T3100 an zweiter Stelle", r[1][2] == "T3100")
pruef("T3421–T3423 gleich darunter", r[2] == [None, None, "T3421", "T3422", "T3423", None])
pruef("Danach T1100", r[3][2] == "T1100")
pruef("T2000 hinten", r[-1][2] == "T2000")
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
