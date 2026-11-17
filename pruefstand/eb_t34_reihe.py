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
js2 = """import("./src/einrichtblatt/vorlagen.js").then(m=>{const v=m.vorlageFuer({name:"SB-20RG"});const g=(p)=>!!(p&&p.werkzeug);
const z=(b)=>m.reihenMitRest(v,m.plaetzeMitFront34(v,b,g).plaetze).length;
console.log(JSON.stringify([z({plaetze:{}}),z({plaetze:{},kopf:{front34:true}}),z({plaetze:{T3421:{}}}),z({plaetze:{T3422:{werkzeug:"x"}}}),
m.front34Moeglich(m.vorlageFuer({name:"SB-16C"}))]));})"""
a = json.loads(subprocess.check_output(["node", "-e", js2]).decode())
pruef("Ohne Option keine Reihe", a[0] == 4)
pruef("Mit Option Reihe da", a[1] == 5)
pruef("Leerer T3421 ohne Option weg", a[2] == 4)
pruef("Mit Werkzeug immer da", a[3] == 5)
pruef("SB-16 ohne Option", a[4] is False)
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
