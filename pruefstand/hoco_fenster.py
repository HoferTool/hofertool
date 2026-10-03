# HOCO-Fenster über der Planwand: öffnen, Liste da, Schliessen-Knopf,
# und aus der Suche über alles direkt zu einer HOCO Nr.
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
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    erste = pg.evaluate("TEST.daten.hoco_parts[0].hoco_nr")

    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1200)
    pruefe("Fenster offen", pg.locator("#hoco-fensterinhalt").count() == 1)
    inhalt = pg.inner_text("#hoco-fensterinhalt")
    pruefe("Liste geladen, Gruppe von " + erste[:5] + " dabei", (erste[:3] + "00 – ") in inhalt and "Wird geladen" not in inhalt)
    pg.locator(".dialog-huelle [data-zu]").first.click(); pg.wait_for_timeout(400)
    pruefe("Schliessen-Knopf schliesst", pg.locator("#hoco-fensterinhalt").count() == 0)

    pg.keyboard.press("Control+k"); pg.wait_for_timeout(400)
    pg.keyboard.type(erste); pg.wait_for_timeout(400)
    knopf = pg.locator(".suche-alles__treffer", has_text=erste).last
    pruefe("Treffer HOCO in der Suche", knopf.count() == 1)
    knopf.click(); pg.wait_for_timeout(2000)
    pruefe("HOCO-Fenster aus der Suche offen", pg.locator("#hoco-fensterinhalt").count() == 1)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
