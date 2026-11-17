# HOFERCAM 3D-Simulation mit Maschine (seit 1.580.0): Werkzeugträger von
# Kanal 1 (T100–T600 je 25 mm in Y, T3100–T3400, T3421–T3423, T1100–T1400)
# fährt mit dem Werkzeug in X und Y, Spindelstock steht im Teil fest hinter
# der Führungsbüchse, bei C dreht das Teil, die Maschine steht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
S = "/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/"
G87 = """G0Z6.
#100=4(ANZAHL)
#101=360/#100
#102=#100-1
WHILE[#102GE#0]DO1
G1X19.F0.5
G87X8.F0.02
G80
G1X19.F0.5
G1H#101F1.
#102=#102-1
END1"""
def werkzeug(pg, i, form, d, winkel=None, laenge="12"):
    pg.click(f"[data-camwz-auf='{i}']"); pg.click(f"[data-camwz-form='{form}']")
    pg.fill("[data-camwz='d']", d)
    if winkel: pg.fill("[data-camwz='winkel']", winkel)
    pg.fill("[data-camwz='laenge']", laenge)
    pg.click(".cam-wz [title='Schliessen']")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    for n, x in [("A", "17"), ("W", "15"), ("B", "1.5"), ("X", "-0.8"), ("S", "3000"), ("Z", "160"), ("F", "0.03")]:
        pg.fill(f"[data-cam='{n}']", x)
    # 0: T100 drehen auf Ø12 bis Z8
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X12.F0.1\nG1Z8.\nG1X17.5")
    pg.click("[data-camwz-auf='0']"); pg.click("[data-camwz-form='C']")
    pg.fill("[data-camwz='r']", "0.4"); pg.click("[data-camwz-sl='ur']")
    pg.click(".cam-wz [title='Schliessen']")
    # 1: T3100 Querbohren über C
    pg.click("#cam-neu-seite")
    pg.fill("[data-block='1'] [data-camblock='code']", G87)
    werkzeug(pg, 1, "bohrer", "2", "118")
    # 2: T3421 Nut an der Stirn mit Y
    if pg.locator("#cam-neu-quer").count() == 0: pg.select_option("[data-cam='t34']", "3421")
    pg.click("#cam-neu-quer")
    pg.fill("[data-block='2'] [data-camblock='code']", "G0X10.Y0.\nG1Z6.5F0.1\nG1Y3.F0.05\nG0Z0.")
    werkzeug(pg, 2, "schaft", "3")
    # 3: T1100 Bohren, Vorposition Z5.0 (Patrick: Spitze 0.5 mm vor dem Teil bei Z5)
    pg.click("#cam-neu-front")
    pg.fill("[data-block='3'] [data-camblock='anZ']", "5.0")
    pg.fill("[data-block='3'] [data-camblock='code']", "G1Z8.F0.05\nG0Z0.")
    werkzeug(pg, 3, "bohrer", "3", "118")
    plaetze = pg.evaluate("() => [...document.querySelectorAll('[data-block]')].map((b) => b.textContent.match(/T\\d+/)?.[0])")
    print("Plätze", plaetze)
    pg.click("#cam-sim-auf")
    pg.wait_for_selector("#cam-sim-bild"); pg.wait_for_timeout(400)
    T = lambda: pg.evaluate("() => document.querySelector('#cam-sim-bild').__traeger")
    pruefe("Schalter Maschine an", pg.is_checked("#cam-sim-maschine"))
    pruefe("Spindelstock gezeichnet", pg.evaluate("() => !!document.querySelector('#cam-sim-bild').__kopf"))
    pg.click("[data-cam-sim-schritt='0']"); pg.wait_for_timeout(200)
    t = T(); print("T100", t)
    pruefe("T100: Träger in Y bei 0 und X wie Werkzeug (G0X30. = R15)", t and abs(t["y"]) < 1e-6 and abs(t["x"] - 15) < 0.01 and t["aktiv"] == 100)
    # Seit 1.586.0: nur benutzte Drehhalter (hier T100) haben Schaft und Platte
    hy = pg.evaluate("() => document.querySelector('#cam-sim-bild').__quader.filter((q) => q.art === 'halter' && q.z1 <= document.querySelector('#cam-sim-bild').__traeger.z + 0.01).map((q) => Math.round((q.y0 + q.y1) / 2 - document.querySelector('#cam-sim-bild').__traeger.y))")
    print("Drehhalter bei y", hy)
    pruefe("Nur T100 hat Schaft (T200–T600 nicht im Programm)", hy == [0])
    k0 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__kopf.z")
    pg.locator("#cam-sim").screenshot(path=S + "maschine_t100.png")
    # mitten im Querbohren
    s1 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte.find((x) => x.platz === 3100)")
    pg.evaluate("(n) => { const r = document.querySelector('#cam-sim-regler'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, n); r.dispatchEvent(new Event('input', { bubbles: true })); }", s1["von"] + int((s1["bis"] - s1["von"]) * 0.55))
    pg.wait_for_timeout(300)
    t = T(); roll = pg.evaluate("() => document.querySelector('#cam-sim-bild').__roll"); print("T3100", t, roll)
    pruefe("T3100: Träger um 161.5 in −Y verschoben", t and abs(t["y"] + 161.5) < 1e-6 and t["aktiv"] == 3100)
    pruefe("Spindelstock fährt mit dem Material (im Teil fest)", abs(pg.evaluate("() => document.querySelector('#cam-sim-bild').__kopf.z") - k0) < 1e-9)
    pg.locator("#cam-sim").screenshot(path=S + "maschine_t3100.png")
    # Seit 1.593.0: auch ohne Maschine dreht das Teil in C, nicht das Werkzeug
    pg.click("#cam-sim-maschine"); pg.wait_for_timeout(300)
    roll2 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__roll"); print("ohne Maschine roll", roll2)
    pruefe("Ohne Maschine dreht das Teil gleich (roll)", roll2 is not None and abs(roll2 - roll) < 1e-9 and abs(roll) > 1e-3)
    pg.locator("#cam-sim").screenshot(path=S + "ohne_maschine_t3100.png")
    pg.click("#cam-sim-maschine"); pg.wait_for_timeout(300)
    pg.click("[data-cam-sim-schritt='2']"); pg.wait_for_timeout(300)
    t = T(); print("T3421", t)
    pruefe("T3421: Träger um 254.5 in −Y, Y3 gefahren", t and abs(t["y"] - (3 - 254.5)) < 1e-6 and t["aktiv"] == 3421)
    bu = pg.evaluate("() => document.querySelector('#cam-sim-bild').__buechse")
    pruefe("Büchse 2 mm hinter der Drehebene", abs(bu["z"] - (t["z"] + 2)) < 1e-9)
    pg.locator("#cam-sim").screenshot(path=S + "maschine_t3421.png")
    s3 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte.find((x) => x.platz === 1100)")
    pg.evaluate("(n) => { const r = document.querySelector('#cam-sim-regler'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, n); r.dispatchEvent(new Event('input', { bubbles: true })); }", s3["von"] + 1)
    pg.wait_for_timeout(300)
    t = T(); bu = pg.evaluate("() => document.querySelector('#cam-sim-bild').__buechse"); print("T1100", t, bu, s3.get("dzVorne"))
    pruefe("T1100: Spitze 5.5 mm vor der Drehebene (Z5.0 + 0.5)", s3.get("dzVorne") is not None and abs(s3["dzVorne"] + 5.5) < 1e-9)
    p0 = s3["punkte"][0]["z"]
    pruefe("T1100: Drehebene im Teil bei Z5 (Stirn 5 mm draussen)", t and abs(t["z"] - (p0 + 5.5)) < 0.3 and abs(bu["z"] - (t["z"] + 2)) < 1e-9)
    pg.locator("#cam-sim").screenshot(path=S + "maschine_t1100.png")
    # Seit 1.587.0: versetzter Abstecher, Versatz 12, B 1.5 → Platte 10.5 vor der Drehebene
    pg.click("#cam-sim [title='Schliessen']")
    pg.wait_for_timeout(300)
    pg.select_option("[data-cam='abArt']", "versetzt"); pg.fill("[data-cam='abVersatz']", "12")
    k1 = pg.evaluate("() => [...document.querySelectorAll('[data-kanal=\"1\"]')].map((e) => e.textContent).join('\\n')")
    pruefe("Kopf: G0X[#531+4.]Z-10.5", "G0X[#531+4.]Z-10.5" in k1)
    pruefe("Abstechen im Ende unverändert", "G00G99X#510Z[#530+#528]T1" in k1)
    pg.click("#cam-sim-auf"); pg.wait_for_selector("#cam-sim-bild"); pg.wait_for_timeout(400)
    pg.click("[data-cam-sim-schritt='ab']"); pg.wait_for_timeout(300)
    t = T(); bu = pg.evaluate("() => document.querySelector('#cam-sim-bild').__buechse")
    sa = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte.find((x) => x.modus === 'abstech')")
    pa = sa["punkte"][-1]["z"]
    print("versetzt", t, bu, pa)
    pruefe("Versetzt: Drehebene 10.5 hinter der Platte, Büchse 2 dahinter", t and abs(t["z"] - (pa + 10.5)) < 1e-6 and abs(bu["z"] - (t["z"] + 2)) < 1e-6)
    pg.locator("#cam-sim").screenshot(path=S + "abstecher_versetzt.png")
    pg.click("[data-cam-sim-schritt='0']"); pg.wait_for_timeout(300)
    pg.locator("#cam-sim").screenshot(path=S + "abstecher_versetzt_t100.png")
    bu = pg.evaluate("() => document.querySelector('#cam-sim-bild').__buechse")
    pg.click("#cam-sim-maschine"); pg.wait_for_timeout(200)
    bu2 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__buechse")
    print("ohne", bu2); pruefe("Ohne Maschine Büchse gleich", bu2 and abs(bu2["z"] - bu["z"]) < 0.3)  # beim Abstechen
    pruefe("Ohne Maschine kein Träger", T() is None)
    pg.click("#cam-sim-maschine")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
