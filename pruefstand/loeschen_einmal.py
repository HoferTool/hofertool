# Löschen fragt überall genau einmal (Wunsch Patrick, 6. Oktober 2026:
# „löschen nur einmal“). Nach dem Ja darf keine zweite Rückfrage kommen
# und der Eintrag muss weg sein: Notiz, Problem quittieren, HOCO Nr.,
# Maschinentyp, Maschine und Maschinenpark.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def einmal(pg, knopf, was):
    pg.locator(knopf).first.click()
    pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(900)
    pruefe(was + ": keine zweite Rückfrage", pg.locator(".dialog-huelle [data-ja]").count() == 0)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)

    # Notiz auf der Startseite
    pg.evaluate("""TEST.daten.todos.push({ id: 'n9', text: 'Probe weg', is_done: false,
      created_at: new Date().toISOString() })""")
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(600)
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_selector("[data-nweg='n9']")
    einmal(pg, "[data-nweg='n9']", "Notiz")
    pruefe("Notiz gelöscht", pg.evaluate("!TEST.daten.todos.some(t => t.id === 'n9')"))

    # Problem quittieren
    pg.wait_for_selector("[data-probweg]")
    pid = pg.locator("[data-probweg]").first.get_attribute("data-probweg")
    einmal(pg, f"[data-probweg='{pid}']", "Problem")
    pruefe("Problem entfernt", pg.evaluate(f"!(TEST.daten.jobs.find(j => j.id === '{pid}') || {{}}).problem"))

    # HOCO Nr.
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    nr = pg.evaluate("TEST.daten.hoco_parts[0].hoco_nr")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='" + nr[:3] + "00']").click(); pg.wait_for_timeout(500)
    pg.locator("[data-kunde='" + nr[:5] + "']").click(); pg.wait_for_timeout(500)
    einmal(pg, f"[data-hoco-weg='{nr}']", "HOCO Nr.")
    # Die Planwand legt Nummern aus offenen Aufträgen gleich wieder an,
    # darum zählt hier, dass das Löschen geschickt wurde
    pruefe("HOCO Nr. gelöscht", pg.evaluate("TEST.protokoll.some(x => x.tabelle === 'hoco_parts' && x.art === 'delete')"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # Maschinentyp, Maschine, Park
    pg.evaluate("location.hash='#produktion'")
    pg.wait_for_selector("#raster .menge, #raster .kein-feld"); pg.wait_for_timeout(500)
    pg.click("[data-ansicht='maschinen']"); pg.wait_for_selector("#park-reiter")
    mid = pg.locator("[data-masch-weg]").first.get_attribute("data-masch-weg")
    einmal(pg, f"[data-masch-weg='{mid}']", "Maschine")
    pruefe("Maschine gelöscht", pg.evaluate(f"!TEST.daten.machines.some(m => m.id === '{mid}')"))
    park = pg.locator("[data-park-weg]").first.get_attribute("data-park-weg")
    einmal(pg, f"[data-park-weg='{park}']", "Park")
    pruefe("Park gelöscht", pg.evaluate(f"!TEST.daten.machine_parks.some(m => m.id === '{park}')"))
    pg.locator("[data-parkreiter='typen']").click(); pg.wait_for_selector("[data-typ-weg]")
    tid = pg.locator("[data-typ-weg]").first.get_attribute("data-typ-weg")
    einmal(pg, f"[data-typ-weg='{tid}']", "Maschinentyp")
    pruefe("Typ gelöscht", pg.evaluate(f"!TEST.daten.machine_types.some(t => t.id === '{tid}')"))

    for x in f: fehler.append("SEITENFEHLER: " + x)
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
