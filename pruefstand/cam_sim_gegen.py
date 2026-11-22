# HOFERCAM 3D-Simulation, Gegenspindel (seit 1.583.0): greift bei der
# Übergabe über das Teil, fährt in Kanal 2 mit dem Teil, die Einheit
# T2100–T2400 steht, ihr Gehäuse sitzt hinter der Spitze des Werkzeugs.
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
    for n, x in [("A", "17"), ("W", "15"), ("B", "1.5"), ("X", "-0.8"), ("S", "3000"), ("Z", "160"), ("F", "0.03"), ("ueber", "8")]:
        pg.fill(f"[data-cam='{n}']", x)
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X12.F0.1\nG1Z8.\nG1X17.5")
    pg.click("[data-camwz-auf='0']"); pg.click("[data-camwz-form='C']")
    pg.fill("[data-camwz='r']", "0.4"); pg.click("[data-camwz-sl='ur']")
    pg.click(".cam-wz [title='Schliessen']")
    pg.click("#cam-neu-k2a")
    pg.fill("[data-block='1'] [data-camblock='code']", "G0X8.\nG0Z1.\nG1Z-3.F50.\nG0Z1.")
    werkzeug(pg, 1, "bohrer", "3", "118")
    pg.click("#cam-sim-auf")
    pg.wait_for_selector("#cam-sim-bild"); pg.wait_for_timeout(400); pg.click("#cam-sim-ende"); pg.wait_for_timeout(400)  # seit 1.598.0 öffnet sie beim Rohteil
    E = lambda a: pg.evaluate("() => document.querySelector('#cam-sim-bild').__" + a)
    namen = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte.map((x) => x.titel + ' K' + x.kanal)")
    print(namen)
    pg.click("[data-cam-sim-schritt='0']"); pg.wait_for_timeout(200)
    # seit 1.691.0 wie bei der SW-20: Gegenspindel immer sichtbar, vor der Übergabe in der Grundstellung
    g0 = E("gegen")
    pruefe("Vor der Übergabe Gegenspindel in der Grundstellung", g0 and g0["x"] == 0 and g0["z"] < -150)
    # Seit 1.586.0: Vorposition (G0Z-10.) und Überfahren (G1Z8.) vor dem Abstechen
    ab = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte.find((x) => x.modus === 'abstech')")
    def gehe(k):
        pg.evaluate("(n) => { const r = document.querySelector('#cam-sim-regler'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, n); r.dispatchEvent(new Event('input', { bubbles: true })); }", ab["von"] + k + 1)
        pg.wait_for_timeout(250)
    pk = ab["punkte"]
    kv = max(i for i, q in enumerate(pk) if q["nr"] == 1)
    gehe(kv); g = E("gegen"); print("Vorposition", g)
    pruefe("Vorposition: Gegenspindel 10 mm vor der Stirn", g and abs(g["z"] + 10) < 1e-6)
    pg.locator("#cam-sim").screenshot(path=S + "uebergabe_vorposition.png")
    ku = max(i for i, q in enumerate(pk) if q["nr"] == 2)
    gehe(ku); g = E("gegen"); print("Überfahren", g)
    pruefe("Überfahren: Gegenspindel 8 mm über dem Teil", g and abs(g["z"] - 8) < 1e-6)
    pg.locator("#cam-sim").screenshot(path=S + "uebergabe_ueber.png")
    pruefe("Beim Überfahren noch nicht abgestochen", all(not q["vor"] for q in pk[:ku + 1]))
    pg.click("[data-cam-sim-schritt='ab']"); pg.wait_for_timeout(300)
    g = E("gegen"); print("Übergabe", g)
    pruefe("Übergabe: Gegenspindel greift vorne über das Teil", g and g["dir"] == -1)
    pg.locator("#cam-sim").screenshot(path=S + "gegen_uebergabe.png")
    # seit 1.691.0: in Kanal 2 steht das Teil in der Gegenspindel (frame), die
    # 4-Spindel-Rückseiteneinheit steht fest, das Teil fährt zum Werkzeug
    s1 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte.find((x) => x.kanal === 2)")
    k = max(i for i, q in enumerate(s1["punkte"]) if q.get("vor"))
    pg.evaluate("(n) => { const r = document.querySelector('#cam-sim-regler'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, n); r.dispatchEvent(new Event('input', { bubbles: true })); }", s1["von"] + k + 1)
    pg.wait_for_timeout(300)
    g = E("gegen"); fr = E("frame"); k2 = E("k2"); print("Kanal 2", g, fr, k2)
    pruefe("Kanal 2: Teil in der Gegenspindel (Rahmen gedreht)", fr and fr["s"] == -1)
    pruefe("Kanal 2: Einheit am angetriebenen Werkzeug", k2 and 2100 <= k2["aktiv"] <= 2400)
    # seit 1.691.1 liegen die Werkzeuge waagrecht in Y, X2 fährt in Welt-Y
    PL = {2100: (0, -78), 2200: (0, -114), 2300: (0, -147), 2400: (0, -180)}
    lx, ly = PL.get(k2["aktiv"] // 100 * 100, PL[2100]) if k2 else (0, 0)
    pruefe("Kanal 2: Werkzeug bei X8 steht 4 mm neben der Achse", fr and abs(((fr["xf"] - lx) ** 2 + (fr["yf"] - ly) ** 2) ** 0.5 - 4) < 0.01)
    pruefe("Kanal 2: Gegenspindel fährt waagrecht (nur in Y)", fr and abs(fr["xf"] - lx) < 0.01)
    pruefe("Kanal 2: Gegenspindel hält das Teil", g and abs(g["x"] - fr["xf"]) < 1e-6)
    pg.locator("#cam-sim").screenshot(path=S + "gegen_k2.png")
    pg.click("#cam-sim-ende"); pg.wait_for_timeout(300)
    pruefe("Am Ende liegt das Teil in der Schale", E("ablage") == "teil")
    pruefe("Simultan wird angeboten", pg.locator("#cam-sim-simultan").count() == 1)
    pg.click("#cam-sim-maschine"); pg.wait_for_timeout(200)
    pruefe("Ohne Maschine keine Gegenspindel", E("gegen") is None)
    pg.click("#cam-sim-maschine")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
