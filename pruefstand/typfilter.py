# Produktion → Erfassen: Knöpfe nach Maschinentyp statt Suche.
# Dazu die überarbeiteten Reiter Maschinen und Typen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
# Im Kurzdreher-Park drei Typen: t2, t1 und eine Maschine ohne Typ
K = """daten.machines.forEach(m => { if (m.id === 'm-k5') m.type_id = 't1'; if (m.id === 'm-k6') m.type_id = null; });"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
assert F != FAKE
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#produktion", wait_until="domcontentloaded")
    pg.wait_for_selector("#raster .menge, #raster .kein-feld"); pg.wait_for_timeout(500)
    pg.click("[data-park='p-kurz']"); pg.wait_for_timeout(500)
    pg.click("[data-modus='tag']"); pg.wait_for_selector(".mkarten")
    pruefe("Kein Suchfeld", pg.locator("#p-suche").count() == 0)
    pruefe("Typknöpfe da", pg.locator("#typwahl").count() == 1)
    texte = pg.locator("[data-typfilter]").all_inner_texts()
    print("Knöpfe:", texte)
    pruefe("Alle + 3 Typen", len(texte) == 4 and texte[0].startswith("Alle") and "6" in texte[0])
    pruefe("Ohne Typ am Schluss", texte[-1].startswith("Ohne Typ"))
    alle = pg.locator(".mkarte").count()
    pg.click("[data-typfilter='t2']"); pg.wait_for_timeout(500)
    pruefe("Filter Tornos-Typ: 4 Maschinen", pg.locator(".mkarte").count() == 4)
    pruefe("Knopf aktiv", "aktiv" in pg.get_attribute("[data-typfilter='t2']", "class"))
    pg.screenshot(path="/tmp/claude-0/typfilter-h.png")
    pg.click("[data-typfilter='ohne']"); pg.wait_for_timeout(500)
    pruefe("Ohne Typ: 1 Maschine", pg.locator(".mkarte").count() == 1)
    pg.click("[data-modus='woche']"); pg.wait_for_timeout(500)
    pruefe("Filter bleibt in der Woche", pg.locator(".raster--woche tbody tr").count() >= 1 and pg.locator("[data-typfilter='ohne'].aktiv").count() == 1)
    pg.click("[data-typfilter='']"); pg.wait_for_timeout(500)
    pg.click("[data-modus='tag']"); pg.wait_for_timeout(500)
    pruefe("Alle wieder da", pg.locator(".mkarte").count() == alle == 6)
    pg.click("[data-park='p-lang']"); pg.wait_for_timeout(500)
    pruefe("Park mit einem Typ: keine Knöpfe", pg.locator("#typwahl").count() == 0)
    # Dunkel: aktiver Knopf in der Themenfarbe
    pg.click("[data-park='p-kurz']"); pg.wait_for_timeout(400)
    pg.evaluate("document.body.classList.add('dunkel'); document.body.setAttribute('data-thema','rot')")
    pg.click("[data-typfilter='t1']"); pg.wait_for_timeout(400)
    farbe = pg.evaluate("getComputedStyle(document.querySelector(\"[data-typfilter='t1']\")).boxShadow")
    pruefe("Aktiver Knopf in Themenfarbe", "rgb(255, 138, 128)" in farbe)
    pg.screenshot(path="/tmp/claude-0/typfilter-d.png")

    # Maschinen und Typen
    pg.click("[data-ansicht='maschinen']"); pg.wait_for_selector(".mliste")
    pruefe("Maschinen als Zeilen mit Typ", pg.locator(".mliste__zeile").count() >= 6 and pg.locator(".mliste__typ").count() >= 6)
    pg.click("[data-parkreiter='p-kurz']"); pg.wait_for_timeout(500)
    pruefe("Ohne Typ markiert", pg.locator(".mliste__typ--leer").count() == 1)
    pruefe("Knöpfe da", pg.locator("[data-masch-um]").count() >= 6 and pg.locator("[data-masch-weg]").count() >= 6)
    pg.screenshot(path="/tmp/claude-0/maschinen-d.png")
    pg.click("[data-parkreiter='typen']"); pg.wait_for_selector(".tkarte")
    pruefe("Typen als Karten", pg.locator(".tkarte").count() == 2)
    pruefe("Zahl der Maschinen", "8 Maschinen" in pg.inner_text(".tkarten"))
    pg.screenshot(path="/tmp/claude-0/typen-d.png")
    pg.click("[data-typ-auf='t1']"); pg.wait_for_selector("#typ-zurueck")
    pruefe("Aufbau öffnet", pg.locator("#typ-zurueck").count() == 1)
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
