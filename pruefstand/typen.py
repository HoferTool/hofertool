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
    # Seit 1.175.0 kein Reiter Typen mehr: alles im Fenster „⚙ Typ“
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(700)
    pruefe("kein Reiter Typen", pg.locator("[data-unter='maschinen/typen'], [data-mansicht]").count() == 0)
    pg.wait_for_selector("[data-mpark]"); print("Parks:", pg.locator("[data-mpark]").evaluate_all("l => l.map(x => x.dataset.mpark)"))
    pg.locator("[data-mpark='p-lang']").click()
    pg.wait_for_selector("[data-mtyp-einst='t1']"); pg.wait_for_timeout(400)

    # Neuer Typ geht gleich als Fenster auf, dann umbenennen und Längen
    pg.click("#typ-neu"); pg.locator(".dialog-huelle input").first.fill("Citizen L20"); ja(pg); pg.wait_for_timeout(1000)
    neu = pg.evaluate("(TEST.daten.machine_types.find(t => t.name === 'Citizen L20') || {}).id")
    pruefe("Typ angelegt, Fenster offen", bool(neu) and pg.locator("#typ-fenster").count() == 1 and "Citizen L20" in pg.inner_text("#typ-fenster"))
    pg.click("#typ-bearbeiten"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pruefe("Bearbeiten fragt nach Längen", pg.locator(".dialog-huelle").last.inner_text().count("mm") >= 2 or not pg.evaluate("'stangen_mm' in TEST.daten.machine_types[0]"))
    pg.locator(".dialog-huelle").last.locator("input").first.fill("Citizen L20 VIII")
    if pg.evaluate("'stangen_mm' in TEST.daten.machine_types[0]"):
        pg.locator(".dialog-huelle").last.locator("input").nth(2).fill("3200")
    ja(pg); pg.wait_for_timeout(900)
    pruefe("Typ umbenannt", "Citizen L20 VIII" in pg.inner_text("#typ-fenster"))
    if pg.evaluate("'stangen_mm' in TEST.daten.machine_types[0]"):
        pruefe("Stangenlänge gespeichert", pg.evaluate(f"TEST.daten.machine_types.find(t => t.id === '{neu}').stangen_mm") == 3200
               and "3'200" in pg.inner_text("#typ-laengen"))
    pg.click("#typ-loeschen"); ja(pg); pg.wait_for_timeout(900)
    pruefe("Typ gelöscht, Fenster zu", pg.evaluate(f"!TEST.daten.machine_types.some(t => t.id === '{neu}')") and pg.locator("#typ-fenster").count() == 0)

    # Aufbau von Star SR-32J
    pg.locator("[data-mtyp-einst='t1']").click(); pg.wait_for_selector("#typ-fenster #path-neu"); pg.wait_for_timeout(600)
    pruefe("Aufbau ohne Parkreiter", pg.locator("#park-reiter").count() == 0)
    pruefe("Beide Paths mit Plätzen", pg.locator("[data-path-um]").count() == 2 and pg.locator("[data-platz='sl1']").count() == 1)
    pruefe("Plätze zeigen Toolnummer", "T100" in pg.inner_text("[data-platz='sl1']"))
    pruefe("Allgemeine Dokumente weg", pg.locator("#typ-dokumente").count() == 0 and "Allgemeine Dokumente" not in pg.inner_text("body"))

    # Path anlegen
    pg.click("#path-neu"); pg.locator(".dialog-huelle input").first.fill("Path 9"); ja(pg); pg.wait_for_timeout(900)
    path = pg.evaluate("(TEST.daten.type_paths.find(p => p.name === 'Path 9') || {}).id")
    pruefe("Path angelegt und sichtbar", bool(path) and pg.locator(f"[data-platz-neu='{path}']").count() == 1)
    pruefe("Typ bleibt offen", pg.locator("#typ-fenster").count() == 1)
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

    # Escape schliesst nur das Fenster
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    pruefe("Escape schliesst das Fenster", pg.locator("#typ-fenster").count() == 0 and pg.locator("[data-mtyp='t1']").count() == 1)
    pg.click("[data-pfad='0']"); pg.wait_for_timeout(400); pg.click("[data-mpark='p-kurz']")
    pg.locator("[data-mtyp-einst='t2']").click(); pg.wait_for_selector("#typ-fenster"); pg.wait_for_timeout(500)
    pruefe("Leerer Typ zeigt Hinweis", "Noch kein Path" in pg.inner_text("#typ-fenster"))
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
