# HOFERCAM (seit 1.603.0): Vorlage Einstich Mantel / Front mit Skizze,
# Schreibmarke in der Bezeichnung bei neuer Bearbeitung, Datum mit
# Kalender und Taste H, HOFERCONTUR aus HOFERCAM leer.
import time, datetime
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

    # Datum: H = heute, Kalender
    pg.click("[data-cam='datum']"); pg.keyboard.press("h"); pg.wait_for_timeout(100)
    heute = datetime.date.today().strftime("%d.%m.%y")
    pruefe("Taste H trägt heute ein", pg.input_value("[data-cam='datum']") == heute)
    pg.fill("input.cam-datum__kalender", "2026-03-05"); pg.wait_for_timeout(100)
    pruefe("Kalender schreibt TT.MM.JJ", pg.input_value("[data-cam='datum']") == "05.03.26")
    pruefe("Knopf Kalender da", pg.locator("[data-cam-kalender]").count() == 1)
    # Datumstasten im ganzen Tool: T, W, M, J, Minus
    pg.click("[data-cam='datum']")
    for taste, soll in (("t", "06.03.26"), ("w", "13.03.26"), ("m", "13.04.26"), ("j", "13.04.27"), ("-", "12.04.27")):
        pg.keyboard.press(taste); pg.wait_for_timeout(60)
        pruefe("Datum Taste " + taste, pg.input_value("[data-cam='datum']") == soll)
    pg.evaluate("""() => { const i = document.createElement('input'); i.type = 'date'; i.id = 'probe-datum';
      i.value = '2026-01-31'; document.body.appendChild(i); }""")
    pg.focus("#probe-datum"); pg.keyboard.press("m"); pg.wait_for_timeout(60)
    pruefe("Datumsfeld 31.1. + M = 28.2.", pg.input_value("#probe-datum") == "2026-02-28")
    pg.keyboard.press("-"); pg.wait_for_timeout(60)
    pruefe("Datumsfeld Minus", pg.input_value("#probe-datum") == "2026-02-27")
    pg.evaluate("document.getElementById('probe-datum').remove()")

    # Neue Bearbeitung: Schreibmarke in der Bezeichnung
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(200)
    pruefe("Schreibmarke in Bezeichnung", pg.evaluate("document.activeElement && document.activeElement.dataset.camblock") == "bez")
    pg.keyboard.type("EINSTICH")
    pruefe("Tippen geht in Bezeichnung", pg.locator("[data-camblock='bez']").last.input_value() == "EINSTICH")

    # Vorlage Einstich
    pg.click("[data-camvorlage-auf='0']")
    pg.select_option("[data-camvorlage-wahl]", "einstich")
    pruefe("Skizze da", pg.locator("[data-camein-bild] svg").count() == 1)
    pruefe("Ohne Masse kein Einfügen", pg.locator("[data-camvorlage-einfuegen]").is_disabled())
    for n, v in [("D", "12"), ("Z", "5"), ("B", "3"), ("T", "1.5"), ("PB", "1.5"), ("PL", "3"), ("PR", "0.1")]:
        pg.fill(f"[data-camein='{n}']", v)
    pg.select_option("[data-camein-art='eoArt']", "F"); pg.fill("[data-camein='eo']", "0.2")
    pg.select_option("[data-camein-art='egArt']", "R"); pg.fill("[data-camein='eg']", "0.2")
    v = pg.text_content("[data-camvorlage-vorschau]") or ""
    pruefe("Kopfzeile Einstich", v.startswith("(EINSTICH MANTEL D12. Z5. B3. T1.5 OBEN F0.2 GRUND R0.2)"))
    pruefe("Schruppen 3 Stiche gleich verteilt", "G0X13.Z7.95" in v and "G0Z7.25" in v and "G0Z6.55" in v and v.count("G1X9.1") == 3)
    pruefe("Schlichten beide Seiten mit Fase und Radius", "(SCHLICHTEN ZUR STIRN)" in v and "(SCHLICHTEN ZUR BUECHSE)" in v
           and "G1X11.541Z6.471" in v and "G3X9.Z6.6R0.1" in v and "G2X9.Z7.9R0.1" in v)
    pg.fill("[data-camein='PL']", "1")
    pruefe("Platte zu kurz meldet", "zu kurz" in (pg.text_content("[data-camvorlage]") or "") and pg.locator("[data-camvorlage-einfuegen]").is_disabled())
    pg.fill("[data-camein='PL']", "3")
    pg.click("[data-camein-wahl='strat:schlichten']")
    v = pg.text_content("[data-camvorlage-vorschau]") or ""
    pruefe("Nur Schlichten", "(SCHRUPPEN)" not in v and "(SCHLICHTEN ZUR STIRN)" in v and pg.locator("[data-camein='FR']").count() == 0)
    pg.click("[data-camein-wahl='lage:front']"); pg.fill("[data-camein='D']", "10"); pg.fill("[data-camein='Z']", "0")
    v = pg.text_content("[data-camvorlage-vorschau]") or ""
    pruefe("Front aussen programmiert", "(EINSTICH FRONT DA10." in v and "(SCHLICHTEN AUSSEN)" in v and "G0X11.6Z-0.5" in v and "G1X7.6Z1.5" in v)
    pg.screenshot(path="cam_einstich_front.png")
    pg.click("[data-camein-wahl='lage:mantel']"); pg.fill("[data-camein='D']", "12"); pg.fill("[data-camein='Z']", "5")
    pg.click("[data-camein-wahl='strat:beide']")
    pg.locator("[data-camein-bild]").screenshot(path="cam_einstich_mantel.png")
    pg.click("[data-camvorlage-einfuegen]"); pg.wait_for_timeout(150)
    pruefe("Eingefügt", pg.locator("[data-camvorlage]").count() == 0)

    # HOFERCONTUR im Tab für HOFERCAM: leer
    tab = ctx.new_page()
    tab.goto(f"http://127.0.0.1:{PORT}/index.html#/nc/modul/kontur?z=probe", wait_until="domcontentloaded")
    tab.wait_for_selector("[data-ncmodultab='kontur']", timeout=15000); tab.wait_for_timeout(400)
    pruefe("HOFERCONTUR aus HOFERCAM ohne Elemente", tab.locator("[data-ktel]").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
