# Einstellungen → Farben und Material: Material und Kürzel speichern,
# Farbe ohne Material entfernen, Werkstoff von Hand zuordnen
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.jobs.push({ id: 'jw1', hoco_nr: '10999-0001', material_bez: 'Zauberstahl XY 12', planned_from: '2026-09-01', planned_to: '2026-09-02' });"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
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
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='farben']").click(); pg.wait_for_timeout(1500)

    erste = pg.evaluate("TEST.daten.farb_material[0]")
    farbe = erste["farbe"]
    pruefe("Farbliste mit gespeichertem Material", pg.input_value(f"[data-fmat='{farbe}']") == erste["material"])
    pg.fill(f"[data-fmat='{farbe}']", "Hartmetall"); pg.fill(f"[data-fkuerzel='{farbe}']", "H/M"); pg.press(f"[data-fkuerzel='{farbe}']", "Enter")
    pg.wait_for_timeout(800)
    zeile = pg.evaluate(f"TEST.daten.farb_material.filter(x => x.farbe === '{farbe}').map(x => x.material + ':' + x.buchstabe)")
    print("Zeile:", zeile)
    pruefe("Material und Kürzel gespeichert", "Hartmetall:H/M" in zeile)
    pruefe("Kürzel im Punkt", pg.locator(".farbzeile__punkt").first.inner_text() == "H/M")
    pg.fill(f"[data-fmat='{farbe}']", ""); pg.locator("h1").first.click(); pg.wait_for_timeout(800)
    pruefe("Ohne Material entfernt", pg.evaluate(f"!TEST.daten.farb_material.some(x => x.farbe === '{farbe}')"))
    pruefe("Feld danach leer", pg.input_value(f"[data-fmat='{farbe}']") == "")
    n = len(pg.evaluate("TEST.protokoll"))
    pg.locator(f"[data-fmat='{farbe}']").focus(); pg.locator("h1").first.click(); pg.wait_for_timeout(300)
    pruefe("Unverändert verlassen speichert nicht", not pg.evaluate(f"TEST.protokoll.slice({n}).some(x => x.tabelle === 'farb_material')"))

    # Werkstoffe
    pg.wait_for_selector("#werkstoffliste table")
    text = pg.inner_text("#werkstoffliste")
    pruefe("Unbekannter Werkstoff oben", "nicht erkannt" in text and pg.locator(".ws-offen").count() >= 1)
    sel = pg.locator("[data-werkstoff='Zauberstahl XY 12']")
    pruefe("Auswahl für den Werkstoff", sel.count() == 1)
    gruppe = pg.evaluate("[...document.querySelector(\"[data-werkstoff='Zauberstahl XY 12']\").options].map(o => o.value).find(Boolean)")
    sel.select_option(gruppe); pg.wait_for_timeout(1200)
    zeile = pg.locator("tr", has=pg.locator("[data-werkstoff='Zauberstahl XY 12']"))
    pruefe("Zugeordnet und erkannt", "nicht erkannt" not in zeile.inner_text() and pg.input_value("[data-werkstoff='Zauberstahl XY 12']") == gruppe)
    pruefe("Einstellungen noch offen", pg.locator(".dialog--einstellungen").count() == 1)
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
