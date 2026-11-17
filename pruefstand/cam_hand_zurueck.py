# HOFERCAM (seit 1.619.0): eine Änderung im Programmfenster, die im NC-Code
# einer Bearbeitung liegt, kommt zurück ins Feld NC-Code der Bearbeitung und
# ist dann nicht mehr gelb; geänderte feste Zeilen bleiben gelb.
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
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele"); pg.click("#cam-neu-dreh")
    cb = "[data-block='0'] [data-camblock='code']"
    pg.fill(cb, "G0X9.6Z-0.6\nG1Z10.2F0.03\nG0X16.")
    pg.wait_for_timeout(200)
    zeilen = lambda: pg.eval_on_selector_all("[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    nr = next(int(pg.eval_on_selector(f"[data-kanal='1'] >> nth={i}", "e => e.dataset.nr")) for i, t in enumerate(zeilen()) if t == "G0X16.")
    z = pg.locator(f"[data-kanal='1'][data-nr='{nr}'] .cam-text")
    # Zeile G0X16. ändern
    z.click(); pg.keyboard.press("End"); pg.keyboard.press("Backspace"); pg.keyboard.type("5.5"); pg.keyboard.press("Tab")
    pg.wait_for_timeout(200)
    code = pg.input_value(cb)
    pruefe("NC-Code der Bearbeitung nachgeführt", code.split("\n")[-1] == "G0X165.5")
    pruefe("Nicht gelb", pg.locator("[data-kanal='1'].cam-zeile--hand").count() == 0)
    # feste Zeile (Werkzeugaufruf) ändern bleibt gelb
    nr2 = next(int(pg.eval_on_selector(f"[data-kanal='1'] >> nth={i}", "e => e.dataset.nr")) for i, t in enumerate(zeilen()) if t.startswith("T"))
    pg.locator(f"[data-kanal='1'][data-nr='{nr2}'] .cam-text").click(); pg.keyboard.press("End"); pg.keyboard.type("(X)"); pg.keyboard.press("Tab")
    pg.wait_for_timeout(200)
    pruefe("Feste Zeile bleibt gelb", pg.locator("[data-kanal='1'].cam-zeile--hand").count() == 1 and pg.input_value(cb).endswith("G0X165.5"))
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
