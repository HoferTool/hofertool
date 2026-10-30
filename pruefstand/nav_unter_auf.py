# Unterreiter in der Seitenleiste klappen weich auf und beim
# Seitenwechsel wieder zu (seit 1.112.0). Bilder des Ablaufs, hell und dunkel.
import os, sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
ZIEL = sys.argv[1] if len(sys.argv) > 1 else None
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    for modus in ["hell", "dunkel"]:
        if modus == "dunkel": pg.evaluate("document.body.classList.add('dunkel')")
        pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(900)
        pg.evaluate("location.hash='#bestellungen'")
        for i, ms in enumerate([60, 120, 160, 500]):
            pg.wait_for_timeout(ms)
            if ZIEL: pg.screenshot(path=f"{ZIEL}/{modus}-{i}.png", clip={"x":0,"y":40,"width":260,"height":560})
        if pg.locator("div.nav__unter").count() != 1: fehler.append("Alte Gruppe bleibt stehen: " + modus)
        if pg.locator("[data-unter^='produktion/']").count(): fehler.append("Produktion-Reiter noch klickbar")
        if pg.locator("[data-unter='bestellungen/bestellt']").count() != 1: fehler.append("Bestellungen-Reiter fehlen")
        pg.click("[data-unter='bestellungen/bestellt']"); pg.wait_for_timeout(400)
        if pg.locator("[data-best='bestellt'].aktiv").count() != 1: fehler.append("Reiter wechselt nicht")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
