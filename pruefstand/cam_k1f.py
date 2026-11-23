# HOFERCAM (seit 1.728.0): SW-20 angetriebener Frontbohrapparat in Kanal 1
# (T500/T600) wie T1300 in Kanal 3, Knopf nur mit Bestückung "angetrieben",
# Programm Kanal 1 mit T500(, M36S…T05, M1892(HD AUS), Simulation ohne Fehler.
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
    pg = br.new_context(viewport={"width": 1600, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    pg.select_option("#cam-typwahl", "star-sw20"); pg.wait_for_timeout(400)
    pruefe("Ohne Bestückung gesperrt", pg.is_disabled("#cam-neu-k1f"))
    pg.click("[data-cam-swfront='500'] input"); pg.wait_for_timeout(150)
    pruefe("T500 fest: nur fest frei", (not pg.is_disabled("#cam-neu-front")) and pg.is_disabled("#cam-neu-k1f"))
    pg.select_option("[data-cam-swfrontart='500']", "an"); pg.wait_for_timeout(150)
    pruefe("T500 angetrieben: Knopf frei", not pg.is_disabled("#cam-neu-k1f"))
    pruefe("Knopftext T500", "T500" in pg.inner_text("#cam-neu-k1f"))
    pg.click("#cam-neu-k1f"); pg.wait_for_timeout(400)
    pg.fill("[data-camblock='bez']", "BOHREN"); pg.wait_for_timeout(400)
    k1 = pg.inner_text("#cam-kanaele")
    pruefe("T500( im Programm", "T500(" in k1)
    pruefe("M36S…T05", "T05" in k1 and "M36S" in k1)
    pruefe("HD AUS", "M1892" in k1)
    pruefe("Schild K1", pg.inner_text("[data-camblock-kanal='0']").strip() == "K1")
    pg.click("#cam-sim-auf"); pg.wait_for_timeout(2000)
    pruefe("Simulation offen", pg.locator("canvas").count() > 0)
    br.close()
print("Fehler:", fehler or "keine")
