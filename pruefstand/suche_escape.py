# Escape beendet die laufende Suche auf der Planwand (1.28.3, Wunsch
# Patrick 12. Oktober 2026). Mit offenem Fenster schliesst Escape nur das.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
f = []
def pruef(gut, text):
    print("ok " if gut else "FEHLT", text)
    if not gut: f.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    # Escape im Suchfenster schliesst nur das Fenster
    pg.locator("#kopf-suche").click(); pg.wait_for_timeout(400)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruef(not pg.query_selector(".dialog-huelle") and not pg.query_selector(".su-leiste"), "Escape schliesst das Suchfenster")
    # Suche starten, dann Escape
    pg.locator("#kopf-suche").click(); pg.wait_for_timeout(400)
    pg.fill("#su-text", "Star SR3"); pg.locator("#su-ja").click(); pg.wait_for_timeout(1500)
    pruef(bool(pg.query_selector(".su-leiste")) and bool(pg.query_selector(".pw-balken--treffer")), "Suche läuft mit Leiste")
    pg.locator("#su-weiter").click(); pg.wait_for_timeout(800)   # Fokus liegt danach auf einem Knopf
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    pruef(not pg.query_selector(".su-leiste") and not pg.query_selector(".pw-balken--treffer"), "Escape beendet die Suche")
    pruef(not pg.evaluate("document.body.innerText.includes('Treffer 1 von')"), "keine Trefferzeile mehr")
    br.close()
print("Fehler:", f if f else "keine")
