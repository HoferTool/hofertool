# Aufbau eines anderen Typs übernehmen: in einen leeren Typ, beim
# Anlegen eines neuen Typs, Dazunehmen und Ersetzen, Rückgängig
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def ja(pg):
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(700)
def wahl(pg, wert):
    pg.wait_for_selector(f".dialog-huelle [data-w='{wert}']"); pg.locator(f".dialog-huelle [data-w='{wert}']").last.click(); pg.wait_for_timeout(500)
PFADE = "(id) => TEST.daten.type_paths.filter(p => p.type_id === id)"
def zahlen(pg, typ):
    return pg.evaluate(f"""(() => {{ const p = TEST.daten.type_paths.filter(p => p.type_id === '{typ}');
      const ids = p.map(x => x.id); return [p.length, TEST.daten.type_slots.filter(s => ids.includes(s.path_id)).length]; }})()""")
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
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(700); pg.click("[data-unter='maschinen/verwalten']"); pg.wait_for_selector("#park-reiter")
    pg.locator("[data-parkreiter='typen']").click(); pg.wait_for_selector("[data-typ-auf]")
    vorlage = zahlen(pg, "t1")
    print("Vorlage t1:", vorlage)
    pruefe("Vorlage hat Paths und Plätze", vorlage[0] > 0 and vorlage[1] > 0)

    # In den leeren Typ t2 übernehmen
    pg.locator("[data-typ-auf='t2']").click(); pg.wait_for_selector("#typ-uebernehmen"); pg.wait_for_timeout(400)
    pruefe("Hinweis nennt Aufbau übernehmen", "Aufbau übernehmen" in pg.inner_text("#mseite"))
    pg.click("#typ-uebernehmen"); wahl(pg, "t1"); pg.wait_for_timeout(900)
    pruefe("Kopie hat gleich viele Paths und Plätze", zahlen(pg, "t2") == vorlage)
    pruefe("Kopie sichtbar", pg.locator("[data-path-um]").count() == vorlage[0])
    pruefe("Vorlage unverändert", zahlen(pg, "t1") == vorlage)
    pg.screenshot(path="/tmp/claude-0/-home-claude-hofertool/a1cc4336-4931-5dae-b874-ad8fd260436d/scratchpad/kopie.png")
    # Kopie anpassen ändert die Vorlage nicht
    pfad = pg.evaluate("TEST.daten.type_paths.find(p => p.type_id === 't2').id")
    platz = pg.evaluate(f"TEST.daten.type_slots.find(s => s.path_id === '{pfad}').id")
    pg.locator(f"[data-platz-um='{platz}']").click(); pg.locator(".dialog-huelle input").first.fill("T777"); ja(pg)
    pruefe("Kopie angepasst, Vorlage nicht", "T777" in pg.inner_text(f"[data-platz='{platz}']")
        and not pg.evaluate("TEST.daten.type_slots.some(s => s.tool_nr === 'T777' && TEST.daten.type_paths.find(p => p.id === s.path_id).type_id === 't1')"))

    # Nochmals: Dazunehmen verdoppelt
    pg.click("#typ-uebernehmen"); wahl(pg, "t1"); wahl(pg, "dazu"); pg.wait_for_timeout(900)
    pruefe("Dazunehmen verdoppelt", zahlen(pg, "t2") == [vorlage[0] * 2, vorlage[1] * 2])
    # Rückgängig nimmt die zweite Kopie wieder weg
    pg.locator("h1").first.click(); pg.keyboard.press("Control+z"); pg.wait_for_timeout(1200)
    pruefe("Rückgängig nach Dazunehmen", zahlen(pg, "t2") == vorlage)
    # Ersetzen: danach wieder genau die Vorlage, ohne T777
    pg.click("#typ-uebernehmen"); wahl(pg, "t1"); wahl(pg, "ersetzen"); pg.wait_for_timeout(900)
    pruefe("Ersetzen gibt genau die Vorlage", zahlen(pg, "t2") == vorlage and "T777" not in pg.inner_text("#mseite"))
    pg.locator("h1").first.click(); pg.keyboard.press("Control+z"); pg.wait_for_timeout(1500)
    pruefe("Rückgängig nach Ersetzen bringt T777 zurück", zahlen(pg, "t2") == vorlage
        and pg.evaluate("TEST.daten.type_slots.some(s => s.tool_nr === 'T777')"))

    # Neuer Typ mit Vorlage
    pg.click("#typ-zurueck"); pg.wait_for_selector("#typ-neu"); pg.wait_for_timeout(500)
    pg.click("#typ-neu"); pg.locator(".dialog-huelle input").first.fill("Citizen L20")
    pg.locator(".dialog-huelle select").last.select_option("t1"); ja(pg); pg.wait_for_timeout(900)
    neu = pg.evaluate("(TEST.daten.machine_types.find(t => t.name === 'Citizen L20') || {}).id")
    pruefe("Neuer Typ mit kopiertem Aufbau", bool(neu) and zahlen(pg, neu) == vorlage)
    # Neuer Typ ohne Vorlage bleibt leer
    pg.click("#typ-neu"); pg.locator(".dialog-huelle input").first.fill("Leer"); ja(pg); pg.wait_for_timeout(900)
    leer = pg.evaluate("(TEST.daten.machine_types.find(t => t.name === 'Leer') || {}).id")
    pruefe("Neuer Typ ohne Vorlage leer", bool(leer) and zahlen(pg, leer) == [0, 0])
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
