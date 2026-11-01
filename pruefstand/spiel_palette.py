# Versandpalette im Pausenraum (1.328.0, Wunsch Patrick 1. November 2026):
# Block-Puzzle, Gebinde vom Förderband auf die Palette ziehen, mit Maus
# und mit dem Finger (Touch über CDP), volle Reihe geht in den Versand.
import time, os
from datetime import datetime, timedelta
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1920, "height": 1080}, has_touch=True)
    pg = ctx.new_page()
    # Werktag 10 Uhr, sonst zeigt die Anzeige nachts und sonntags die Hühner
    heute = datetime.now()
    pg.clock.set_system_time(datetime(heute.year, heute.month, heute.day, 10, 0) + timedelta(days=(2 - heute.weekday()) % 7))
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/pausenraum'"); pg.wait_for_selector(".ib-gestalten--pausenraum"); pg.wait_for_timeout(1200)

    pg.click("[data-ib='neu-kachel']"); pg.wait_for_selector(".dialog-huelle")
    pg.locator(".dialog-huelle input").first.fill("Palette")
    pg.locator(".dialog-huelle input").nth(1).fill("🧩")
    pg.locator(".dialog-huelle select").last.select_option("spiel")
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(500)
    pg.locator(".dialog-huelle select").last.select_option("palette")
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1000)
    pg.click("[data-ib='anzeige']"); pg.wait_for_selector(".ib-voll--pausenraum .ib-kachel"); pg.wait_for_timeout(1000)
    pg.locator(".ib-voll [data-ibkachel='Palette']").click(); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-sp='palette']").count() == 1, "Versandpalette offen")
    pg.screenshot(path=BILD + "/palette-start.png")
    pg.click("[data-sp='vp-start']"); pg.wait_for_timeout(300)

    feld = pg.locator("[data-sp='vp-feld']").bounding_box()
    k = (feld["width"] - 16) / 8
    luft = round(round(k) * 1.4)
    def band(i):
        b = pg.locator("[data-sp='vp-band-%d']" % i).bounding_box()
        return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    def ziel(x, y):  # Finger so, dass die Mitte des Gebindes über Platz x, y liegt
        return feld["x"] + 8 + (x + .5) * k, feld["y"] + 8 + (y + .5) * k + luft

    # Mit der Maus: Gebinde 0 in die linke obere Ecke
    sx, sy = band(0); tx, ty = ziel(1, 1)
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(tx, ty, steps=8); pg.wait_for_timeout(150)
    pruefe(pg.locator(".sp-vp__schwebt").count() == 1, "Gebinde schwebt beim Ziehen")
    pg.screenshot(path=BILD + "/palette-ziehen.png")
    pg.mouse.up(); pg.wait_for_timeout(200)
    n1 = pg.locator("[data-sp='vp-feld'] > .sp-vp__kiste").count()
    pruefe(n1 >= 1, "Mit der Maus abgelegt: %d Kisten" % n1)
    pruefe(int(pg.locator("[data-sp='vp-punkte']").inner_text()) == n1, "Punkte je Kiste")

    # Mit dem Finger: Gebinde 1 unten rechts
    cdp = ctx.new_cdp_session(pg)
    def touch(typ, x, y):
        cdp.send("Input.dispatchTouchEvent", {"type": typ, "touchPoints": [] if typ == "touchEnd" else [{"x": x, "y": y}]})
    sx, sy = band(1); tx, ty = ziel(5, 5)
    touch("touchStart", sx, sy)
    for i in range(1, 11): touch("touchMove", sx + (tx - sx) * i / 10, sy + (ty - sy) * i / 10); pg.wait_for_timeout(15)
    touch("touchEnd", 0, 0); pg.wait_for_timeout(250)
    n2 = pg.locator("[data-sp='vp-feld'] > .sp-vp__kiste").count()
    pruefe(n2 > n1, "Mit dem Finger abgelegt: %d → %d" % (n1, n2))

    # Volle Reihe: Feld vorbereiten, eine 1er-Kiste ins letzte Loch
    pg.evaluate("""() => {
      const el = document.querySelector("[data-sp='palette']");
      const f = Object.keys(el).find(k => k.startsWith('__reactFiber'));
      let fb = el[f]; while (fb && !(fb.memoizedState && fb.memoizedState.memoizedState && fb.memoizedState.memoizedState.feld)) fb = fb.return;
      const h = fb.memoizedState; const z = h.memoizedState;
      const feld = Array.from({length: 8}, () => Array(8).fill(null));
      for (let x = 0; x < 7; x++) feld[7][x] = '#2563eb|ST';
      const g = { id: 99, teile: [[0, 0]], stoff: 'MS', farbe: '#f59e0b', b: 1, h: 1 };
      h.queue.dispatch({ ...z, feld, band: [g, z.band[1] || g, z.band[2] || g], punkte: 0, linien: 0, serie: 0 });
    }""")
    pg.wait_for_timeout(200)
    sx, sy = band(0); tx, ty = ziel(7, 7)
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(tx, ty, steps=8); pg.wait_for_timeout(100)
    pruefe(pg.locator(".sp-vp__kiste--weg").count() == 8, "Volle Reihe vorher gelb markiert: %d" % pg.locator(".sp-vp__kiste--weg").count())
    pg.mouse.up(); pg.wait_for_timeout(150)
    pg.screenshot(path=BILD + "/palette-versand.png")
    pruefe(pg.locator("[data-sp='vp-linien']").inner_text() == "1", "Reihe versandt")
    pruefe(pg.locator("[data-sp='vp-feld'] > .sp-vp__kiste:not(.sp-vp__kiste--fort)").count() == 0, "Reihe ist weg")
    pruefe(pg.locator("[data-sp='vp-spruch']").count() == 1, "Spruch erscheint")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()

print("Fehler:", "keine" if not fehler else fehler)
