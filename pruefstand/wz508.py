# NC-PRO → 508 Werkzeuge (seit 1.494.0): GESTOUTI.DAT + CSV aus InventorCAM → neue GESTOUTI.DAT
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

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/wz508']"); pg.click("[data-unter='nc/wz508']")
    pg.wait_for_selector("#wz5")
    pg.set_input_files("#wz5-dat", pd); pg.set_input_files("#wz5-csv", pc)
    pg.wait_for_selector("#wz5-tabelle")
    # seit 1.528.0: nichts von selbst platziert
    pruefe("Ohne Wahl kein Fach", all("Kein Fach" in r.text_content() for r in pg.locator("#wz5-tabelle tbody tr").all())
           and pg.is_disabled("#wz5-laden") and pg.locator("[data-mag-fach].mag5-platz--cam").count() == 0)
    alle_auf_nr(pg)
    pruefe("Datei gelesen: 5 Fächer, 3 belegt", "5 Fächer, 3 belegt" in pg.text_content("#wz5-dat-ok"))
    zeile = lambda n: pg.text_content(f"[data-wz5='{n}']")
    pruefe("Fach 1 ändern", "Ändern" in zeile(1))
    pruefe("Fach 3 neu", "Neu" in zeile(3))
    pruefe("Fach 4 belegt mit Taster", "Fach belegt" in zeile(4) and "MESSTASTER" in zeile(4))
    pruefe("T9 ohne Fach 9 bleibt ohne Fach", "Kein Fach" in zeile(9))
    pg.screenshot(path=os.path.join(tmp, "wz508.png"), full_page=True)
    # seit 1.503.0 Magazin und Fächerliste auch im Reiter, ohne Marken
    pruefe("Magazin im Reiter", pg.locator("#mag5").count() == 1 and pg.locator("[data-mag-fach]").count() == 5)
    pruefe("Fächerliste im Reiter", pg.locator("[data-mag-zeile]").count() == 5)
    pruefe("Keine Marken im Reiter", pg.locator("[data-wz5-marke]").count() == 0 and "Marke wählen" not in pg.text_content("#mag5"))
    with pg.expect_download() as dl:
        pg.click("#wz5-laden")
    neu = open(dl.value.path(), "rb").read().decode("ascii")
    zeilen = neu.split("\r\n")
    pruefe("Umlaut ersetzt, neuer Name", "N3 D1 (Kopierfraeser R0.5)" in zeilen)
    i3 = zeilen.index("N3 D1 (Kopierfraeser R0.5)")
    pruefe("Neues Werkzeug: Typ 130, Zustand 6", zeilen[i3 + 2] == "T1 E6 F1 P0 R0 Q130")
    pruefe("Neues Werkzeug: S max aus CAM, Zähne 2", zeilen[i3 + 4].startswith("A-2 S25000 T2 I180.0000"))
    pruefe("Neues Werkzeug: Länge aus CAM, Radius 0.5", zeilen[i3 + 7] == "A1 X80.0000 U0.0000 S0.0000 R0.5000")
    pruefe("Bohrer: Winkel aus CAM, Länge bleibt", "A-2 S30000 T2 I140.0000 J0.0000 K0.0000 F0 Q0 R0 B0.0" in zeilen and "A1 X77.0639 U0.0100 S0.0000 R0.9000" in zeilen)
    pruefe("Fräser D2: gemessener Radius 0.98 bleibt", "A1 X73.8268 U0.0100 S0.0000 R0.9800" in zeilen)
    pruefe("Bekannte Werkzeuge nicht neu messen", zeilen.count("T1 E0 F1 P0 R0 Q160") == 1)
    pruefe("Taster unverändert", "N4 D1 (MESSTASTER)" in zeilen and "A1 X125.1323 U0.0100 S0.0000 R1.0000" in zeilen)
    pruefe("Leeres Fach 5 bleibt", zeilen[zeilen.index("G5") - 1] == "N0")
    pruefe("Beginnt und endet mit %", zeilen[0] == "%" and zeilen[-2] == "%")
    # Fach 3 abwählen → bleibt leer
    pg.uncheck("[data-wz5='3'] input[type=checkbox] >> nth=0")
    with pg.expect_download() as dl:
        pg.click("#wz5-laden")
    z2 = open(dl.value.path(), "rb").read().decode("ascii").split("\r\n")
    pruefe("Abgewählt bleibt leer", z2[z2.index("G3") - 1] == "N0")
    pg.evaluate("document.body.classList.add('dunkel')")
    pg.screenshot(path=os.path.join(tmp, "wz508-dunkel.png"), full_page=True)
    br.close()
print("Bilder:", tmp)
print("Fehler:", ", ".join(fehler) if fehler else "keine")
