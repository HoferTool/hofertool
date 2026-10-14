# Webseiten im Menü: Just Eat (1.12.0) öffnet am Computer ein eigenes
# Fenster. Google (1.11.0) ist seit 1.55.3 weg (Wunsch Patrick 14. Oktober 2026).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1400, "height": 900})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    ctx.route("**://www.just-eat.ch/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>Just Eat</title>"))
    ctx.route("**://www.google.ch/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>Google</title>"))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(600)
    # Seit 1.55.3 ist Google aus dem Menü weg (Wunsch Patrick 14. Oktober 2026)
    namen = pg.eval_on_selector_all(".nav .nav__punkt .nav__text", "e => e.map(x => x.textContent)")
    pruefe("Kein Google im Menü", pg.locator(".nav__punkt--google").count() == 0 and "Google" not in namen)
    tfarbe = pg.evaluate("getComputedStyle(document.querySelector('.nav__punkt--justeat .nav__text')).color")
    je = pg.locator(".nav__punkt--justeat")
    pruefe("Knopf Just Eat im Menü", je.count() == 1 and "Just Eat" in je.inner_text())
    farbe = pg.evaluate("getComputedStyle(document.querySelector('.nav__punkt--justeat path')).fill")
    pruefe("Just-Eat-Logo einfarbig wie die Schrift", farbe == tfarbe)
    with ctx.expect_page() as neu2:
        je.click()
    f2 = neu2.value; f2.wait_for_load_state()
    pruefe("Fenster mit Just Eat offen", "just-eat.ch" in f2.url)
    hupft = pg.evaluate("getComputedStyle(document.querySelector('.nav__punkt--justeat .nav__zeichen')).animationName")
    pruefe("Zeichen hüpft beim Klick", hupft == "fx-zeichen")
    pg.mouse.move(600, 600)
    pg.screenshot(path="/tmp/google_knopf.png", clip={"x": 0, "y": 0, "width": 300, "height": 500})
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
