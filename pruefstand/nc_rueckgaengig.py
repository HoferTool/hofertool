# Strg + Z in den NC-PRO-Modulen (1.613.0, Wunsch Patrick 17. November 2026:
# „man soll jegliche Sachen mit Ctrl Z rückgängig machen können … überall im Tool“).
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
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/bohren']"); pg.click("[data-unter='nc/bohren']")
    pg.wait_for_selector("#bf-code")
    f = pg.locator("[data-bf]").filter(has=None).first
    name = pg.eval_on_selector("input[data-bf]", "e => e.dataset.bf")
    sel = f"input[data-bf='{name}']"
    vorher = pg.input_value(sel)
    pg.fill(sel, "77"); pg.press(sel, "Tab"); pg.wait_for_timeout(900)
    pruefe("Feld geändert", pg.input_value(sel) == "77")
    pg.evaluate("document.activeElement.blur()"); pg.keyboard.press("Control+z"); pg.wait_for_timeout(300)
    pruefe("Strg + Z in Bohren / Fräsen", pg.input_value(sel) == vorher)
    br.close()
print("Fehler:", fehler or "keine")
