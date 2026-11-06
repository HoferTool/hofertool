# NC-PRO (seit 1.440.0): das Erklärvideo kommt jedes Mal, wenn man NC-PRO
# anwählt, nicht bei Reiterwechseln darin und nicht mehr mit „Nicht mehr anzeigen“.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("window.TEST.tutorial = true")
    def zu_nc():
        pg.evaluate("location.hash='#/planwand'"); pg.wait_for_timeout(500)
        pg.evaluate("location.hash='#/nc'"); pg.wait_for_selector("[data-unter='nc/kontur']"); pg.wait_for_timeout(600)
    zu_nc()
    pruefe("Video beim Anwählen", pg.locator("#kt-tutorial").count() == 1)
    pg.click("#kt-tutorial-zu"); pg.wait_for_timeout(200)
    pg.click("[data-unter='nc/bohren']"); pg.wait_for_timeout(500)
    pg.click("[data-unter='nc/kontur']"); pg.wait_for_timeout(500)
    pruefe("Reiterwechsel ohne Video", pg.locator("#kt-tutorial").count() == 0)
    zu_nc()
    pruefe("Wieder angewählt: Video wieder da", pg.locator("#kt-tutorial").count() == 1)
    pg.check("#kt-tutorial-aus"); pg.click("#kt-tutorial-zu"); pg.wait_for_timeout(200)
    zu_nc()
    pruefe("Nicht mehr anzeigen wirkt", pg.locator("#kt-tutorial").count() == 0)
    pg.click("#kt-anleitung"); pg.wait_for_selector("#kt-tutorial")
    pruefe("Anleitung zeigt es trotzdem", pg.locator("#kt-tutorial video").count() == 1)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
