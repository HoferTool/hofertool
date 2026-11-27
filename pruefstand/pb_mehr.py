# Prüfberichte: „Weitere anzeigen“ unter der Liste (seit 1.941.0, Wunsch Patrick
# 27. November 2026), je 30 mehr. Nur erfundene Daten.
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Europe/Zurich")
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("""() => { TEST.daten.pruef_stamm = []; TEST.daten.pruefbericht_dateien = [];
        TEST.daten.pruefprotokolle = Array.from({ length: 70 }, (_, i) => ({ id: 'pp' + i, hoco_nr: '99999-' + String(i).padStart(4, '0'), fa_nr: '2026' + i, art: 'erstteil', kopf: {}, werte: {}, erstellt_am: '2026-11-' + String(1 + i % 27).padStart(2, '0') + 'T08:00:00Z' })); }""")
    pg.evaluate("location.hash='#/qs'"); pg.wait_for_timeout(800)
    pg.evaluate("() => { const b = [...document.querySelectorAll('[data-qs=pruefberichte], .nav a, .nav button, .reiter button, .reiter a')].find(x => x.offsetParent && /Prüfberichte/.test(x.textContent)); b && b.click(); }")
    pg.wait_for_timeout(1200)
    pruefe(pg.locator("#pb-mehr").count() == 1, "Knopf „Weitere anzeigen“ da")
    pruefe("30 weitere" in (pg.locator("#pb-mehr").text_content() or ""), "zeigt 30 weitere")
    pg.click("#pb-mehr"); pg.wait_for_timeout(300)
    pruefe("10 weitere" in (pg.locator("#pb-mehr").text_content() or ""), "danach noch 10 weitere: %s" % pg.locator("#pb-mehr").text_content())
    pg.click("#pb-mehr"); pg.wait_for_timeout(300)
    pruefe(pg.locator("#pb-mehr").count() == 0, "alle 70 da, Knopf weg")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
