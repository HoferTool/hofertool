# NC-PRO (seit 1.437.0): jeder Reiter lässt sich als eigenes Fenster öffnen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ZIEL = {"cam": "#cam-kanaele", "bohren": "#bf-code", "entgraten": "#eg-code", "cachse": ".gcode", "gravur": ".gcode", "dxf": ".gcode", "rechner": "#rech-inhalt section, #rech-inhalt .karte"}
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/kontur']")
    pruefe("Kontur ohne zweiten Knopf", pg.locator("#nc-eigen").count() == 0 and pg.locator("#kt-eigen").count() == 1)
    for art, sel in ZIEL.items():
        pg.click(f"[data-unter='nc/{art}']"); pg.wait_for_selector(f"[data-nceigen-auf='{art}']")
        with pg.expect_popup() as auf:
            pg.click("#nc-eigen")
        pop = auf.value; pop.on("pageerror", lambda e: fehler.append("FENSTERFEHLER: " + str(e)[:160]))
        pop.wait_for_selector(f"[data-nceigen='{art}']"); pop.wait_for_timeout(300)
        pruefe(art + ": Inhalt im eigenen Fenster", pop.locator(f"[data-nceigen='{art}'] " + sel.replace(", ", f", [data-nceigen='{art}'] ")).count() >= 1)
        pruefe(art + ": Reiter zeigt Zurückholen", pg.locator(f"[data-ncwoanders='{art}']").count() == 1 and pg.locator("#nc-eigen").count() == 0)
        if art == "bohren":
            vor = pop.text_content("#bf-code")
            pop.fill("[data-bf='drehzahl']", "1234"); pop.press("[data-bf='drehzahl']", "Tab"); pop.wait_for_timeout(300)
            geaendert = pop.text_content("#bf-code")
            pruefe("bohren: rechnet im Fenster", geaendert != vor)
        pop.click("[data-nceigen-zu]"); pg.wait_for_timeout(400)
        pruefe(art + ": zurück im Reiter", pg.locator(sel).count() >= 1 and pg.locator("[data-ncwoanders]").count() == 0)
        if art == "bohren": pruefe("bohren: Änderung bleibt", pg.text_content("#bf-code") == geaendert)
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
