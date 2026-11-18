# HOFERCAM STEP-Datei je Werkzeug (seit 1.622.0): hochladen im Fenster
# Werkzeug, Vorschau, in der Simulation ersetzt sie den gerechneten Körper
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
S = "/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/"
os.makedirs(S, exist_ok=True)
DATEI = S + "halter.step"
open(DATEI, "w").write("ISO-10303-21; nur Platzhalter")
# Quader als Netz wie aus occt: x -12..0, y 0..40, z -3..0
QUADER = """(x0,x1,y0,y1,z0,z1) => { const p = [], ix = [];
  const ecken = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  ecken.forEach(e => p.push(...e));
  [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]].forEach(t => ix.push(...t));
  return { attributes: { position: { array: p } }, index: { array: ix } }; }"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("q => { const Q = eval(q); TEST.stepGelesen = []; TEST.stepLesen = (url) => { TEST.stepGelesen.push(url);"
                " return url.includes('bohrer') ? { success: true, meshes: [Q(-2.5, 2.5, -2.5, 2.5, 0, 30)] }"
                " : { success: true, meshes: [Q(-12, 0, 0, 40, -3, 0)] }; }; }", QUADER)
    pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    for n, x in [("A", "17"), ("W", "15"), ("B", "1.5"), ("X", "-0.8"), ("S", "3000"), ("Z", "160"), ("F", "0.03")]:
        pg.fill(f"[data-cam='{n}']", x)
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X12.F0.1\nG1Z8.\nG1X17.5")
    pg.click("[data-camwz-auf='0']"); pg.click("[data-camwz-form='C']")
    pg.fill("[data-camwz='r']", "0.4"); pg.click("[data-camwz-sl='ur']")
    pruefe("Knopf STEP hinterlegen da", pg.locator("[data-camwz-stepwahl]").count() == 1)
    pg.set_input_files("[data-camwz-stepdatei]", DATEI)
    pg.wait_for_selector("[data-camwz-stepbild]", timeout=8000)
    up = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'upload' && x.pfad.startsWith('hofercam/werkzeuge/')).length")
    pruefe("STEP in die Ablage hochgeladen (%s)" % up, up == 1)
    pruefe("Name steht da", "halter.step" in pg.text_content("[data-camwz-step]"))
    pg.click("[data-camwz-stepdreh='Z']")
    pg.fill("[data-camwz-step-v='dz']", "1")
    pg.locator("[data-camwz-step]").screenshot(path=S + "step_feld.png")
    pg.click(".cam-wz [title='Schliessen']")
    pruefe("Werkzeugtext nennt STEP", "STEP" in pg.text_content("[data-block='0']"))
    # Zurück auf wie gelesen für die Zählung
    pg.click("[data-camwz-auf='0']"); pg.click("[data-camwz-stepnull]"); pg.click(".cam-wz [title='Schliessen']")
    # Bohren mit STEP
    pg.click("#cam-neu-front")
    pg.fill("[data-block='1'] [data-camblock='code']", "G1Z15.F0.05")
    pg.click("[data-camwz-auf='1']"); pg.click("[data-camwz-form='bohrer']")
    pg.fill("[data-camwz='d']", "5"); pg.fill("[data-camwz='winkel']", "118"); pg.fill("[data-camwz='laenge']", "20")
    BOHR = S + "bohrer.step"; open(BOHR, "w").write("x")
    pg.set_input_files("[data-camwz-stepdatei]", BOHR)
    pg.wait_for_selector("[data-camwz-stepbild]", timeout=8000)
    pg.click(".cam-wz [title='Schliessen']")
    pg.click("#cam-sim-auf"); pg.wait_for_selector("#cam-sim-bild"); pg.wait_for_timeout(300)
    s0 = pg.evaluate("() => document.querySelector('#cam-sim-bild').__sim.schritte[0]")
    pg.evaluate("n => { const r = document.querySelector('#cam-sim-regler'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, n); r.dispatchEvent(new Event('input', {bubbles: true})); }", s0["von"] + int(len(s0["punkte"]) * 0.55))
    pg.wait_for_timeout(400)
    k = pg.evaluate("() => [document.querySelector('#cam-sim-bild').__koerper, document.querySelector('#cam-sim-bild').__step]")
    pruefe("Drehen: STEP-Körper statt gerechnet (%s)" % k, k[1] is True and k[0] == 12)
    pg.locator("#cam-sim").screenshot(path=S + "step_sim_dreh.png")
    pg.click("[data-cam-sim-schritt='1']"); pg.wait_for_timeout(400)
    k = pg.evaluate("() => [document.querySelector('#cam-sim-bild').__koerper, document.querySelector('#cam-sim-bild').__step]")
    pruefe("Bohren: STEP-Körper (%s)" % k, k[1] is True and k[0] == 12)
    pg.locator("#cam-sim").screenshot(path=S + "step_sim_bohr.png")
    pg.uncheck("#cam-sim-wz3d"); pg.wait_for_timeout(200)
    pruefe("3D-Werkzeug aus: keine Körper", pg.evaluate("() => document.querySelector('#cam-sim-bild').__koerper") == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
