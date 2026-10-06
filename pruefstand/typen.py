# Maschinentypen in der Produktion: Liste, Typ anlegen und umbenennen,
# Aufbau öffnen, Path und Werkzeugplatz anlegen, Platz ziehen, löschen, zurück
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def ja(pg):
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(500)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#produktion'")
    pg.wait_for_selector("#raster .menge, #raster .kein-feld"); pg.wait_for_timeout(500)
    pg.click("[data-unter='produktion/maschinen']"); pg.wait_for_selector("#park-reiter")
    pg.locator("[data-parkreiter='typen']").click(); pg.wait_for_selector("[data-typ-auf]")
    pruefe("Liste mit beiden Typen", pg.locator("[data-typ-auf]").count() == 2 and "Star SR-32J" in pg.inner_text("#park-inhalt"))

    # Neuer Typ, dann umbenennen
    pg.click("#typ-neu"); pg.locator(".dialog-huelle input").first.fill("Citizen L20"); ja(pg); pg.wait_for_timeout(800)
    neu = pg.evaluate("(TEST.daten.machine_types.find(t => t.name === 'Citizen L20') || {}).id")
    pruefe("Typ angelegt und sichtbar", bool(neu) and "Citizen L20" in pg.inner_text("#park-inhalt"))
    pg.locator(f"[data-typ-um='{neu}']").click(); pg.locator(".dialog-huelle input").first.fill("Citizen L20 VIII"); ja(pg); pg.wait_for_timeout(800)
    pruefe("Typ umbenannt", "Citizen L20 VIII" in pg.inner_text("#park-inhalt"))
    pruefe("Typen-Reiter bleibt aktiv", pg.locator("[data-parkreiter='typen'].aktiv").count() == 1)
    pg.locator(f"[data-typ-weg='{neu}']").click(); ja(pg); pg.wait_for_timeout(800)
    pruefe("Typ gelöscht", pg.evaluate(f"!TEST.daten.machine_types.some(t => t.id === '{neu}')") and pg.locator(f"[data-typ-auf='{neu}']").count() == 0)

    # Aufbau von Star SR-32J
    pg.locator("[data-typ-auf='t1']").click(); pg.wait_for_selector("#typ-zurueck"); pg.wait_for_timeout(600)
    pruefe("Aufbau ohne Parkreiter", pg.locator("#park-reiter").count() == 0)
    pruefe("Beide Paths mit Plätzen", pg.locator("[data-path-um]").count() == 2 and pg.locator("[data-platz='sl1']").count() == 1)
    pruefe("Plätze zeigen Toolnummer", "T100" in pg.inner_text("[data-platz='sl1']"))
    pruefe("Allgemeine Dokumente weg", pg.locator("#typ-dokumente").count() == 0 and "Allgemeine Dokumente" not in pg.inner_text("body"))

    # Path anlegen
    pg.click("#path-neu"); pg.locator(".dialog-huelle input").first.fill("Path 9"); ja(pg); pg.wait_for_timeout(900)
    path = pg.evaluate("(TEST.daten.type_paths.find(p => p.name === 'Path 9') || {}).id")
    pruefe("Path angelegt und sichtbar", bool(path) and pg.locator(f"[data-platz-neu='{path}']").count() == 1)
    pruefe("Typ bleibt offen", pg.locator("#typ-zurueck").count() == 1)
    # Platz anlegen
    pg.locator(f"[data-platz-neu='{path}']").click(); pg.locator(".dialog-huelle input").first.fill("T900"); ja(pg); pg.wait_for_timeout(900)
    platz = pg.evaluate(f"(TEST.daten.type_slots.find(s => s.path_id === '{path}' && s.tool_nr === 'T900') || {{}}).id")
    pruefe("Platz angelegt und sichtbar", bool(platz) and pg.locator(f"[data-platz='{platz}']").count() == 1)
    # Platz ändern
    pg.locator(f"[data-platz-um='{platz}']").click(); pg.locator(".dialog-huelle input").first.fill("T950"); ja(pg); pg.wait_for_timeout(900)
    pruefe("Platz umbenannt", "T950" in pg.inner_text(f"[data-platz='{platz}']"))
    # Platz sl1 auf den neuen Path ziehen (mit der Maus, also sofort)
    a = pg.locator("[data-platz='sl1']").bounding_box(); z = pg.locator(f"[data-platz='{platz}']").bounding_box()
    pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2 + 10); pg.mouse.down()
    for i in range(1, 11):
        pg.mouse.move(a["x"] + (z["x"] + z["width"] * 0.8 - a["x"]) * i / 10, a["y"] + 10 + (z["y"] + z["height"] / 2 - a["y"] - 10) * i / 10)
        pg.wait_for_timeout(30)
    pg.mouse.up(); pg.wait_for_timeout(1200)
    pruefe("Platz auf anderen Path gezogen", pg.evaluate("TEST.daten.type_slots.find(s => s.id === 'sl1').path_id") == path)
    pruefe("Ziehen danach noch einmal möglich (einmal gebunden)", pg.locator("[data-platz='sl1'].platz--fassbar").count() == 1)
    # Platz und Path löschen
    pg.locator(f"[data-platz-weg='{platz}']").click(); ja(pg); pg.wait_for_timeout(900)
    pruefe("Platz gelöscht", pg.locator(f"[data-platz='{platz}']").count() == 0)
    pg.locator(f"[data-path-weg='{path}']").click(); ja(pg); pg.wait_for_timeout(900)
    pruefe("Path gelöscht", pg.locator(f"[data-platz-neu='{path}']").count() == 0)

    # Escape und Zurück
    pg.locator("h1").first.click(); pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    pruefe("Escape geht zur Typenliste", pg.locator("[data-typ-auf]").count() == 2 and pg.locator("#typ-zurueck").count() == 0)
    pg.locator("[data-typ-auf='t2']").click(); pg.wait_for_selector("#typ-zurueck"); pg.wait_for_timeout(500)
    pruefe("Leerer Typ zeigt Hinweis", "Noch kein Path" in pg.inner_text("#prod-inhalt"))
    pg.click("#typ-zurueck"); pg.wait_for_selector("[data-parkreiter='typen'].aktiv"); pg.wait_for_timeout(800)
    print("Typen nach Zurück:", pg.locator("[data-typ-auf]").count())
    pruefe("Zurück zur Liste", pg.locator("[data-typ-auf]").count() == 2)
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
