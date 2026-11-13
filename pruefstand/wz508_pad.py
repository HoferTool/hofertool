# Pad Mode → 508 Werkzeuge (seit 1.495.0): Foto mit Marke, Fach und Marke wählen, Liste Maschine / Schrank
from wz508_hilfe import alle_auf_nr
import time, os, tempfile
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def fach(nr, name, q, x, r, s=30000, t=3, i="180.0000", e=0):
    return [f"N{nr} D1 ({name})", f"G{nr}", f"T1 E{e} F1 P0 R0 Q{q}", "I9 J3600 K3600",
            f"A-2 S{s} T{t} I{i} J0.0000 K0.0000 F0 Q0 R0 B0.0", "A-3 I0 J0 K0 L0", "A-4 I0.0000 J0.0000 K0 L0"] + \
           [f"A{k} X{x} U0.0100 S0.0000 R{r}" for k in range(1, 5)] + ["A5 X999.9999 U0.0000 S0.0000 R0.0000"]
dat = ["%"] + fach(1, "BOHRER D 1.8 VHM", 160, "77.0639", "0.9000", i="118.0000") \
      + fach(2, "FRAESER VHM D2.0", 110, "73.8268", "0.9800") + ["N0", "G3"] \
      + fach(4, "MESSTASTER", 900, "125.1323", "1.0000", s=300) + ["N0", "G5", "%"]
kopf = "Tool,IdNumber,ToolType,ToolUserType,Permanent,UnitsDiameter,Diameter,Angle,Radius,ProfileRadius,UpperRadius,NumTeeth,Description,TaperAngle,ShankDiameter,UnitsLength,Length,TotalLength,ShoulderLength,Startshoulderlength,TipLength,CuttingLength,HLength,Material,UnitsFeedSpin,Ftype,FeedXY,FeedZ,FeedFinish,Stype,Spin,SpinFinish,FeedZPenetration,FeedLeadIn,FeedLeadOut,FeedLink,ToolName,ToolGroupName,HolderName,GroupHolderName,Direction,ChamferLength,TipDiameter,ShoulderDiameter,ShoulderAngle,Message1,Message2,Message3,Message4,Message5,FloodCoolant,MistCoolant,HighPressureCoolant,LowPressureCoolant,ThroughHighPressureCoolant,ThroughLowPressureCoolant,AirBlastCoolant,MinimumQuantityLubricationCoolant,MinimumQuantityLubricationValue,Rough,SpinDirection,SpinLimit"
def z(nr, art, d, w, zahn, text, hl, sl=0):
    return f'"{nr}"," ","{art}"," x",0,mm,{d},{w},0,0,0,{zahn}," ",0,3,mm,20,40,11,0,0,7.4,{hl}," None",mm,"F",1000,300,800,"S",3500,4000,"Y",100,100,200," {text}"," "," Halter"," ","On B-axis",0,0,1.8,20," "," "," "," "," ",0,0,0,0,0,0,0,0,0,0,CW,{sl}'
csv = "\r\n".join([kopf, z(1, "DRILL", 1.8, 140, 2, "VHM BOHR D1.8", 75), z(2, "END MILL", 2, 0, 3, "VHM SF D2", 72),
                   z(3, "BALL NOSE MILL", 1, 0, 2, "Kopierfräser R0.5", 80, 25000), z(4, "END MILL", 6, 0, 4, "FRAESER D6", 70),
                   z(9, "END MILL", 4, 0, 4, "FRAESER D4", 70), "Shapes", "Tool,Name,GroupName,NEdges"]) + "\r\n"
tmp = tempfile.mkdtemp()
pd, pc = os.path.join(tmp, "GESTOUTI.DAT"), os.path.join(tmp, "werkzeuge.CSV")
open(pd, "w", newline="").write("\r\n".join(dat))
open(pc, "wb").write(csv.encode("cp1252"))

import struct, zlib
def png(pfad):
    roh = b"".join(b"\x00" + b"\x80\x40\x20" * 8 for _ in range(8))
    def teil(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(pfad, "wb").write(b"\x89PNG\r\n\x1a\n" + teil(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)) + teil(b"IDAT", zlib.compress(roh)) + teil(b"IEND", b""))
