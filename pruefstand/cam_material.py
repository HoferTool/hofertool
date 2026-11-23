# HOFERCAM (seit 1.729.0): Material in den Kopfdaten, neue Bearbeitungen
# bekommen Vc bzw. S aus den Richtwerten für Hartmetall.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ORDNER = "/tmp/claude-0/cam_material"; os.makedirs(ORDNER, exist_ok=True)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    # SB-20RG: ohne Material die feste Vorgabe 3000
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(300)
    pruefe("ohne Material S 3000", pg.input_value("[data-block='0'] [data-camblock='S']") == "3000")
    pg.fill("[data-cam='material']", "1.4305 rd 12"); pg.wait_for_timeout(200)
    pruefe("V2A erkannt", pg.get_attribute("[data-cam-material-erkannt]", "data-cam-material-erkannt") == "v2a")
    pg.fill("[data-cam='A']", "12"); pg.wait_for_timeout(200)
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(300)
    s = pg.input_value("[data-block='1'] [data-camblock='S']")
    print("S Drehen V2A Ø12:", s)
    pruefe("Drehen V2A Ø12 S 4250", s == "4250")  # Vc 160
    pg.click("#cam-neu-front"); pg.wait_for_timeout(300)
    s = pg.input_value("[data-block='2'] [data-camblock='S']")
    print("S Bohren V2A Ø3:", s)
    pruefe("Front V2A S 6350", s == "6350")  # Vc 60 bei Ø3
    pg.fill("[data-cam='material']", "Messing"); pg.wait_for_timeout(200)
    pruefe("Messing erkannt", pg.get_attribute("[data-cam-material-erkannt]", "data-cam-material-erkannt") == "messing")
    pg.evaluate("document.querySelector(\"[data-cam='material']\").scrollIntoView({block:'center'})"); pg.wait_for_timeout(200)
    bb = pg.locator("[data-cam='material']").locator("xpath=ancestor::fieldset[1]").bounding_box()
    print("Box", bb)
    pg.screenshot(path=ORDNER + "/kopf.png", clip={"x": bb["x"], "y": bb["y"], "width": bb["width"], "height": bb["height"]})
    # SW-20: Drehwerkzeug mit Vc
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(500)
    if pg.locator(".dialog-huelle button:has-text('Wechseln')").count(): pg.click(".dialog-huelle button:has-text('Wechseln')")
    pg.wait_for_timeout(300)
    n = pg.locator("[data-block]").count()
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(300)
    vc = pg.locator("[data-camblock='vc']").last.input_value()
    print("Vc SW-20 Messing:", vc)
    pruefe("SW-20 Drehen Messing Vc 300", vc == "300")
    br.close()
print("Fehler:", fehler or "keine")
