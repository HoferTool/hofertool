# Produktion in React: Tag und Woche, Datum blättern, Zählerstand
# speichern und zurücknehmen, Zustand ändern, Suche, und die noch
# alten Reiter (Fortschritt, Maschinen und Typen) laufen darin.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#produktion'")
    pg.wait_for_selector("#raster .menge, #raster .kein-feld"); pg.wait_for_timeout(500)

    # Woche: Tabelle mit Feldern; Tag: Karten
    pg.click("[data-modus='woche']"); pg.wait_for_selector(".raster--woche")
    woche = pg.inner_text("#zeitraum")
    pg.click("#vor"); pg.wait_for_timeout(300)
    if pg.inner_text("#zeitraum") == woche: fehler.append("Vor blättert nicht")
    pg.click("#heute"); pg.wait_for_timeout(300)
    if pg.inner_text("#zeitraum") != woche: fehler.append("Heute springt nicht zurück")
    pg.click("[data-modus='tag']"); pg.wait_for_selector(".mkarten")

    # Zählerstand eintragen, gespeichert, zurücknehmen
    feld = pg.locator(".mkarten .menge:not([disabled])").first
    mid = feld.get_attribute("data-maschine")
    feld.fill("777"); feld.press("Enter"); pg.wait_for_timeout(800)
    gespeichert = pg.evaluate(f"TEST.daten.production_records.filter(z => z.machine_id === '{mid}' && z.quantity === 777).length")
    if not gespeichert: fehler.append("Zählerstand nicht gespeichert")
    if pg.locator(f".menge[data-maschine='{mid}']").input_value() != "777": fehler.append("Feld zeigt den Wert nicht")
    pg.click("#rueck-knopf"); pg.wait_for_timeout(800)
    if pg.evaluate(f"TEST.daten.production_records.filter(z => z.machine_id === '{mid}' && z.quantity === 777).length"):
        fehler.append("Rückgängig wirkt nicht")
    if pg.locator(f".menge[data-maschine='{mid}']").input_value() == "777": fehler.append("Feld nach Rückgängig alt")

    # Suche nach Maschine, auch parkübergreifend
    pg.fill("#p-suche", "zzz"); pg.wait_for_timeout(200)
    if "Nichts gefunden" not in pg.inner_text("#raster"): fehler.append("Suche ohne Treffer zeigt keinen Hinweis")
    pg.fill("#p-suche", "Tornos"); pg.wait_for_timeout(500)
    if not pg.locator(".mkarte").count(): fehler.append("Suche findet Tornos nicht")
    pg.fill("#p-suche", ""); pg.wait_for_timeout(300)

    # Zustand ändern
    knopf = pg.locator("[data-auftrag-status]").first
    jid = knopf.get_attribute("data-auftrag-status")
    knopf.click(); pg.wait_for_selector(".dialog-huelle [data-w='qs']"); pg.click(".dialog-huelle [data-w='qs']")
    pg.wait_for_timeout(900)
    zustand = pg.evaluate(f"TEST.daten.jobs.find(j => j.id === '{jid}').plan_status")
    if zustand != "qs": fehler.append("Zustand nicht gesetzt: " + str(zustand))
    pg.screenshot(path="produktion.png")

    # Alte Reiter
    pg.click("[data-ansicht='fortschritt']"); pg.wait_for_timeout(900)
    if "Wird geladen" in pg.inner_text("#prod-inhalt"): fehler.append("Fortschritt lädt ewig")
    pg.click("[data-ansicht='maschinen']"); pg.wait_for_selector("#park-reiter"); pg.wait_for_timeout(500)
    pg.locator("[data-parkreiter='typen']").click(); pg.wait_for_timeout(800)
    if not pg.locator("[data-parkreiter='typen'].aktiv").count(): fehler.append("Typen-Unterreiter nicht aktiv")
    if pg.locator("#prod-inhalt").count() != 1: fehler.append("prod-inhalt nicht genau einmal")
    pg.locator("h1").click(); pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    if not pg.locator("[data-ansicht='erfassen'].aktiv").count(): fehler.append("Escape springt nicht auf Erfassen")
    br.close()
print("Produktion | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
