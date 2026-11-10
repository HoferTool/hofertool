# Bestellungen: Kopier-Knopf kopiert nur die Bestell-Nr. und öffnet
# keinen Shop und keine Website (seit 1.455.0, Wunsch Patrick 10. November 2026).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1400,"height":900})
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=f"http://127.0.0.1:{PORT}")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    # Lieferant mit Website-Bestellung und Name wie ein Shop mit Suche
    pg.evaluate("""() => { const d = TEST.daten; const s = d.suppliers[0];
      s.name = 'Utilis AG'; s.bestellweg = 'website'; s.website = 'https://shop.utilis.com'; }""")
    pg.evaluate("window.__offen = []; window.open = (...a) => { window.__offen.push(a); return null; }")
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-kopie"); pg.wait_for_timeout(300)
    pg.evaluate("window.__offen = []")
    nr = pg.locator("#best-inhalt .bs-kopie").first.get_attribute("data-bkopie")
    pg.locator("#best-inhalt .bs-kopie").first.click(); pg.wait_for_timeout(400)
    if pg.evaluate("window.__offen.length"): fehler.append("Fenster geöffnet: " + str(pg.evaluate("window.__offen")))
    if len(ctx.pages) != 1: fehler.append("Neuer Tab: " + str(len(ctx.pages)))
    ab = pg.evaluate("navigator.clipboard.readText()")
    if ab != nr: fehler.append("Zwischenablage: " + repr(ab) + " statt " + repr(nr))
    print("Kopiert:", ab)
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
