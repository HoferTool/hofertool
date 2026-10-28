# Text ohne Hintergrund auf dem Infoboard (1.242.x, Wunsch Patrick 28. Oktober
# 2026: „im Infoboard auch den Text ohne Hintergrund wie bei Empfang“). Die
# Tafel ist dunkelblau, darum ist die Schrift dort von selbst weiss; am
# hellen Empfang bleibt sie schwarz (empfang.py).
import time
from datetime import datetime, timedelta
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 1000}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    h = datetime.now()
    pg.clock.set_system_time(datetime(h.year, h.month, h.day, 10, 0) + timedelta(days=(2 - h.weekday()) % 7))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector(".ib-gestalten"); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-ib='neu-text-frei']").count() == 1, "Knopf „Text ohne Hintergrund“ auf dem Infoboard")
    pg.click("[data-ib='neu-text-frei']"); pg.wait_for_selector(".ib-te .ib-text__blatt"); pg.wait_for_timeout(300)
    pg.locator(".ib-te .ib-text__blatt").click(); pg.keyboard.type("Herzlich willkommen")
    farbe_ed = pg.evaluate("() => getComputedStyle(document.querySelector('.ib-te .ib-text__blatt')).color")
    pruefe(farbe_ed == "rgb(255, 255, 255)", "im Fenster weisse Schrift: %s" % farbe_ed)
    pg.click("[data-ibte='fertig']"); pg.wait_for_timeout(800)
    tx = pg.evaluate("() => (TEST.daten.infoboard.find(z => z.id === 'haupt') || {aufbau: {teile: []}}).aufbau.teile.find(t => t.art === 'text')")
    pruefe(tx and tx.get("ohneGrund") is True, "gespeichert ohne Hintergrund")
    st = pg.evaluate(f"""() => {{ const b = document.querySelector(".ib-gestalten [data-ibteil='{tx['id']}'] .ib-text__blatt");
      return [getComputedStyle(b).backgroundColor, getComputedStyle(b).color]; }}""")
    pruefe(st[0] in ("rgba(0, 0, 0, 0)", "transparent"), "kein weisses Blatt: %s" % st[0])
    pruefe(st[1] == "rgb(255, 255, 255)", "Schrift auf der dunklen Tafel weiss: %s" % st[1])
    # Häkchen aus: wieder weisses Blatt mit schwarzer Schrift
    pg.uncheck("[data-ib='ohne-grund']"); pg.wait_for_timeout(500)
    st = pg.evaluate(f"() => getComputedStyle(document.querySelector(\".ib-gestalten [data-ibteil='{tx['id']}'] .ib-text__blatt\")).color")
    pruefe(st == "rgb(17, 17, 17)", "mit Blatt wieder schwarze Schrift: %s" % st)
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
