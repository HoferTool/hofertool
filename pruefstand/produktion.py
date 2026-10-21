# Produktion in React: Tag und Woche, Datum blättern, Zählerstand
# speichern und zurücknehmen, Zustand ändern, und die noch
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
    # Erste Zahl heute: Frage „Wurde heute schon produziert?“ → Ja
    feld.fill("777"); feld.press("Enter"); pg.wait_for_timeout(600); pg.locator(".dialog-huelle [data-w='ja']").click() if pg.locator(".dialog-huelle [data-w='ja']").count() else None; pg.wait_for_timeout(800)
    gespeichert = pg.evaluate(f"TEST.daten.production_records.filter(z => z.machine_id === '{mid}' && z.quantity === 777).length")
    if not gespeichert: fehler.append("Zählerstand nicht gespeichert")
    if pg.locator(f".menge[data-maschine='{mid}']").input_value() != "777": fehler.append("Feld zeigt den Wert nicht")
    pg.click("#rueck-knopf"); pg.wait_for_timeout(800)
    if pg.evaluate(f"TEST.daten.production_records.filter(z => z.machine_id === '{mid}' && z.quantity === 777).length"):
        fehler.append("Rückgängig wirkt nicht")
    if pg.locator(f".menge[data-maschine='{mid}']").input_value() == "777": fehler.append("Feld nach Rückgängig alt")

    # Keine Suche mehr (ersetzt durch Typknöpfe, Test typfilter.py);
    # mit nur einem Typ im Park gibt es auch keine Knöpfe
    if pg.locator("#p-suche").count(): fehler.append("Suchfeld noch da")
    if pg.locator("#typwahl").count(): fehler.append("Typknöpfe bei nur einem Typ")

    # Zustand ändern
    knopf = pg.locator("[data-auftrag-status]").first
    jid = knopf.get_attribute("data-auftrag-status")
    knopf.click(); pg.wait_for_selector(".dialog-huelle [data-w='geplant']")
    if pg.locator(".dialog-huelle [data-w='qs']").count(): fehler.append("QS Check noch wählbar")
    pg.click(".dialog-huelle [data-w='geplant']")
    pg.wait_for_timeout(900)
    zustand = pg.evaluate(f"TEST.daten.jobs.find(j => j.id === '{jid}').plan_status")
    if zustand != "geplant": fehler.append("Zustand nicht gesetzt: " + str(zustand))
    pg.screenshot(path="produktion.png")

    # Alte Reiter
    # Die Beispieldaten beginnen am Montag dieser Woche — an einem Montag
    # ist darum noch nichts im Verzug. Ein laufender Auftrag bekommt
    # einen Beginn vor zwei Wochen ohne Stückzahl, dann ist er sicher
    # im Verzug, egal an welchem Wochentag der Test läuft.
    pg.evaluate("""(() => {
      const j = TEST.daten.jobs.find(x => x.plan_status === 'laeuft' && x.target_quantity);
      const d = new Date(); d.setDate(d.getDate() - 14);
      j.planned_from = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      j.planned_days = 30; j.stand = 0;
    })()""")
    pg.click("[data-unter='produktion/fortschritt']"); pg.wait_for_selector(".fo-zeile")
    alle = pg.locator(".fo-zeile").count()
    pg.select_option("#fo-nur", "verzug"); pg.wait_for_timeout(200)
    verzug = pg.locator(".fo-zeile").count()
    if not (0 < verzug < alle): fehler.append(f"Filter Verzug wirkt nicht ({verzug} von {alle})")
    pg.select_option("#fo-nur", "alle")
    # Auftragsfenster aus dem Fortschritt: Speichern frischt den
    # Fortschritt auf und zeichnet nicht die Planwand hinein
    pg.locator(".fo-zeile").first.click(); pg.wait_for_selector("#pl-ja")
    pg.click("#pl-ja"); pg.wait_for_timeout(1200)
    if pg.locator("#prod-inhalt .pw-rolle, #prod-inhalt .pw-balken").count(): fehler.append("Planwand im Fortschritt gezeichnet")
    if pg.locator(".fo-zeile").count() != alle: fehler.append("Fortschritt nach Speichern falsch")
    if pg.locator(".dialog-huelle").count(): fehler.append("Auftragsfenster bleibt offen")
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(700); pg.click("[data-unter='maschinen/verwalten']"); pg.wait_for_selector("#park-reiter"); pg.wait_for_timeout(500)
    # Maschine bearbeiten: neuer Name kommt an und steht in der Liste
    knopf = pg.locator("[data-masch-um]").first
    mid = knopf.get_attribute("data-masch-um")
    knopf.click(); pg.wait_for_selector(".dialog-huelle input[name='name'], .dialog-huelle input")
    feld = pg.locator(".dialog-huelle input").first
    feld.fill("Prüfmaschine 99"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(1200)
    if pg.evaluate(f"TEST.daten.machines.find(m => m.id === '{mid}').name") != "Prüfmaschine 99":
        fehler.append("Maschine nicht umbenannt")
    if "Prüfmaschine 99" not in pg.inner_text("#park-inhalt"): fehler.append("Neuer Maschinenname nicht sichtbar")
    # Ausschalten fragt nach und blendet die Zeile aus
    pg.locator(f"[data-masch-aktiv='{mid}']").click(); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(1200)
    if pg.evaluate(f"TEST.daten.machines.find(m => m.id === '{mid}').is_active") is not False:
        fehler.append("Maschine nicht ausgeschaltet")
    if pg.locator(f"[data-masch-aktiv='{mid}']").inner_text() != "Ein": fehler.append("Knopf zeigt nicht Ein")
    pg.locator(f"[data-masch-aktiv='{mid}']").click(); pg.wait_for_timeout(1200)
    # Zweiter Park als Unterreiter; Typen sind seit 1.136.0 ein eigener Reiter
    if pg.locator("[data-parkreiter='typen']").count(): fehler.append("Typen noch unter den Parks")
    zweiter = pg.locator("[data-parkreiter]").nth(1)
    if zweiter.count():
        zweiter.click(); pg.wait_for_timeout(500)
        if not pg.locator("#park-inhalt .karte").count(): fehler.append("Zweiter Park leer")
    pg.click("[data-unter='maschinen/typen']"); pg.wait_for_timeout(800)
    if not pg.locator("[data-mansicht='typen'].aktiv").count(): fehler.append("Reiter Typen nicht aktiv")
    if pg.locator("#park-reiter").count(): fehler.append("Reiter Typen zeigt Parkreiter")
    if pg.locator("[data-typ-auf]").count():
        pg.locator("[data-typ-auf]").first.click(); pg.wait_for_selector("#typ-zurueck")
        if pg.locator("#park-reiter").count(): fehler.append("Geöffneter Typ zeigt noch die Parkreiter")
        pg.click("#typ-zurueck"); pg.wait_for_selector("[data-mansicht='typen'].aktiv", state="attached"); pg.wait_for_selector("[data-typ-auf]")
    else: fehler.append("Keine Typen im Prüfstand")
    if pg.locator("#mseite").count() != 1: fehler.append("mseite nicht genau einmal")
    pg.locator("h1").click(); pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    if not pg.locator("[data-mansicht='uebersicht'].aktiv").count(): fehler.append("Escape springt nicht auf Maschinen")
    br.close()
print("Produktion | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
