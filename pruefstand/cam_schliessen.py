# HOFERCAM: Knopf „Schliessen“ (seit 1.577.0) leert alles zur Grundmaske,
# nicht Gespeichertes fragt einmal nach.
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
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    pruefe("Knopf Schliessen da", pg.locator("#camab-schliessen").count() == 1)
    pg.fill("[data-cam='nr']", "458"); pg.fill("[data-cam='hoco']", "10870-0002")
    pg.click("#cam-neu-dreh")
    pruefe("Bearbeitung da", pg.locator("[data-block='0']").count() == 1)
    pg.click("#camab-schliessen")
    pg.wait_for_selector(".dialog")
    pruefe("Fragt bei nicht Gespeichertem", "nicht gespeichert" in pg.inner_text(".dialog"))
    pg.keyboard.press("Escape"); time.sleep(0.3)
    pruefe("Abbrechen lässt alles", pg.input_value("[data-cam='nr']") == "458")
    pg.click("#camab-schliessen"); pg.wait_for_selector(".dialog")
    pg.click(".dialog button:has-text('Schliessen')"); time.sleep(0.5)
    pruefe("Felder leer", pg.input_value("[data-cam='nr']") == "" and pg.input_value("[data-cam='hoco']") == "")
    pruefe("Keine Bearbeitung mehr", pg.locator("[data-block='0']").count() == 0)
    # Gespeichert: schliesst ohne Frage
    pg.fill("[data-cam='nr']", "459"); pg.fill("[data-cam='hoco']", "10870-0003")
    pg.click("#camab-speichern"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "10870-0003"); pg.keyboard.press("Enter"); time.sleep(0.8)
    while pg.locator(".dialog").count():
        pg.keyboard.press("Enter"); time.sleep(0.5)
    pruefe("Name steht", pg.locator("#camab-name").count() == 1)
    pg.click("#camab-schliessen"); time.sleep(0.5)
    pruefe("Ohne Frage geschlossen", pg.locator(".dialog").count() == 0 and pg.input_value("[data-cam='nr']") == "")
    pruefe("Kein Name mehr", pg.locator("#camab-name").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
