# Infoboard: Bildschirmschoner (1.179.0, Wunsch Patrick 25. Oktober 2026).
# Von 23:00 bis 05:30 und sonntags den ganzen Tag nur die Solaranlage auf
# Schwarz, mit fliegenden Hühnern. Ein Tipp zeigt die Tafel für eine Minute.
import os, time
from datetime import datetime
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def oeffnen(p, zeit):
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
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector("[data-ib='anzeige']")
    pg.click("[data-ib='anzeige']"); pg.wait_for_selector("#infoboard"); pg.wait_for_timeout(2500)
    return br, pg

nacht = lambda pg: pg.locator("#infoboard [data-ib='nacht']").count() == 1
tafel = lambda pg: pg.locator("#infoboard .ib-kopf .kopfkarte").count() == 1

with sync_playwright() as p:
    # Mittwoch 23:30: Schoner
    br, pg = oeffnen(p, "2026-10-21T23:30:00+02:00")
    pruefe(nacht(pg) and not tafel(pg), "Mittwoch 23:30: Bildschirmschoner statt Tafel")
    pruefe(pg.locator("#infoboard .ib-nacht .solar").count() == 1, "Solaranlage sichtbar")
    pg.wait_for_timeout(2500)
    pruefe(pg.locator("#infoboard .ib-huhn").count() >= 1, "Hühner fliegen: %d" % pg.locator("#infoboard .ib-huhn").count())
    farbe = pg.evaluate("getComputedStyle(document.querySelector('.ib-nacht__blatt')).backgroundColor")
    pruefe(farbe == "rgb(0, 0, 0)", "Rest schwarz: " + farbe)
    s = pg.locator("#infoboard .ib-nacht .solar").bounding_box()
    pruefe(s and abs(s["y"] + s["height"] / 2 - 480) < 60, "Solaranlage in der Mitte: %s" % s)
    pg.screenshot(path=os.environ.get("BILD", "/tmp/infoboard-nacht.png"))
    pg.mouse.click(270, 700); pg.wait_for_timeout(1200)
    pruefe(tafel(pg) and not nacht(pg), "Tipp zeigt die Tafel")
    br.close()
    for zeit, soll, text in [("2026-10-22T05:20:00+02:00", True, "Donnerstag 05:20"),
                             ("2026-10-22T05:40:00+02:00", False, "Donnerstag 05:40"),
                             ("2026-10-22T12:00:00+02:00", False, "Donnerstag Mittag"),
                             ("2026-10-25T12:00:00+01:00", True, "Sonntag Mittag")]:
        br, pg = oeffnen(p, zeit)
        pruefe(nacht(pg) == soll and tafel(pg) != soll, text + (": Schoner" if soll else ": Tafel"))
        br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