pf = os.path.join(tmp, "foto.png"); png(pf)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""TEST.daten.wz508_werkzeuge = [
      { marke: '111111', name: 'FRAESER VHM D2.0', ort: 'maschine', fach: 2, nr: 2 },
      { marke: '222222', name: 'Kopierfraeser R0.5', ort: 'vorbereitet' },
      { marke: '333333', name: 'BOHRER D 1.8 VHM', ort: 'maschine', fach: 1, nr: 1 }]""")
    pg.evaluate("document.getElementById('pad-knopf').click()")
    # Startbild hat seit 1.505.0 keine Kachel mehr: über die Macodel im Park
    pg.evaluate("""TEST.daten.machine_types.push({ id: 't-mac', name: 'Macodel' });
      TEST.daten.machines.push({ id: 'm-401', park_id: TEST.daten.machine_parks[1].id, name: 'W&M 508MT2', machine_number: '401', sort_order: 99, is_active: true, type_id: 't-mac' });""")
    pg.wait_for_selector("#pad [data-padwo='parks']")
    pruefe("Startbild ohne Kachel 508", not pg.is_visible("#pad [data-padwo='wz508']"))
    pg.click("#pad [data-padwo='parks']")
    pg.click("#pad [data-park='" + pg.evaluate('TEST.daten.machine_parks[1].id') + "']"); pg.wait_for_timeout(800)
    if pg.is_visible("#pad [data-padtyp='t-mac']"): pg.click("#pad [data-padtyp='t-mac']")
    pg.wait_for_selector("#pad [data-wz508-park]"); pg.click("#pad [data-wz508-park]")
    pg.wait_for_selector("#pad-wz5")
    # Vorbereiten: Foto und Marke
    pg.set_input_files("#wz5p-foto", pf)
    pg.fill("#wz5p-marke", "44a4444")
    pruefe("Marke nur Ziffern", pg.input_value("#wz5p-marke") == "444444")
    pg.fill("#wz5p-name", "Fräser D6")
    pg.click("#wz5p-speichern"); pg.wait_for_selector("[data-wz5p-karte='444444']")
    z = pg.evaluate("TEST.daten.wz508_werkzeuge.find(w => w.marke === '444444')")
    pruefe("Vorbereitet gespeichert mit Foto", z and z["ort"] == "vorbereitet" and "wz508/444444/" in (z.get("foto_pfad") or ""))
    pruefe("Foto hochgeladen", pg.evaluate("TEST.protokoll.some(x => x.art === 'upload' && x.pfad.startsWith('wz508/444444/'))"))
    pg.fill("#wz5p-marke", "222222")
    pruefe("Hinweis bei vorhandener Marke", pg.is_visible("#wz5p-schon"))
    pg.screenshot(path=os.path.join(tmp, "pad-vorbereiten.png"))
    # Bestücken
    pg.click("[data-wz5p-reiter='bestuecken']"); pg.wait_for_selector("#wz5")
    pg.set_input_files("#wz5-dat", pd); pg.set_input_files("#wz5-csv", pc)
    pg.wait_for_selector("#wz5-tabelle")
    alle_auf_nr(pg)
    pruefe("Marke im Fach 2 schon da", "111111" in pg.text_content("[data-wz5='2']"))
    pg.select_option("[data-wz5-fach='3']", "5")
    pg.select_option("[data-wz5-fach='1']", "3")
    pg.select_option("[data-wz5-fach='9']", "1")
    pruefe("T9 ersetzt den Bohrer in Fach 1", "raus:" in pg.text_content("[data-wz5='9']") and "Neu" in pg.text_content("[data-wz5='9']"))
    pruefe("T1 in Fach 3 neu, Fach 1 wird geleert", "Neu" in pg.text_content("[data-wz5='1']") and "Fach 1" in pg.text_content("[data-wz5='1']"))
    pg.click("[data-wz5-marke='3']"); pg.wait_for_selector("#wz5p-wahl")
    pruefe("Auswahl zeigt vorbereitete, nicht die vergebene", pg.is_visible("[data-wz5p-wahl='222222']") and not pg.is_visible("[data-wz5p-wahl='111111']"))
    pg.screenshot(path=os.path.join(tmp, "pad-wahl.png"))
    pg.click("[data-wz5p-wahl='222222']")
    pruefe("Marke 222222 bei T3", "222222" in pg.text_content("[data-wz5='3']"))
    pg.screenshot(path=os.path.join(tmp, "pad-bestuecken.png"), full_page=True)
    with pg.expect_download() as dl:
        pg.click("#wz5-laden")
    zeilen = open(dl.value.path(), "rb").read().decode("ascii").split("\r\n")
    nach = lambda g: zeilen[zeilen.index(g) - 1]
    pruefe("Fach 1: T9", nach("G1").startswith("N9 D1"))
    pruefe("Fach 3: T1", nach("G3").startswith("N1 D1"))
    pruefe("Fach 5: T3", nach("G5").startswith("N3 D1"))
    pruefe("Nr. 1 nur einmal", sum(1 for x in zeilen if x.startswith("N1 ")) == 1)
    pruefe("Taster bleibt", "N4 D1 (MESSTASTER)" in zeilen)
    pg.wait_for_selector("#wz5p-raus")
    pruefe("Frage nach Bohrer 333333", pg.is_visible("[data-wz5p-raus='333333']"))
    pg.screenshot(path=os.path.join(tmp, "pad-raus.png"))
    pg.click("[data-wz5p-raus-zerlegt='333333']"); pg.click("#wz5p-raus-ok")
    pg.wait_for_timeout(800)
    d = {w["marke"]: w for w in pg.evaluate("TEST.daten.wz508_werkzeuge")}
    pruefe("222222 jetzt in Fach 5 als T3", d.get("222222", {}).get("ort") == "maschine" and d["222222"].get("fach") == 5 and d["222222"].get("nr") == 3)
    pruefe("111111 bleibt in Fach 2", d.get("111111", {}).get("ort") == "maschine" and d["111111"].get("fach") == 2)
    pruefe("Zerlegter Bohrer weg, Marke frei", "333333" not in d)
    # Liste
    pg.click("[data-wz5p-reiter='liste']"); pg.wait_for_selector("[data-wz5p-gruppe='maschine']")
    mt = pg.text_content("[data-wz5p-gruppe='maschine']")
    pruefe("Liste Maschine", "111111" in mt and "222222" in mt and "Fach 5" in mt)
    pg.click("[data-wz5p-schrank='111111']"); pg.wait_for_timeout(600)
    pruefe("In den Schrank", "111111" in pg.text_content("[data-wz5p-gruppe='schrank']"))
    pg.screenshot(path=os.path.join(tmp, "pad-liste.png"))
    pg.evaluate("document.body.classList.add('dunkel')")
    pg.click("[data-wz5p-reiter='bestuecken']"); pg.wait_for_selector("#wz5-tabelle")
    pg.screenshot(path=os.path.join(tmp, "pad-bestuecken-dunkel.png"), full_page=True)
    br.close()
print("Bilder:", tmp)
print("Fehler:", ", ".join(fehler) if fehler else "keine")
