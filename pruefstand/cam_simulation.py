# HOFERCAM (seit 1.543.0): Bearbeitungssimulation. Kanal 1 vorne, Kanal 2
# hinten an der Gegenspindel, am Schluss das Fertigteil.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ORDNER = "/tmp/claude-0/cam_simulation"; os.makedirs(ORDNER, exist_ok=True)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    for k, v in {"nr": "458", "A": "16", "W": "15.125", "S": "6000", "X": "-0.5", "Z": "30", "F": "0.03", "B": "1.5"}.items():
        if pg.locator(f"[data-cam='{k}']").count(): pg.fill(f"[data-cam='{k}']", v)
    pg.click("#cam-neu-dreh"); pg.click("#cam-neu-k2")
    ta = pg.locator(".cam-block textarea")
    ta.nth(0).fill("G1X12.F0.1\nG1Z8.\nG1X16.2")
    ta.nth(ta.count() - 1).fill("G1X8.F0.05\nG1Z2.")
    pg.wait_for_timeout(300)
    pruefe("Knopf Simulation da", pg.locator("#cam-sim-auf").count() == 1)
    pg.click("#cam-sim-auf")
    pg.wait_for_selector(".cam-sim canvas, canvas[data-cam-sim-n]")
    pruefe("Leinwand da", pg.locator("canvas[data-cam-sim-n]").count() >= 1)
    pg.screenshot(path=ORDNER + "/start.png")
    pg.click("#cam-sim-wz"); pg.wait_for_timeout(200)
    n1 = int(pg.get_attribute("canvas[data-cam-sim-n]", "data-cam-sim-n"))
    pruefe("Nächstes Werkzeug springt", n1 > 0)
    pg.click("#cam-sim-start"); pg.wait_for_timeout(600); pg.click("#cam-sim-start")
    n2 = int(pg.get_attribute("canvas[data-cam-sim-n]", "data-cam-sim-n"))
    pruefe("Abspielen läuft", n2 > n1)
    pg.screenshot(path=ORDNER + "/k1.png")
    pg.click("#cam-sim-k2"); pg.wait_for_timeout(200)
    pruefe("Zu Kanal 2", "Kanal 2" in pg.text_content("#cam-sim-zeile"))
    pg.screenshot(path=ORDNER + "/k2.png")
    pg.click("#cam-sim-ende"); pg.wait_for_timeout(300)
    pruefe("Fertigteil gezeigt", "Fertigteil" in pg.text_content(".cam-sim-huelle, body"))
    pg.screenshot(path=ORDNER + "/ende.png")
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(200)
    pg.screenshot(path=ORDNER + "/dunkel.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape schliesst", pg.locator("canvas[data-cam-sim-n]").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
