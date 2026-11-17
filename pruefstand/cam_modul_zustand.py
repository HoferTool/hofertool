# HOFERCAM „+ Aus Modul“ (seit 1.617.0): öffnet man das Modul aus derselben
# Bearbeitung wieder, stehen die Einstellungen von vorher da; eine andere
# Bearbeitung startet leer. Gemerkt auch, wenn der Tab ohne Einfügen zugeht.
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
    pg.wait_for_selector("#cam-kanaele"); pg.click("#cam-neu-dreh"); pg.click("#cam-neu-dreh")
    def oeffnen(nr, art, sel):
        pg.click(f"[data-block='{nr}'] [data-camblock='code']")
        pg.click(f"[data-cammodul-auf='{nr}']")
        if pg.locator("[data-cammodul-quelle='tab']").count(): pg.click("[data-cammodul-quelle='tab']")
        with ctx.expect_page() as neu:
            pg.click(f"[data-cammodul-wahl='{art}']")
        t = neu.value
        t.on("pageerror", lambda e: fehler.append("TAB-SEITENFEHLER: " + str(e)[:160]))
        t.wait_for_selector(sel, timeout=15000)
        return t
    # Bohren / Fräsen aus Bearbeitung 1
    t = oeffnen(0, "bohren", "#bf-code")
    leer = t.input_value("[data-bf='teilD']")
    t.fill("[data-bf='teilD']", "37"); t.press("[data-bf='teilD']", "Enter"); t.wait_for_timeout(300)
    t.click("[data-ncmodultab-einfuegen]"); t.wait_for_event("close", timeout=5000)
    t = oeffnen(0, "bohren", "#bf-code")
    pruefe("Gleiche Bearbeitung: Teil-Ø wieder 37", t.input_value("[data-bf='teilD']") == "37")
    t.close()
    t = oeffnen(1, "bohren", "#bf-code")
    pruefe("Andere Bearbeitung startet leer", t.input_value("[data-bf='teilD']") == leer)
    t.close()
    # C-Achse: Tab ohne Einfügen schliessen merkt trotzdem
    t = oeffnen(1, "cachse", "[data-cax='sw']")
    t.fill("[data-cax='sw']", "13"); t.press("[data-cax='sw']", "Enter"); t.wait_for_timeout(300)
    t.close(run_before_unload=True); pg.wait_for_timeout(500)
    t = oeffnen(1, "cachse", "[data-cax='sw']")
    pruefe("C-Achse nach Schliessen gemerkt", t.input_value("[data-cax='sw']") == "13")
    t.close()
    t = oeffnen(0, "cachse", "[data-cax='sw']")
    pruefe("C-Achse in Bearbeitung 1 leer", t.input_value("[data-cax='sw']") != "13")
    t.close()
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
