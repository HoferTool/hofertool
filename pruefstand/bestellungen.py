# Bestellungen mit React-Hülle: alle Reiter zeigen etwas, ein
# Statuswechsel frischt den Reiter auf (über seiteBestellungen(b) aus
# dem alten Programm) und Escape springt auf „Offen“.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt table"); pg.wait_for_timeout(300)
    if "MTEC-452410" not in pg.inner_text("#best-inhalt"): fehler.append("Position fehlt in Offen")

    for r in ["bestellt", "historie", "artikel", "bezeichnungen", "lieferanten", "offen"]:
        pg.click(f"[data-best='{r}']"); pg.wait_for_timeout(500)
        if pg.locator(f"[data-best='{r}'].aktiv").count() != 1: fehler.append("Reiter nicht aktiv: " + r)
        if pg.locator("#best-inhalt").count() != 1: fehler.append("best-inhalt nicht genau einmal: " + r)
        if "Wird geladen" in pg.inner_text("#best-inhalt"): fehler.append("lädt ewig: " + r)
    if "Vischer" not in pg.inner_text("#best-inhalt"): fehler.append("Lieferant fehlt")

    # Status auf bestellt: die Position verschwindet aus Offen
    pg.click("[data-bstatus='o1']"); pg.click(".dialog-huelle [data-neu='bestellt']")
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.click(".dialog-huelle [data-ja]")
    pg.wait_for_timeout(800)
    if "MTEC-452410" in pg.inner_text("#best-inhalt"): fehler.append("Nach Statuswechsel noch in Offen")
    if pg.locator("h1.seitentitel").count() != 1: fehler.append("Titel doppelt nach Auffrischen")
    pg.click("[data-best='bestellt']"); pg.wait_for_timeout(500)
    if "MTEC-452410" not in pg.inner_text("#best-inhalt"): fehler.append("Nicht in Bestellt")

    # Escape: vom Unterreiter auf Offen
    pg.click("[data-best='lieferanten']"); pg.wait_for_timeout(400)
    pg.locator("h1").click(); pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    if not pg.locator("[data-best='offen'].aktiv").count(): fehler.append("Escape springt nicht auf Offen")

    # Wechsel weg und wieder her
    pg.evaluate("location.hash='#rechner'"); pg.wait_for_timeout(400)
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_timeout(600)
    if pg.locator("#best-inhalt").count() != 1: fehler.append("nach Rückkehr kaputt")
    pg.screenshot(path="bestellungen.png")
    br.close()
print("Bestellungen | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
