# 1.749.0: Zeichen Ø und ± in der Leiste mit Farben im Einrichtblatt
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-blatt-neu='t1']"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    L = pg.locator("[data-eba-schriftzeile] [data-pf-zeichen]")
    pruefe("Zeichen Ø und ± in der Leiste", L.count() == 1 and "Ø" in L.inner_text() and "±" in L.inner_text())
    pg.click("[data-platz='T100']"); pg.wait_for_selector("[data-platzfenster='T100']")
    f = pg.locator("[data-platzfenster='T100'] [data-pf='taetigkeit']")
    f.click(); pg.keyboard.type("Bohren ")
    pg.wait_for_timeout(150)
    pruefe("keine Schreibleiste mit Ø über dem Feld", not pg.locator(".schreibleiste:visible").count())
    L.locator("[data-pf-zeichen-knopf='Ø']").click(); pg.keyboard.type("5 ")
    L.locator("[data-pf-zeichen-knopf='±']").click(); pg.keyboard.type("0.1")
    t = f.inner_text()
    pruefe("Text: " + repr(t), t.strip() == "Bohren Ø5 ±0.1")
    pg.screenshot(path="/tmp/claude-0/zeichen_eb.png")
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
