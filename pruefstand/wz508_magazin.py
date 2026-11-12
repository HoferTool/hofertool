# Pad Mode → 508 Werkzeuge (seit 1.500.0): rundes Magazin mit Ziehen, mehrere Werkzeuge auf einem Foto
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
      + fach(4, "MESSTASTER", 900, "125.1323", "1.0000", s=300) + sum([["N0", f"G{g}"] for g in range(5, 49)], []) + ["%"]
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
    for breite, hoehe, name in [(1180, 820, "ipad"), (390, 844, "handy")]:
        ctx = br.new_context(viewport={"width": breite, "height": hoehe}, accept_downloads=True, has_touch=(name == "handy"))
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt")
        pg.evaluate("""TEST.daten.wz508_werkzeuge = [{ marke: '111111', name: 'FRAESER VHM D2.0', ort: 'maschine', fach: 2, nr: 2 }]""")
        pg.evaluate("document.getElementById('pad-knopf').click()")
        pg.wait_for_selector("#pad [data-padwo='wz508']"); pg.click("#pad [data-padwo='wz508']")
        pg.wait_for_selector("#pad-wz5")
        if name == "ipad":
            # Mehrere Werkzeuge auf einem Foto
            pg.set_input_files("#wz5p-foto", pf)
            pg.fill("#wz5p-marke", "500001"); pg.fill("#wz5p-name", "Fräser D6")
            pg.click("#wz5p-mehr"); pg.click("#wz5p-mehr")
            m = pg.locator("#pad-wz5 .pad-wz5__marke"); n = pg.locator("#pad-wz5 .pad-wz5__name")
            m.nth(1).fill("500002"); n.nth(1).fill("Bohrer D3")
            m.nth(2).fill("500001")
            pruefe("Doppelte Marke sperrt Speichern", pg.is_disabled("#wz5p-speichern"))
            m.nth(2).fill("500003")
            pruefe("Knopf nennt 3 Werkzeuge", "3 Werkzeuge" in pg.text_content("#wz5p-speichern"))
            pg.screenshot(path=os.path.join(tmp, "mehrere.png"), full_page=True)
            pg.click("#wz5p-speichern"); pg.wait_for_selector("[data-wz5p-karte='500003']")
            d = {w["marke"]: w for w in pg.evaluate("TEST.daten.wz508_werkzeuge")}
            urls = {d[k].get("foto_url") for k in ["500001", "500002", "500003"]}
            pruefe("Drei Marken, ein Foto", len(urls) == 1 and None not in urls and d["500002"]["name"] == "Bohrer D3")
            pruefe("Foto nur einmal hochgeladen", pg.evaluate("TEST.protokoll.filter(x => x.art === 'upload' && x.pfad.startsWith('wz508/')).length") == 1)
            pruefe("Felder wieder leer, eine Zeile", pg.locator("#pad-wz5 .pad-wz5__marke").count() == 1)
        pg.click("[data-wz5p-reiter='bestuecken']"); pg.wait_for_selector("#wz5")
        pg.set_input_files("#wz5-dat", pd); pg.set_input_files("#wz5-csv", pc)
        pg.wait_for_selector("#mag5")
        pruefe(name + ": zwei Ebenen mit je 24", pg.locator("[data-mag-ebene='1'] [data-mag-fach]").count() == 24
               and pg.locator("[data-mag-ebene='2'] [data-mag-fach]").count() == 24)
        pruefe(name + ": Taster geschützt", "mag5-platz--schutz" in pg.get_attribute("[data-mag-fach='4']", "class"))
        pruefe(name + ": T2 mit Marke in Fach 2", "mag5-platz--marke" in pg.get_attribute("[data-mag-fach='2']", "class"))
        def ziehen(von, nach):
            a = pg.locator(von).bounding_box(); b = pg.locator(nach).bounding_box()
            if name == "handy" and von.startswith("[data-mag-wz"):
                # Am Handy: Werkzeug antippen, dann den Platz antippen
                pg.tap(von); pg.wait_for_timeout(80)
                pg.locator(nach).scroll_into_view_if_needed(); pg.tap(nach)
            elif name == "handy":
                # Finger: Playwright hat kein Touch-Ziehen, Pointer-Ereignisse mit pointerType touch nachgestellt
                pg.evaluate("""([s, x0, y0, x1, y1]) => { const el = document.querySelector(s);
                  const ev = (t, x, y, ziel) => (ziel || el).dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true }));
                  ev('pointerdown', x0, y0); ev('pointermove', x0 + 10, y0 + 10); ev('pointermove', x1, y1); ev('pointerup', x1, y1); }""",
                  [von, a["x"] + a["width"] / 2, a["y"] + a["height"] / 2, b["x"] + b["width"] / 2, b["y"] + b["height"] / 2])
            else:
                pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2); pg.mouse.down()
                pg.mouse.move(a["x"] + 20, a["y"] + 20, steps=3)
                pg.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=8); pg.mouse.up()
            pg.wait_for_timeout(150)
        pg.evaluate("document.getElementById('mag5').scrollIntoView()")
        0 and print("BOX", pg.locator("[data-mag-wz='9']").bounding_box(), pg.locator("[data-mag-fach='30']").bounding_box())
        ziehen("[data-mag-wz='9']", "[data-mag-fach='30']")
        0 and print("NACH", pg.input_value("[data-wz5-fach='9']"), pg.get_attribute("[data-mag-fach='30']", "class"))
        pruefe(name + ": T9 auf Fach 30 gezogen", pg.input_value("[data-wz5-fach='9']") == "30"
               and "mag5-platz--cam" in pg.get_attribute("[data-mag-fach='30']", "class"))
        ziehen("[data-mag-wz='4']", "[data-mag-fach='4']")
        pruefe(name + ": auf Taster geht nicht", pg.input_value("[data-wz5-fach='4']") == "4" and "MESSTASTER" in pg.text_content("[data-mag-fach='4']") or "🔒" in pg.text_content("[data-mag-fach='4']"))
        ziehen("[data-mag-wz='1']", "[data-mag-fach='30']")
        pruefe(name + ": Tauschen T1 ↔ T9", pg.input_value("[data-wz5-fach='1']") == "30" and pg.input_value("[data-wz5-fach='9']") == "1")
        pg.screenshot(path=os.path.join(tmp, name + "-magazin.png"), full_page=True)
        if name == "ipad":
            pg.click("[data-mag-fach='30']"); pg.wait_for_selector("#wz5p-wahl")
            pruefe("Tipp auf Platz öffnet Markenwahl für T1", "T1" in pg.text_content("#wz5p-wahl h2"))
            pg.click("[data-wz5p-wahl='500002']")
            pruefe("Platz 30 grün mit Marke", "mag5-platz--marke" in pg.get_attribute("[data-mag-fach='30']", "class"))
            ziehen("[data-mag-fach='30']", "[data-mag-liste]")
            pruefe("Zurück in die Liste: T1 wieder Fach 1", pg.input_value("[data-wz5-fach='1']") == "1")
            pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(100)
            pg.screenshot(path=os.path.join(tmp, "ipad-magazin-dunkel.png"), full_page=True)
            pg.evaluate("document.body.classList.remove('dunkel')")
        breit = pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        pruefe(name + ": kein seitliches Rollen", not breit)
        ctx.close()
    br.close()
print("Bilder:", tmp)
print("Fehler:", ", ".join(fehler) if fehler else "keine")
