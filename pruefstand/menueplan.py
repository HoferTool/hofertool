# Menüplan im Pausenraum (1.492.0, Wunsch Patrick 12. November 2026):
# Kachel mit Inhalt „Menüplan“ zeigt das Menü von heute, Antippen die
# Woche Mo–Fr, oben links „Bearbeiten“, gespeichert in infoboard/menueplan.
import time, os
from datetime import timedelta
from pruefstand import server_starten, FAKE, CH, PORT, tagsueber
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1920, "height": 1080}, timezone_id="Europe/Zurich")
    pg = ctx.new_page()
    t = tagsueber(pg)
    heute = t.isoformat(); morgen = (t + timedelta(days=1 if t.weekday() < 4 else -1)).isoformat()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("""TEST.daten.infoboard = (TEST.daten.infoboard || []).concat([{ id: 'menueplan', aufbau: { tage: { '%s': 'Älplermagronen\\nmit Apfelmus' } } }])""" % heute)
    pg.evaluate("location.hash='#/pausenraum'"); pg.wait_for_selector(".ib-gestalten--pausenraum"); pg.wait_for_timeout(1200)

    pg.click("[data-ib='neu-kachel']"); pg.wait_for_selector(".dialog-huelle")
    pg.locator(".dialog-huelle input").first.fill("Tschanz's Menüplan")
    pg.locator(".dialog-huelle select").last.select_option("menu")
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1000)
    k = pg.evaluate("() => (TEST.daten.infoboard.find(z => z.id === 'pausenraum') || { aufbau: { teile: [] } }).aufbau.teile[0]")
    pruefe(k and k["inhalt"] == {"art": "menu"}, "Kachel Menüplan gespeichert: %s" % (k and k.get("inhalt")))
    pruefe("Menüplan" in pg.locator("[data-ib='kachel-inhalt']").inner_text(), "Inhalt der Kachel angezeigt")

    pg.click("[data-ib='anzeige']"); pg.wait_for_selector(".ib-voll--pausenraum .ib-kachel"); pg.wait_for_timeout(1000)
    kt = pg.locator(".ib-voll [data-menue='heute']").inner_text()
    pruefe("Älplermagronen" in kt, "Kachel zeigt Menü von heute: " + kt)
    pg.screenshot(path=BILD + "/menue-kachel.png")
    pg.locator(".ib-voll [data-ibkachel=\"Tschanz's Menüplan\"]").click(); pg.wait_for_selector("[data-menue='woche']")
    pruefe(pg.locator(".ib-menue__tag").count() == 5, "fünf Tage Mo–Fr")
    pruefe(pg.locator(".ib-menue__tag--heute").count() == 1 and "Älplermagronen" in pg.locator(".ib-menue__tag--heute").inner_text(), "heute hervorgehoben mit Menü")
    b = pg.locator("[data-menue='bearbeiten']").bounding_box()
    pruefe(b and b["x"] < 300 and b["y"] < 120, "Bearbeiten oben links: %s" % b)
    pg.screenshot(path=BILD + "/menue-woche.png")
    pg.click("[data-menue='bearbeiten']"); pg.wait_for_selector(".ib-menue__feld")
    pruefe(pg.locator(".ib-menue__feld").count() == 5, "fünf Textfelder")
    pg.locator("[data-menuetag='%s'] textarea" % morgen).fill("Rindsgeschnetzeltes\nRösti")
    pg.screenshot(path=BILD + "/menue-bearbeiten.png")
    pg.click("[data-menue='speichern']"); pg.wait_for_timeout(800)
    z = pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'menueplan')")
    tage = z["aufbau"]["tage"]
    pruefe(tage.get(morgen) == "Rindsgeschnetzeltes\nRösti" and "Älplermagronen" in tage.get(heute, ""), "gespeichert, heute bleibt: %s" % tage)
    pruefe(pg.locator(".ib-menue__feld").count() == 0, "zurück in der Ansicht")
    pruefe("Rösti" in pg.locator("[data-menuetag='%s']" % morgen).inner_text(), "neues Menü sichtbar")
    pg.click("[data-menue='vor']")
    pruefe("Nächste Woche" in pg.locator(".ib-menue__woche").inner_text(), "Pfeil zur nächsten Woche")
    pg.click("[data-ib='gross-zu']"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-menue='woche']").count() == 0, "Schliessen geht zu")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
