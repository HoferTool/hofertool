# Infoboard und Kalender für alle ausser Externen (1.241.0, Wunsch Patrick
# 28. Oktober 2026): ein Mitarbeiter sieht beide im Menü, darf das Infoboard
# gestalten und Termine eintragen; Externe sehen beides nicht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def seite(br, rolle, url):
    mit = FAKE + ";\nTEST.daten.profiles[0].role = '%s'; TEST.daten.kalender = [];\n" % rolle
    pg = br.new_page(viewport={"width": 1440, "height": 900})
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=mit))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html" + url, wait_until="domcontentloaded")
    return pg, pf

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg, pf = seite(br, "mitarbeiter", "#/kalender")
    pg.wait_for_selector("#kal-naechste", timeout=15000); pg.wait_for_timeout(500)
    pruefe(pg.locator("#kal-neu").count() == 1, "Mitarbeiter: Knopf Termin eintragen")
    pruefe(pg.locator("[data-nav='infoboard']").count() > 0, "Mitarbeiter: Infoboard im Menü")
    pg.evaluate("location.hash = '#/infoboard'"); pg.wait_for_timeout(1500)
    t = pg.inner_text("main") if pg.locator("main").count() else pg.inner_text("body")
    pruefe("Datei wählen" in t or "Text" in t, "Mitarbeiter: Infoboard gestalten")
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    pg.close()

    pg, pf = seite(br, "extern", "#/kalender")
    pg.wait_for_timeout(3000)
    pruefe(pg.locator("#kal-naechste").count() == 0, "Extern: kein Kalender")
    pruefe(pg.locator("[data-nav='infoboard']").count() == 0 and pg.locator("[data-nav='kalender']").count() == 0, "Extern: nichts im Menü")
    pg.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
