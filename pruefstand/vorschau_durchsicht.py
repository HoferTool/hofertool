# Schnellvorschau der Planwand durchsichtig, einstellbar unter
# Einstellungen → Allgemein → Darstellung, je Person gemerkt (1.393.0,
# Wunsch Patrick 4. November 2026).
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
    print("  Deckung Vorgabe:", a)
    pruefe("Vorgabe 30 % durchsichtig", a is not None and abs(a - 0.7) < 0.02)
    if BILD: pg.screenshot(path=f"{BILD}/durchsicht-30.png")

    pg.mouse.move(1, 1)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(500)
    r = pg.locator("#e-pwdurchsicht")
    pruefe("Regler in Darstellung", r.count() == 1)
    r.fill("60"); pg.wait_for_timeout(700)
    pruefe("Wert 60 % angezeigt", pg.inner_text("#e-pwdurchsicht-wert").strip() == "60 %")
    gesp = pg.evaluate("() => Object.keys(localStorage).filter(k => k.includes('pwinfodurchsicht')).map(k => localStorage.getItem(k))")
    pruefe("gemerkt", gesp == ["60"])
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    a = deckung(pg)
    print("  Deckung 60:", a)
    pruefe("60 % durchsichtig", a is not None and abs(a - 0.4) < 0.02)
    if BILD: pg.screenshot(path=f"{BILD}/durchsicht-60.png")

    # Nach Neuladen bleibt es
    pg.mouse.move(1, 1)
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)
    a = deckung(pg)
    pruefe("nach Neuladen 60 %", a is not None and abs(a - 0.4) < 0.02)

    # 0 % = deckend
    pg.mouse.move(1, 1)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(500)
    pg.locator("#e-pwdurchsicht").fill("0"); pg.wait_for_timeout(700)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    a = deckung(pg)
    pruefe("0 % deckend", a is not None and a > 0.99)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
