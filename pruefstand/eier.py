# Eierzähler im Pausenraum (1.297.0, Wunsch Patrick 30. Oktober 2026):
# Kachel mit Inhalt „Eierzähler“, eintragen mit − und +, gespeichert je
# Tag in eier_tage, frühere Tage über die Pfeile.
import time, os
from datetime import date, timedelta
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

heute = date.today().isoformat()
gestern = (date.today() - timedelta(days=1)).isoformat()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1920, "height": 1080})
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("TEST.daten.eier_tage = [{ datum: '%s', anzahl: 7 }]" % gestern)
    pg.evaluate("location.hash='#/pausenraum'"); pg.wait_for_selector(".ib-gestalten--pausenraum"); pg.wait_for_timeout(1200)

    pg.click("[data-ib='neu-kachel']"); pg.wait_for_selector(".dialog-huelle")
    pg.locator(".dialog-huelle input").first.fill("Eierzähler")
    pg.locator(".dialog-huelle input").nth(1).fill("🥚")
    pg.locator(".dialog-huelle select").last.select_option("eier")
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1000)
    t = pg.evaluate("() => (TEST.daten.infoboard.find(z => z.id === 'pausenraum') || { aufbau: { teile: [] } }).aufbau.teile[0]")
    pruefe(t and t["inhalt"] == {"art": "eier"}, "Kachel Eierzähler gespeichert: %s" % (t and t.get("inhalt")))
    pruefe("Eierzähler" in pg.locator("[data-ib='kachel-inhalt']").inner_text(), "Inhalt der Kachel angezeigt")

    pg.click("[data-ib='anzeige']"); pg.wait_for_selector(".ib-voll--pausenraum .ib-kachel"); pg.wait_for_timeout(1000)
    pg.locator(".ib-voll [data-ibkachel='Eierzähler']").click(); pg.wait_for_selector("[data-eier='feld']")
    pruefe(pg.locator("[data-eier='tag']").inner_text() == "Heute", "startet bei Heute")
    pruefe(pg.locator("[data-eier='wert']").inner_text().startswith("0"), "heute noch 0")
    for _ in range(3): pg.click("[data-eier='plus']")
    pg.click("[data-eier='plus10']"); pg.click("[data-eier='minus']")
    pruefe(pg.locator("[data-eier='wert']").inner_text().startswith("12"), "3 + 10 − 1 = 12: " + pg.locator("[data-eier='wert']").inner_text())
    pg.wait_for_timeout(1500)
    z = pg.evaluate("() => TEST.daten.eier_tage.find(z => z.datum === '%s')" % heute)
    pruefe(z and z["anzahl"] == 12, "heute 12 gespeichert: %s" % z)
    pruefe("gespeichert" in pg.locator("[data-eier='stand']").inner_text(), "zeigt gespeichert")
    pruefe(pg.locator("[data-eier='vor']").is_disabled(), "nicht in die Zukunft")
    pg.click("[data-eier='zurueck']")
    pruefe(pg.locator("[data-eier='tag']").inner_text() == "Gestern", "Pfeil zu Gestern")
    pruefe(pg.locator("[data-eier='wert']").inner_text().startswith("7"), "gestern 7")
    pg.click("[data-eier='plus']"); pg.click("[data-eier='vor']"); pg.wait_for_timeout(500)
    z = pg.evaluate("() => TEST.daten.eier_tage.find(z => z.datum === '%s')" % gestern)
    pruefe(z and z["anzahl"] == 8, "Wechsel speichert gestern sofort 8: %s" % z)
    pruefe(pg.locator(".pr-eier__saeule").count() == 14, "14 Tage als Säulen")
    pg.screenshot(path=BILD + "/eier.png")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
