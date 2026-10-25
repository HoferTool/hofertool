# Infoboard: Bildschirmschoner (1.179.0, Wunsch Patrick 25. Oktober 2026).
# Von 23:00 bis 05:30 und sonntags den ganzen Tag bleibt der Kopf, darunter
# statt der Dokumente Schwarz mit fliegenden Halloween-Hühnern (1.179.1).
# Ein Tipp darunter zeigt die Dokumente für eine Minute.
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
    pg.evaluate("""() => { TEST.daten.infoboard = [{ id: 'haupt', geaendert_am: '2026-10-20T10:00:00Z', aufbau: { frei: true, teile: [
      { id: 'probe', art: 'text', html: '<p>Probe</p>', x: 12, y: 500, w: 344, h: 486, drehung: 0 }] } }]; }""")
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector("[data-ib='anzeige']")
    pg.click("[data-ib='anzeige']"); pg.wait_for_selector("#infoboard"); pg.wait_for_timeout(2500)
    return br, pg

nacht = lambda pg: pg.locator("#infoboard [data-ib='nacht']").count() == 1
kopf = lambda pg: pg.locator("#infoboard .ib-kopf .kopfkarte").count() == 1 and pg.locator("#infoboard .ib-kopf .solar").count() == 1
tafel = lambda pg: pg.locator("#infoboard .ib-teil").count() == 1

with sync_playwright() as p:
    # Mittwoch 23:30: Schoner
    br, pg = oeffnen(p, "2026-10-21T23:30:00+02:00")
    pruefe(nacht(pg) and not tafel(pg), "Mittwoch 23:30: Hühner statt Dokumente")
    pruefe(kopf(pg), "Kopf mit Uhr, Logo, Wetter und Solaranlage bleibt")
    pg.wait_for_timeout(2500)
    pruefe(pg.locator("#infoboard .ib-huhn").count() >= 1, "Hühner fliegen: %d" % pg.locator("#infoboard .ib-huhn").count())
    k = pg.locator("#infoboard .ib-kopf").bounding_box(); n = pg.locator("#infoboard .ib-nacht").bounding_box()
    pruefe(n["y"] >= k["y"] + k["height"] - 2 and n["y"] + n["height"] > 940, "Schwarz erst unter dem Kopf bis unten: %s %s" % (k, n))
    pg.screenshot(path=os.environ.get("BILD", "/tmp/infoboard-nacht.png"))
    pg.mouse.click(270, 700); pg.wait_for_timeout(1200)
    pruefe(tafel(pg) and not nacht(pg) and kopf(pg), "Tipp zeigt die Dokumente")
    br.close()
    for zeit, soll, text in [("2026-10-22T05:20:00+02:00", True, "Donnerstag 05:20"),
                             ("2026-10-22T05:40:00+02:00", False, "Donnerstag 05:40"),
                             ("2026-10-22T12:00:00+02:00", False, "Donnerstag Mittag"),
                             ("2026-10-25T12:00:00+01:00", True, "Sonntag Mittag")]:
        br, pg = oeffnen(p, zeit)
        pruefe(nacht(pg) == soll and tafel(pg) != soll and kopf(pg), text + (": Schoner" if soll else ": Tafel"))
        br.close()
    # Seit 1.180.0: Verkleidung je Fest und Jahreszeit
    ordner = os.environ.get("BILDER", "")
    for zeit, soll in [("2026-10-25T21:00:00+01:00", "halloween"),
                       ("2026-12-20T21:00:00+01:00", "weihnachten"),
                       ("2026-12-31T23:30:00+01:00", "silvester"),
                       ("2027-02-07T12:00:00+01:00", "fasnacht"),
                       ("2027-02-14T12:00:00+01:00", "valentinstag"),
                       ("2027-03-28T12:00:00+02:00", "ostern"),
                       ("2027-05-09T12:00:00+02:00", "fruehling"),
                       ("2026-08-01T23:30:00+02:00", "august"),
                       ("2027-07-11T12:00:00+02:00", "sommer"),
                       ("2026-11-15T12:00:00+01:00", "herbst"),
                       ("2027-01-17T12:00:00+01:00", "winter")]:
        br, pg = oeffnen(p, zeit)
        pg.wait_for_timeout(2500)
        fest = pg.locator("#infoboard .ib-nacht").get_attribute("data-fest")
        pruefe(fest == soll, "%s: %s (ist %s)" % (zeit[:10], soll, fest))
        pruefe(pg.locator("#infoboard .ib-huhn").count() >= 1, soll + ": Hühner fliegen")
        if ordner:
            pg.wait_for_timeout(4000)
            pg.screenshot(path=os.path.join(ordner, "fest-" + soll + ".png"))
        br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
