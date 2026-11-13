# Planwand im Vollbild-Tab (seit 1.522.0, Wunsch Patrick 13. November 2026):
# Knopf auf der Planwand öffnet #/planwand/vollbild ohne Kopf und Menü.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("PLANER_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 900})
    haupt = ctx.new_page()
    pf = []
    ctx.on("page", lambda neu: neu.on("pageerror", lambda e: pf.append(str(e)[:300])))
    haupt.on("pageerror", lambda e: pf.append(str(e)[:300]))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    haupt.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
    haupt.wait_for_selector("#pw-vollbild", timeout=15000); haupt.wait_for_timeout(800)
    pruefe(haupt.locator(".kopf").is_visible(), "normale Planwand mit Kopfzeile")
    with haupt.expect_popup() as tab:
        haupt.click("#pw-vollbild")
    pg = tab.value
    pg.wait_for_selector("#pw-inhalt .pw-rolle", timeout=20000); pg.wait_for_timeout(1200)
    pruefe("#/planwand/vollbild" in pg.url, "eigener Tab #/planwand/vollbild")
    pruefe(not pg.locator(".kopf").is_visible(), "keine Kopfzeile")
    pruefe(not pg.locator(".nav").is_visible(), "kein Menü")
    pruefe(pg.locator("#pw-vollbild").count() == 0, "im Vollbild kein Vollbild-Knopf")
    pruefe(pg.locator("#pw-heute").is_visible(), "Knöpfe der Planwand da")
    r = pg.locator("#pw-inhalt .pw-rolle").bounding_box()
    pruefe(r and r["x"] < 40, "Tafel beginnt links am Rand " + str(r and r["x"]))
    pruefe(pg.locator("#pw-zeitschicht .pw-zeitregler").count() == 1, "Zeitregler unten")
    pruefe(pg.evaluate("document.documentElement.scrollWidth <= innerWidth"), "kein seitliches Rollen")
    pg.screenshot(path=BILD + "/planwand_vollbild.png")
    # Escape: Rückfrage, Escape bleibt
    pg.click("body", position={"x": 5, "y": 890}); pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe(pg.locator(".dialog", has_text="Vollbild schliessen?").count() == 1, "Escape fragt nach")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe(pg.locator(".dialog", has_text="Vollbild schliessen?").count() == 0 and "vollbild" in pg.url, "Escape bleibt")
    # Neuer Klick geht in denselben Tab
    vorher = len(ctx.pages)
    haupt.click("#pw-vollbild"); haupt.wait_for_timeout(1500)
    pruefe(len(ctx.pages) == vorher, "zweiter Klick: kein weiterer Tab")
    pg.wait_for_selector("#pw-inhalt .pw-rolle", timeout=15000); pg.wait_for_timeout(500)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    try:
        pg.keyboard.press("Enter"); pg.wait_for_timeout(600)
    except Exception: pass
    pruefe(pg.is_closed(), "Enter schliesst den Tab")
    pruefe(not pf, "keine Fehler auf der Seite " + str(pf[:2]))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
