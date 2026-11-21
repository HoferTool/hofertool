# HOFERCAM seit 1.687.0: wählt man eine Bearbeitung an, rollt das
# Programmfenster so, dass ihre Zeilen sichtbar sind (Wunsch Patrick
# 21. November 2026). Die Seite selbst rollt dabei nicht mit.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    lang = "\n".join("G1X%d.Z%d.F0.1" % (10 + i % 5, i) for i in range(60))
    for i in range(3):
        pg.click("#cam-neu-dreh"); pg.wait_for_timeout(200)
        pg.fill("[data-block='%d'] [data-camblock='code']" % i, lang)
    pg.wait_for_timeout(300)
    def sicht():
        return pg.evaluate("""() => { const k = document.querySelector('#cam-kanaele'), e = k.querySelector('.cam-zeile--aktiv');
          if (!e) return null; const a = e.getBoundingClientRect(), b = k.getBoundingClientRect();
          return a.top >= b.top && a.bottom <= b.bottom; }""")
    pg.click("[data-block='0'] [data-camblock='code']"); pg.wait_for_timeout(400)
    pg.evaluate("document.querySelector('#cam-kanaele').scrollTop = 0")
    seite = pg.evaluate("scrollY")
    pg.click("[data-block='2'] [data-camblock='code']"); pg.wait_for_timeout(400)
    pruefe("Bearbeitung 3 im Programmfenster sichtbar", sicht() is True)
    pruefe("Programmfenster gerollt", pg.evaluate("document.querySelector('#cam-kanaele').scrollTop") > 0)
    pg.click("[data-block='0'] [data-camblock='code']"); pg.wait_for_timeout(400)
    pruefe("Bearbeitung 1 wieder sichtbar", sicht() is True)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
