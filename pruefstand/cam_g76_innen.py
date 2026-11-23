# HOFERCAM (seit 1.727.0): Vorlage Gewindestrählen G76 aussen und innen.
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
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(200)
    pg.click("[data-camvorlage-auf='0']"); pg.click("[data-camvorlage-bild='g76']")
    vs = lambda: pg.text_content("[data-camvorlage-vorschau]") or ""
    pg.fill("[data-camvorlage-feld='D']", "10"); pg.fill("[data-camvorlage-feld='F']", "1")
    pg.fill("[data-camvorlage-feld='Z']", "-8")
    pg.wait_for_timeout(100)
    pruefe("Aussen X = 10 - 1.4 = 8.6: " + vs(), "G76X8.6Z-8." in vs())
    pruefe("Bild aussen", "Kern-Ø X" in (pg.text_content(".cam-vorlage__erkl") or ""))
    pg.click("[data-camvorlage-wahl='lage:innen']"); pg.wait_for_timeout(100)
    pruefe("Innen X = Nenn-Ø: " + vs(), "G76X10.Z-8." in vs())
    pruefe("Bild innen", "Nenn-Ø X" in (pg.text_content(".cam-vorlage__erkl") or ""))
    pg.locator(".cam-vorlage__erkl").screenshot(path="cam_g76_innen.png")
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
