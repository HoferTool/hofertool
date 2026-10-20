# HOCO Nr. öffnen: Schreibmarke steht gleich im Suchfeld (am Computer),
# auf dem Tablet nicht, damit die Tastatur nicht aufspringt.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def seite(br, **kw):
    pg = br.new_context(**kw).new_page()
    pg.f = []; pg.on("pageerror", lambda e: pg.f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    return pg
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = seite(br, viewport={"width": 1440, "height": 900})
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1200)
    pruefe("Suchfeld angewählt", pg.evaluate("document.activeElement && document.activeElement.id") == "hoco-such")
    erste = pg.evaluate("TEST.daten.hoco_parts[0].hoco_nr")
    pg.keyboard.type(erste[-4:]); pg.wait_for_timeout(500)
    pruefe("gleich tippen findet " + erste, pg.locator("[data-hoco-auf='" + erste + "']").count() == 1)
    pg.screenshot(path="/tmp/claude-0/-home-claude-hofertool/0f09c96d-f02b-5203-902b-82234fffc3ce/scratchpad/hoco.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe("Escape schliesst das Fenster", pg.locator("#hoco-fensterinhalt").count() == 0)
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1200)
    pruefe("wieder geöffnet: wieder angewählt", pg.evaluate("document.activeElement && document.activeElement.id") == "hoco-such")
    pruefe("keine Seitenfehler", not pg.f)
    t = seite(br, viewport={"width": 1180, "height": 820}, has_touch=True, is_mobile=True)
    t.locator("#pw-hoco").click(); t.wait_for_timeout(1200)
    pruefe("Tablet: Suchfeld da, aber nicht angewählt", t.locator("#hoco-such").count() == 1
           and t.evaluate("document.activeElement && document.activeElement.id") != "hoco-such")
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
