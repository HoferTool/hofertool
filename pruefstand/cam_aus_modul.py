# HOFERCAM (seit 1.436.0): Knopf „+ Aus Modul“ übernimmt den aktuellen
# NC-Code aus Bohren / Fräsen und DXF in eine Bearbeitung.
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
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele"); pg.click("#cam-neu-dreh")
    cb = "[data-block='0'] [data-camblock='code']"
    pg.click("[data-cammodul-auf='0']")
    # NC-PRO öffnet zuerst HOFERCONTUR, darum ist nur sie schon wählbar (seit 1.530.0)
    opt0 = dict(pg.eval_on_selector_all("[data-cammodul-wahl] option", "e => e.map(o => [o.value, o.disabled])"))
    pruefe("Nur geöffnete Module wählbar", opt0.get("bohren") is True and opt0.get("dxf") is True)
    pg.click("[data-cammodul] .cam-vorlage__kopf .knopf")
    # Bohren / Fräsen öffnen, Code merken
    pg.click("[data-unter='nc/bohren']"); pg.wait_for_selector("#bf-code")
    bf = [z for z in pg.text_content("#bf-code").split("\n") if z.strip()]
    pg.click("[data-unter='nc/dxf']"); pg.wait_for_timeout(500)
    pg.click("[data-unter='nc/cam']"); pg.wait_for_selector(cb)
    pg.fill(cb, "G0Z1.\nG0Z9.")
    pg.click(cb); pg.keyboard.press("Control+Home"); pg.keyboard.press("End")
    pg.click("[data-cammodul-auf='0']")
    gesperrt = pg.eval_on_selector_all("[data-cammodul-wahl] option", "e => e.map(o => [o.value, o.disabled])")
    pruefe("Bohren und DXF wählbar, Gravur gesperrt", ["bohren", False] in gesperrt and ["dxf", False] in gesperrt and ["gravur", True] in gesperrt)
    pg.select_option("[data-cammodul-wahl]", "bohren")
    pruefe("Vorschau zeigt Bohren-Code", pg.text_content("[data-cammodul-vorschau]").split("\n") == bf)
    pg.click("[data-cammodul-einfuegen]")
    neu = pg.input_value(cb).split("\n")
    pruefe("Nach der Zeile mit der Schreibmarke eingesetzt", neu == ["G0Z1."] + bf + ["G0Z9."])
    pruefe("Feld wieder zu", pg.locator("[data-cammodul]").count() == 0)
    k1 = pg.eval_on_selector_all("[data-kanal='1'] .cam-text", "e => e.map(x => x.textContent)")
    pruefe("Im Programm Kanal 1", bf[-1] in k1)
    # HOFERCONTUR (seit 1.530.0)
    pg.click("[data-unter='nc/kontur']"); pg.wait_for_selector("#kt-code")
    kt = [z for z in pg.text_content("#kt-code").split("\n") if z.strip()]
    pg.click("[data-unter='nc/cam']"); pg.wait_for_selector(cb)
    pg.click("[data-cammodul-auf='0']")
    opt = pg.eval_on_selector_all("[data-cammodul-wahl] option", "e => e.map(o => [o.value, o.disabled])")
    print("Kontur-Code:", kt[:3], opt[:2])
    if "Noch keine" in " ".join(kt):
        pruefe("Kontur ohne gültige Kontur gesperrt", ["kontur", True] in opt)
    else:
        pruefe("Kontur wählbar", ["kontur", False] in opt)
        pg.select_option("[data-cammodul-wahl]", "kontur")
        pruefe("Vorschau zeigt Kontur-Code", [z for z in pg.text_content("[data-cammodul-vorschau]").split("\n") if z.strip()] == kt)
    pg.click("[data-cammodul] .cam-vorlage__kopf .knopf")
    # Nach Neuladen noch da
    pg.reload(); pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']"); pg.wait_for_selector("#cam-kanaele")
    if pg.locator("[data-cammodul-auf='0']").count() == 0: pg.click("#cam-neu-dreh")
    pg.click("[data-cammodul-auf='0']")
    pruefe("Nach Neuladen noch wählbar", not pg.is_disabled("[data-cammodul-einfuegen]"))
    pg.screenshot(path="/tmp/claude-0/cam_modul.png")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
