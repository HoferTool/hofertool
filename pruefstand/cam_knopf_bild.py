# HOFERCAM (seit 1.600.0): Maus über einem Knopf „+ …“ der Bearbeitungen zeigt
# im Maschinenbild alle Plätze dieses Knopfs blinkend
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
    pruefe("ohne Maus kein Bild", pg.locator("#cam-bild").count() == 0)
    erwartet = {"dreh": 6, "front": 8, "seite": 4, "k2": 4, "k2a": 4}
    for art, n in erwartet.items():
        pg.hover(f"#cam-neu-{art}"); pg.wait_for_timeout(250)
        g = pg.locator("#cam-bild[data-gruppe]")
        anz = int(g.get_attribute("data-bereiche") or 0) if g.count() else 0
        blink = pg.locator("#cam-bild .cam-bild__rahmen--blink").count()
        pruefe(f"{art}: {n} Plätze blinken (gefunden {anz}/{blink})", anz == n and blink == n)
        if art == "dreh": pg.locator("#cam-bild").screenshot(path="/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/knopf_dreh.png")
    pg.select_option("[data-cam='t34']", "3421")
    pg.hover("#cam-neu-quer"); pg.wait_for_timeout(250)
    pruefe("Frontangetrieben: 6 Plätze (Haupt und Gegen)", pg.locator("#cam-bild .cam-bild__rahmen--blink").count() == 6)
    pg.locator("#cam-bild").screenshot(path="/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/knopf_quer.png")
    pg.mouse.move(5, 5); pg.wait_for_timeout(250)
    pruefe("Maus weg: Bild weg", pg.locator("#cam-bild").count() == 0)
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(200)
    pg.hover("[data-block='0'] [data-camblock-platzfeld]"); pg.wait_for_timeout(300)
    pruefe("Platzfeld zeigt wieder ein Werkzeug", pg.locator("#cam-bild").count() == 1 and pg.locator("#cam-bild[data-gruppe]").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
