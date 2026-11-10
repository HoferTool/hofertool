# Schnellvorschau der Planwand ist deckend, hell und dunkel (seit 1.461.0,
# Wunsch Patrick 10. November 2026; 1.393.0 bis 1.460.x durchsichtig).
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)
BILD = os.environ.get("BILDER")

def deckung(pg):
    pg.mouse.move(1, 1); pg.wait_for_timeout(100)
    z = pg.evaluate("""() => [...document.querySelectorAll('.pw-balken[data-auftrag]')].map(b => b.getBoundingClientRect())
      .filter(r => r.width > 30 && r.y > 150 && r.bottom < innerHeight - 40 && r.x > 0)
      .map(r => ({x: r.x + Math.min(r.width/2, 20), y: r.y + r.height/2}))[0]""")
    pg.mouse.move(z["x"], z["y"]); pg.wait_for_timeout(400)
    return pg.evaluate("""() => { const f = document.querySelector('.pw-info'); if (!f) return null;
      const c = getComputedStyle(f).backgroundColor; const m = c.match(/[\\d.]+/g).map(Number);
      return c.startsWith('color(') ? (m.length > 3 ? m[m.length-1] : 1) : (m.length > 3 ? m[3] : 1); }""")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH)
    pg = br.new_page(viewport={"width": 1600, "height": 950})
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)
    a = deckung(pg)
    print("  Deckung:", a)
    pruefe("Vorschau deckend", a is not None and a > 0.99)
    if BILD: pg.screenshot(path=f"{BILD}/vorschau-deckend.png")
    # Dunkler Modus: ebenso deckend
    pg.mouse.move(1, 1)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(300)
    a = deckung(pg)
    pruefe("Vorschau dunkel deckend", a is not None and a > 0.99)
    if BILD: pg.screenshot(path=f"{BILD}/vorschau-deckend-dunkel.png")
    pg.evaluate("document.body.classList.remove('dunkel')")
    # Kein Regler mehr in den Einstellungen
    pg.mouse.move(1, 1)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(500)
    pruefe("kein Regler Durchsichtig mehr", pg.locator("#e-pwdurchsicht").count() == 0)
    # Ein früher gespeicherter Wert wirkt nicht mehr
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.evaluate("document.documentElement.style.setProperty('--pw-info-deckung', '40%')")
    a = deckung(pg)
    pruefe("alter Wert ohne Wirkung", a is not None and a > 0.99)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
