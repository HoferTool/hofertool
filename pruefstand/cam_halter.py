# HOFERCAM (seit 1.696.0): Halter 12 × 12 zu Dreh-, Einstech- und
# Ausdrehwerkzeugen in der Simulation, Platte sitzt wie im Katalog im Halter.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
S = "/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/"
def wz(pg, i, form, sl, r=None, b=None):
    pg.click(f"[data-camwz-auf='{i}']"); pg.click(f"[data-camwz-form='{form}']")
    if r: pg.fill("[data-camwz='r']", r)
    if b: pg.fill("[data-camwz='breite']", b)
    pg.click(f"[data-camwz-sl='{sl}']")
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
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='0'] [data-camblock='code']", "G1X12.F0.1\nG1Z8.\nG1X17.5")
    wz(pg, 0, "C", "ur", r="0.4")
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='1'] [data-camblock='code']", "G0Z5.\nG1X10.F0.02\nG1X12.5")
    wz(pg, 1, "E", "ur", b="1.5")
    pg.click("#cam-neu-dreh")
    pg.fill("[data-block='2'] [data-camblock='code']", "G0X5.Z-0.5\nG1Z6.F0.05\nG1X4.\nG0Z-1.")
    wz(pg, 2, "D", "or", r="0.2")
    pg.click("#cam-sim-auf")
    pg.wait_for_selector("#cam-sim-bild"); pg.wait_for_timeout(400)
    if not pg.is_checked("#cam-sim-maschine"): pg.click("#cam-sim-maschine")
    Q = lambda: pg.evaluate("() => (document.querySelector('#cam-sim-bild').__quader || []).length")
    for i, name in enumerate(["aussen", "einstich", "innen"]):
        pg.click(f"[data-cam-sim-schritt='{i}']"); pg.wait_for_timeout(300)
        pg.locator("#cam-sim").screenshot(path=S + f"halter_{name}_maschine.png")
    pg.click("#cam-sim-maschine"); pg.wait_for_timeout(200)
    for i, name in enumerate(["aussen", "einstich", "innen"]):
        pg.click(f"[data-cam-sim-schritt='{i}']"); pg.wait_for_timeout(300)
        pg.locator("#cam-sim").screenshot(path=S + f"halter_{name}.png")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
