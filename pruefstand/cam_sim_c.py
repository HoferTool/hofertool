# HOFERCAM 3D-Simulation Schritt 3 (seit 1.548.0): Querbohren mit G87 in
# einer Schleife über C (T3100), Nut an der Stirn mit Y (T3421 an der
# Hauptspindel), Bohrung an der Gegenspindel neben der Mitte (T3421 mit
# Position X), Darstellung mit Strahlen. Vorne fährt das Material in Z.
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
    # 0: Querbohren 4 × Ø2 bei Z6 bis X8 (Radius 4)
    pg.click("#cam-neu-seite")
    pg.fill("[data-block='0'] [data-camblock='code']", G87)
    werkzeug(pg, 0, "bohrer", "2", "118")
    # 1: Nut an der Stirn mit Y, Fräser Ø3, 1 tief bei X10 von Y0 bis Y3
    pg.click("#cam-neu-quer")
    pg.fill("[data-block='1'] [data-camblock='code']", "G0X10.Y0.\nG1Z6.5F0.1\nG1Y3.F0.05\nG0Z0.")
    werkzeug(pg, 1, "schaft", "3")
    # 2: Gegenspindel, Bohrung neben der Mitte bei X8, 1.5 tief, Fräser Ø3
    pg.click("#cam-neu-quer")
    pg.select_option("[data-block='2'] [data-camblock='spindel']", "gegen")
    pg.fill("[data-block='2'] [data-camblock='X']", "8.")
    pg.fill("[data-block='2'] [data-camblock='code']", "G1Z3.F0.05")
    werkzeug(pg, 2, "schaft", "3")
    pg.click("#cam-sim-auf")
    try: pg.wait_for_selector("#cam-sim-bild", timeout=20000)
    except Exception: print(fehler); raise
    pg.wait_for_timeout(500)
    def weg(z, u, w):
        return pg.evaluate("""([z, u, w]) => { const v = document.querySelector('#cam-sim-bild').__stand.vox; if (!v) return null;
          const iz = Math.floor((z - v.z0) / v.h), iu = Math.floor((u + v.R) / v.h), iw = Math.floor((w + v.R) / v.h);
          return v.feld[(iz * v.nu + iu) * v.nu + iw]; }""", [z, u, w])
    sim = pg.evaluate("() => { const s = document.querySelector('#cam-sim-bild').__sim; return s.schritte.map((x) => ({ art: x.art, status: x.status, modus: x.modus, n: x.punkte.length, kanal: x.kanal })); }")
    print(sim)
    pruefe("Alle drei mit Material (modus c)", all(x["modus"] == "c" and not x["status"] for x in sim))
    # C0 bei +X, die vier Bohrungen bei 0°, 90°, 180°, 270°
    pruefe("Bohrung oben (+X) bei Z6", weg(6, 6, 0) == 1)
    pruefe("Bohrung unten (−X) bei Z6", weg(6, -6, 0) == 1)
    pruefe("Bohrung bei +Y und −Y", weg(6, 0, 6) == 1 and weg(6, 0, -6) == 1)
    pruefe("Zwischen den Bohrungen Material (45°)", weg(6, 4.6, 4.6) == 0)
    pruefe("Bohrung endet bei Radius 4 (bei 3.4 Material)", weg(6, 3.4, 0) == 0)
    pruefe("Neben der Bohrung in Z Material (Z7.4)", weg(7.4, 6, 0) == 0)
    pruefe("Nut an der Stirn bei Y1.5", weg(0.5, 5, 1.5) == 1)
    pruefe("Nut nicht bei Y−2.2", weg(0.5, 5, -2.2) == 0)
    pruefe("Nut 1 tief (bei Z1.4 Material)", weg(1.4, 5, 1.5) == 0)
    pruefe("Rückseite: Bohrung bei X+4, 1.5 tief (z 14)", weg(14, 4, 0) == 1)
    pruefe("Rückseite: tiefer Material (z 13.3)", weg(13.3, 4, 0) == 0)
    pruefe("Rückseite: nicht bei −X", weg(14, -4, 0) == 0)
    pruefe("Bild mit Strahlen gezeichnet", pg.evaluate("() => document.querySelector('#cam-sim-bild').__strahl"))
    pg.locator("#cam-sim").screenshot(path=S + "simc_ende.png")
    # Kanal 1 ansehen: Ende des Querbohrens und der Nut
    pg.click("[data-cam-sim-schritt='1']"); pg.wait_for_timeout(300)
    pruefe("Titel Kanal 1", "Kanal 1" in pg.text_content("#cam-sim-titel"))
    pg.locator("#cam-sim").screenshot(path=S + "simc_k1.png")
    pg.click("#cam-sim-anfang")
    pruefe("Rohteil: nichts weg", weg(6, 6, 0) == 0)
    pg.click("[data-cam-sim-schritt='0']")
    pruefe("Nach Querbohren: Bohrung da, Nut noch nicht", weg(6, 6, 0) == 1 and weg(0.5, 5, 1.5) == 0)
    s0 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte[0]")
    pg.evaluate("n => { const r = document.querySelector('#cam-sim-regler'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, n); r.dispatchEvent(new Event('input', {bubbles: true})); }", s0["von"] + int(len(s0["punkte"]) * 0.6))
    pg.wait_for_timeout(300)
    pg.locator("#cam-sim").screenshot(path=S + "simc_mitte.png")
    t0 = time.time(); pg.click("#cam-sim-start"); pg.wait_for_timeout(1500)
    nA = int(pg.get_attribute("#cam-sim-bild", "data-cam-sim-n"))
    print("Abspielen: Punkt", nA, "nach 1.5 s")
    pruefe("Abspielen läuft", nA > 0)
    pg.click("#cam-sim-start")
    t0 = time.time(); pg.click("#cam-sim-ende"); pg.wait_for_timeout(50)
    pg.evaluate("() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")
    print("Fertigteil gezeichnet in %.2f s" % (time.time() - t0))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
