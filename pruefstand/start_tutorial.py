# Startseite (seit 1.600.0): Karte „Neues Tutorial: HOFERCAM“ mit Kopf,
# „Jetzt anschauen“ öffnet das Video, danach ist die Karte weg
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
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    pruefe("Karte da", pg.locator("#db-tutorial").count() == 1)
    pg.locator("#db-tutorial").screenshot(path="/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/start_tutorial.png")
    pg.click("#db-tutorial-los"); pg.wait_for_timeout(500)
    pruefe("Video geht auf", pg.locator("#hc-tutorial video[src*='hofercam-tutorial.mp4']").count() == 1)
    pruefe("Karte weg", pg.locator("#db-tutorial").count() == 0)
    pg.click("#hc-tutorial-zu"); pg.wait_for_timeout(200)
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    pruefe("nach Neuladen nicht wieder da", pg.locator("#db-tutorial").count() == 0)
    # Seit 1.601.0: Knopf „▶ Tutorial“ in HOFERCAM
    pg.evaluate("location.hash = '#/nc'"); pg.wait_for_selector("#cam-tutorial", timeout=15000)
    pg.click("#cam-tutorial"); pg.wait_for_timeout(500)
    pruefe("HOFERCAM-Knopf öffnet Video", pg.locator("#hc-tutorial video[src*='hofercam-tutorial.mp4']").count() == 1)
    pg.click("#hc-tutorial-zu"); pg.wait_for_timeout(200)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
