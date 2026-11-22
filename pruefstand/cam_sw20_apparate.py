# HOFERCAM (seit 1.679.0): SW-20 Apparate im Werkzeugauswahlbild (Bild des
# T1500-Apparats je Platz, fest ohne Drehpfeil, Kanal 1 gespiegelt) und
# Schlitzapparat auf T700 in der Bestückung (nicht mehr querangetrieben),
# Simulation öffnet ohne Fehler.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ORDNER = "/tmp/claude-0/cam_sw20_apparate"; os.makedirs(ORDNER, exist_ok=True)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 900}, device_scale_factor=2).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(400)
    for pl in ["500", "600", "1300", "1400", "1500"]:
        pg.click(f"[data-cam-swfront='{pl}'] input"); pg.wait_for_timeout(100)
    pg.select_option("[data-cam-swfrontart='1400']", "fest"); pg.wait_for_timeout(100)
    pruefe("Querangetrieben Kanal 1 noch T700", pg.inner_text("#cam-neu-seite").strip().endswith("T700"))
    pg.click("[data-cam-swschlitz] input"); pg.wait_for_timeout(200)
    pruefe("Mit Schlitzapparat kein Querangetrieben Kanal 1", pg.is_disabled("#cam-neu-seite"))
    pg.hover("[data-cam-swkanal='1']"); pg.wait_for_timeout(500)
    pruefe("Bild mit 6 Apparaten", pg.locator("#cam-bild [data-cam-apparat]").count() == 6)
    pruefe("T1400 fest, T1300 angetrieben", pg.get_attribute("#cam-bild [data-cam-apparat='1400']", "data-art") == "fest" and pg.get_attribute("#cam-bild [data-cam-apparat='1300']", "data-art") == "an")
    pruefe("Schlitzapparat im Bild", pg.locator("#cam-bild [data-cam-apparat='700'][data-art='schlitz']").count() == 1)
    pg.wait_for_timeout(1200)
    pg.locator("#cam-bild").screenshot(path=ORDNER + "/bild.png")
    pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    pg.hover("[data-cam-swschlitz]"); pg.wait_for_timeout(400)
    pruefe("Text Schlitzapparat", "Schlitzapparat" in pg.inner_text("#cam-bild"))
    pg.click("#cam-sim-auf"); pg.wait_for_timeout(2000)
    pruefe("Simulation offen", pg.locator("canvas").count() > 0)
    br.close()
print("Fehler:", fehler or "keine")
