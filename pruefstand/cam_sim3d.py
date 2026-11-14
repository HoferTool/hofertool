# HOFERCAM 3D-Simulation (seit 1.547.0): Drehen mit Platte, Bohren von
# vorne mit 0.5 mm vor „Anfahren Z“, Bohren an der Rückseite in Kanal 2,
# Bearbeitung ohne Werkzeug nur als Bahn (rot in der Liste).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
S = "/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/"
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
    # Drehen: plan auf Ø12, dann Ø12 bis Z8, wieder hoch
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X12.F0.1\nG1Z8.\nG1X17.5")
    pg.click("[data-camwz-auf='0']"); pg.click("[data-camwz-form='C']")
    pg.fill("[data-camwz='r']", "0.4"); pg.click("[data-camwz-sl='ur']")
    pg.click(".cam-wz [title='Schliessen']")
    # Bohren Front Hauptspindel: Ø5 bis Z15, Teil bei 5.5 → 9.5 tief
    pg.click("#cam-neu-front")
    pg.fill("[data-block='1'] [data-camblock='code']", "G1Z15.F0.05")
    pg.click("[data-camwz-auf='1']"); pg.click("[data-camwz-form='bohrer']")
    pg.fill("[data-camwz='d']", "5"); pg.fill("[data-camwz='winkel']", "118"); pg.fill("[data-camwz='laenge']", "20")
    pg.click(".cam-wz [title='Schliessen']")
    # Bohren an der Gegenspindel (Kanal 2, Rückseite): Ø3 bis Z9 → 3.5 tief
    pg.click("#cam-neu-front")
    pg.select_option("[data-block='2'] [data-camblock='spindel']", "gegen")
    pg.fill("[data-block='2'] [data-camblock='code']", "G1Z9.F0.05")
    pg.click("[data-camwz-auf='2']"); pg.click("[data-camwz-form='bohrer']")
    pg.fill("[data-camwz='d']", "3"); pg.fill("[data-camwz='winkel']", "118"); pg.fill("[data-camwz='laenge']", "10")
    pg.click(".cam-wz [title='Schliessen']")
    # Ohne Werkzeug
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='3'] [data-camblock='code']", "G1X10.F0.1\nG1Z3.")
    pg.click("#cam-sim-auf")
    pg.wait_for_selector("#cam-sim-bild")
    pg.wait_for_timeout(300)
    def wert(kanal, feld, z):
        return pg.evaluate("""([k, f, z]) => { const c = document.querySelector('#cam-sim-bild'); const st = c.__stand[k];
          if (!st) return null; return st[f][Math.round((z - st.z0) / 0.02)]; }""", [kanal, feld, z])
    pruefe("Aussen bei Z4 = R6 (%s)" % wert("k1", "aussen", 4), abs(wert("k1", "aussen", 4) - 6) < 0.03)
    pruefe("Aussen bei Z12 = R8.5 (%s)" % wert("k1", "aussen", 12), abs(wert("k1", "aussen", 12) - 8.5) < 0.03)
    pruefe("Ohne Werkzeug nichts abgetragen bei Z1.5 (R %s)" % wert("k1", "aussen", 1.5), abs(wert("k1", "aussen", 1.5) - 6) < 0.03)
    pruefe("Bohrung R2.5 bei Z4 (%s)" % wert("k1", "innen", 4), abs(wert("k1", "innen", 4) - 2.5) < 0.03)
    pruefe("Bohrung endet vor Z9.5 (bei 9.6: %s)" % wert("k1", "innen", 9.6), wert("k1", "innen", 9.6) < 0.01)
    pruefe("Bohrerspitze bei Z9 schmaler (%s)" % wert("k1", "innen", 9), 0 < wert("k1", "innen", 9) < 2.5)
    # Kanal 2: z2 von der Rückseite, 3.5 tief, R1.5
    pruefe("K2 Bohrung R1.5 bei z2=1 (%s)" % wert("k2", "innen", 1), abs(wert("k2", "innen", 1) - 1.5) < 0.03)
    pruefe("K2 Bohrung endet vor 3.5 (bei 3.6: %s)" % wert("k2", "innen", 3.6), wert("k2", "innen", 3.6) < 0.01)
    pruefe("K2 Teil aussen hinten R8.5 (%s)" % wert("k2", "aussen", 1), abs(wert("k2", "aussen", 1) - 8.5) < 0.03)
    pruefe("Liste: ohne Werkzeug rot", pg.locator("[data-cam-sim-schritt='3'].cam-sim__schritt--fehlt").count() == 1)
    pruefe("Titel Fertigteil", "Fertigteil" in pg.text_content("#cam-sim-titel"))
    pg.locator("#cam-sim").screenshot(path=S + "sim_ende.png")
    # Zurück zum Rohteil, dann ans Ende des Drehens springen
    pg.click("#cam-sim-anfang")
    pruefe("Rohteil ganz", abs(wert("k1", "aussen", 4) - 8.5) < 0.01 and wert("k1", "innen", 4) == 0)
    pg.click("[data-cam-sim-schritt='0']")
    pruefe("Nach Drehen: gedreht, noch nicht gebohrt", abs(wert("k1", "aussen", 4) - 6) < 0.03 and wert("k1", "innen", 4) == 0)
    pruefe("Titel Kanal 1 mit Werkzeug", "Kanal 1" in pg.text_content("#cam-sim-titel") and "T100" in pg.text_content("#cam-sim-titel"))
    pruefe("Zeile beim Drehen ist ein Weg (%s)" % pg.text_content("#cam-sim-zeile"), "G" in pg.text_content("#cam-sim-zeile"))
    # mitten im Drehen: Platte sichtbar
    s0 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte[0]")
    pg.evaluate("n => { const r = document.querySelector('#cam-sim-regler'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, n); r.dispatchEvent(new Event('input', {bubbles: true})); }", s0["von"] + int(len(s0["punkte"]) * 0.55))
    pg.wait_for_timeout(200)
    pg.locator("#cam-sim").screenshot(path=S + "sim_dreh.png")
    pg.click("[data-cam-sim-schritt='1']")
    pg.locator("#cam-sim").screenshot(path=S + "sim_bohr.png")
    pg.click("#cam-sim-start"); pg.wait_for_timeout(600)
    pruefe("Abspielen läuft", int(pg.get_attribute("#cam-sim-bild", "data-cam-sim-n")) > 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
