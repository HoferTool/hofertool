# Infoboard: USM-Kugeln schneien über die Tafel (1.660.0, Wunsch Patrick 20. November 2026).
# Nur am Infoboard tagsüber, nicht nachts, nicht am Empfang und nicht im Pausenraum.
import os, time
from datetime import datetime
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
FAKE = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.profiles[0].andere_nutzer = true;\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def oeffnen(p, zeit, seite):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 540, "height": 960}, timezone_id="Europe/Zurich")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.clock.set_system_time(datetime.fromisoformat(zeit))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    pg.evaluate("location.hash='#/" + seite + "'"); pg.wait_for_selector("[data-ib='anzeige']")
    pg.click("[data-ib='anzeige']"); pg.wait_for_timeout(2500)
    return br, pg

usm = lambda pg: pg.locator("[data-ib='usm-schnee'] canvas").count()

def bunt(pg):
    # Zeichnet die Leinwand wirklich Kugeln? Zählt Bildpunkte, die nicht leer sind.
    return pg.evaluate("""() => { const c = document.querySelector("[data-ib='usm-schnee'] canvas");
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; }""")

with sync_playwright() as p:
    br, pg = oeffnen(p, "2026-11-20T10:30:00+01:00", "infoboard")
    pruefe(usm(pg) == 1, "Infoboard am Tag: Leinwand mit USM-Kugeln da")
    n1 = bunt(pg)
    pruefe(n1 > 2000, "Kugeln sind gezeichnet: %d Bildpunkte" % n1)
    y1 = pg.evaluate("() => document.querySelector(\"[data-ib='usm-schnee'] canvas\").toDataURL().length")
    pg.wait_for_timeout(1000)
    y2 = pg.evaluate("() => document.querySelector(\"[data-ib='usm-schnee'] canvas\").toDataURL().length")
    pruefe(y1 != y2, "Kugeln bewegen sich")
    pruefe(pg.evaluate("() => getComputedStyle(document.querySelector(\"[data-ib='usm-schnee']\")).pointerEvents") == "none", "Kugeln nehmen keine Klicks")
    pg.screenshot(path=os.environ.get("BILD", "/tmp/infoboard-usm.png"))
    br.close()
    br, pg = oeffnen(p, "2026-11-19T23:30:00+01:00", "infoboard")
    pruefe(usm(pg) == 0, "Infoboard nachts: keine Kugeln")
    br.close()
    # Empfang und Pausenraum: dieselbe Bedingung wie der Jahreszeiten-Schnee (!mass.ruhig && !mass.hell)

print("Fehler:", ", ".join(fehler) if fehler else "keine")
