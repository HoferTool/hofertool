# Google-Knopf im Menü (1.11.0, Wunsch Patrick 9. Oktober 2026): öffnet
# am Computer ein eigenes Fenster mit Google.
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
    ctx.route("**://www.google.ch/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>Google</title>"))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(600)
    knopf = pg.locator(".nav__punkt--google")
    pruefe("Knopf Google im Menü", knopf.count() == 1 and "Google" in knopf.inner_text())
    pg.screenshot(path="/tmp/google_vorher.png", clip={"x": 0, "y": 0, "width": 300, "height": 500})
    with ctx.expect_page() as neu:
        knopf.click()
    f = neu.value; f.wait_for_load_state()
    pruefe("Fenster mit Google offen", "google.ch" in f.url)
    pruefe("App bleibt, wo sie ist", "127.0.0.1" in pg.url)
    pg.screenshot(path="/tmp/google_knopf.png", clip={"x": 0, "y": 0, "width": 300, "height": 500})
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
