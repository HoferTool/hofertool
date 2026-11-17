# HOFERCAM: Knopf „+ Aus Modul“. Seit 1.588.0 Auswahl der Module, die Wahl
# öffnet das Modul leer in einem eigenen Tab, „Einfügen in HOFERCAM“ setzt
# den Code dort in die Bearbeitung nach der Zeile mit der Schreibmarke;
# die Arbeit im Reiter des Moduls bleibt unberührt.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def zeilen(t): return [z for z in (t or "").split("\n") if z.strip()]
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
    # Im Reiter Bohren / Fräsen eine eigene Arbeit: anderer Teil-Ø
    pg.wait_for_selector("[data-unter='nc/bohren']"); pg.click("[data-unter='nc/bohren']"); pg.wait_for_selector("#bf-code")
    pg.fill("[data-bf='teilD']", "33"); pg.press("[data-bf='teilD']", "Enter"); pg.wait_for_timeout(300)
    bfReiter = zeilen(pg.text_content("#bf-code"))
    pg.click("[data-unter='nc/cam']"); pg.wait_for_selector("#cam-kanaele"); pg.click("#cam-neu-dreh")
    cb = "[data-block='0'] [data-camblock='code']"
    pg.fill(cb, "G0Z1.\nG0Z9.")
    pg.click(cb); pg.keyboard.press("Control+Home"); pg.keyboard.press("End")
    pg.click("[data-cammodul-auf='0']")
    wahl = pg.eval_on_selector_all("[data-cammodul-wahl]", "e => e.map(x => x.dataset.cammodulWahl)")
    pruefe("Alle Module zur Wahl", wahl == ["kontur", "bohren", "entgraten", "cachse", "gravur", "dxf"])
    with ctx.expect_page() as neu:
        pg.click("[data-cammodul-wahl='bohren']")
    tab = neu.value
    tab.on("pageerror", lambda e: fehler.append("TAB-SEITENFEHLER: " + str(e)[:160]))
    tab.wait_for_selector("#bf-code", timeout=15000)
    pruefe("Auswahl wieder zu", pg.locator("[data-cammodul]").count() == 0)
    pruefe("Tab zeigt Modul mit Einfügen", tab.locator("[data-ncmodultab='bohren'] [data-ncmodultab-einfuegen]").count() == 1)
    pruefe("Tab ohne Menü", not tab.is_visible(".nav"))
    pruefe("Tab leer: Teil-Ø Vorgabe", tab.input_value("[data-bf='teilD']") != "33")
    tab.fill("[data-bf='zStirn']", "-2"); tab.press("[data-bf='zStirn']", "Enter"); tab.wait_for_timeout(300)
    bfTab = zeilen(tab.text_content("#bf-code"))
    pruefe("Code im Tab anders als im Reiter", bfTab != bfReiter)
    tab.screenshot(path="/tmp/claude-0/cam_modul_tab.png")
    tab.click("[data-ncmodultab-einfuegen]")
    tab.wait_for_event("close", timeout=5000)
    pruefe("Tab nach Einfügen zu", tab.is_closed())
    neuCode = zeilen(pg.input_value(cb))
    # Ohne Vor- und Nachspann (im Prüfstand keiner): genau der Code des Tabs
    pruefe("Nach der Zeile mit der Schreibmarke eingesetzt", neuCode == ["G0Z1."] + bfTab + ["G0Z9."])
    k1 = pg.eval_on_selector_all("[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Im Programm Kanal 1", bfTab[-1] in k1)
    # Die Arbeit im Reiter bleibt
    pg.click("[data-unter='nc/bohren']"); pg.wait_for_selector("#bf-code")
    pruefe("Reiter Bohren unverändert", pg.input_value("[data-bf='teilD']") == "33" and zeilen(pg.text_content("#bf-code")) == bfReiter)
    # Einfügen, während HOFERCAM nicht offen ist (anderer Reiter)
    pg.click("[data-unter='nc/cam']"); pg.wait_for_selector(cb)
    pg.click(cb); pg.keyboard.press("Control+End")
    pg.click("[data-cammodul-auf='0']")
    with ctx.expect_page() as neu:
        pg.click("[data-cammodul-wahl='kontur']")
    t2 = neu.value; t2.wait_for_selector("#kt-code", timeout=15000)
    pruefe("Kontur im Tab", t2.locator("[data-ncmodultab='kontur']").count() == 1)
    kt = zeilen(t2.text_content("#kt-code"))
    print("Kontur-Code:", kt[:2])
    pg.click("[data-unter='nc/dxf']"); pg.wait_for_timeout(300)
    if t2.is_disabled("[data-ncmodultab-einfuegen]"):
        pruefe("Ohne gültige Kontur kein Einfügen", "Noch keine" in " ".join(kt) or not kt)
        t2.close()
    else:
        t2.click("[data-ncmodultab-einfuegen]"); t2.wait_for_event("close", timeout=5000)
        pg.click("[data-unter='nc/cam']"); pg.wait_for_selector(cb)
        pruefe("Kontur am Ende eingefügt", zeilen(pg.input_value(cb))[-len(kt):] == kt)
    pg.screenshot(path="/tmp/claude-0/cam_modul.png")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
