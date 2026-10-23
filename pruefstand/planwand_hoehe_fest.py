# Die Tafel darf nicht von selbst länger werden (Wunsch Patrick
# 22. Oktober 2026): Ist die Seite ein Stück nach unten gerollt, wurde
# die Höhe ab dem Fensterrand gemessen, und jedes Auffrischen machte die
# Tafel um genau so viel höher. Hier wird die Seite künstlich rollbar
# gemacht, ganz nach unten gerollt und mehrmals neu gemessen.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pruefstand as P
from playwright.sync_api import sync_playwright

fehler = []
srv = P.server_starten()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=P.CH, args=["--no-sandbox"])
    pg = br.new_page(viewport={"width": 1600, "height": 1000})
    pg.on("pageerror", lambda e: fehler.append(str(e)))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(
        status=200, content_type="application/javascript", body=P.FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**",
              "**://esm.sh/**", "**://*.supabase.co/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{P.PORT}/index.html")
    pg.wait_for_selector("#inhalt", timeout=20000)
    pg.evaluate("location.hash = '#planwand'")
    pg.wait_for_selector(".pw-tafel", timeout=20000)
    pg.wait_for_timeout(1200)
    pg.add_style_tag(content="#pw-inhalt { margin-bottom: 40px; }")
    pg.wait_for_timeout(300)
    hoehen = []
    for i in range(6):
        pg.evaluate("window.scrollTo(0, 99999); window.dispatchEvent(new Event('resize'))")
        pg.wait_for_timeout(250)
        hoehen.append(pg.evaluate("document.documentElement.scrollHeight"))
    ok = max(hoehen) - min(hoehen) <= 4
    print("ok  " if ok else "FEHLT", "Seitenhöhe bleibt gleich", hoehen)
    if not ok: fehler.append("Seite wächst: " + str(hoehen))
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
