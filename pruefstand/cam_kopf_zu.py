# HOFERCAM (seit 1.581.0): Kopfdaten einklappen, eingeklappt eine Zeile mit den Werten
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
S = "/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/"
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
    pg.fill("[data-cam='A']", "17"); pg.fill("[data-cam='W']", "15")
    pg.click("#cam-kopf-zu")
    pruefe("Felder weg", pg.locator("[data-cam='A']").count() == 0)
    t = pg.text_content("#cam-kopf-werte"); print(t)
    pruefe("Zeile mit Werten", "17" in t and "15" in t)
    pg.screenshot(path=S + "kopf_zu.png")
    pg.reload(); pg.wait_for_selector("#cam-kanaele")
    pruefe("Bleibt eingeklappt nach Neuladen", pg.locator("[data-cam='A']").count() == 0)
    pg.click("#cam-kopf-zu")
    pruefe("Wieder offen", pg.locator("[data-cam='A']").count() == 1)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
