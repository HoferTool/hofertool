# Grosse PDF (Handbuch mit vielen Seiten): Der Betrachter zeichnet nur
# Seiten in der Nähe des sichtbaren Bereichs und gibt weit entfernte
# wieder frei, sonst stürzt Safari auf dem iPad ab (seit 1.133.1).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
import betrachter_pdf_bau as bau
server_starten(); time.sleep(0.4)

GROSS = bau.pdf_bauen(595, 842, 200)
K = """daten.dokumente = [
 { id: 'd1', art: 'zeichnung', hoco_nr: '10844-0049', type_id: null, titel: 'Handbuch', dateiname: 'gross.pdf', datei_url: 'https://x.invalid/gross.pdf', erstellt_am: '2026-09-30T08:00:00Z' }];"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

GEZEICHNET = "() => [...document.querySelectorAll('.pdfansicht canvas')].filter(c => c.width > 0).map(c => +c.closest('[data-pdfseite]').dataset.pdfseite)"

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 820, "height": 1180}, device_scale_factor=2).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.route("**://x.invalid/**", lambda r: r.fulfill(status=200, content_type="application/pdf", body=GROSS,
                                                      headers={"Access-Control-Allow-Origin": "*"}))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("[data-dokauf]")
    pg.locator("[data-dokauf]").first.click(); pg.wait_for_selector(".betrachter-huelle")
    pg.wait_for_selector(".pdfansicht canvas[data-fertig]", timeout=20000); pg.wait_for_timeout(800)

    pruefe("200 Seiten im Betrachter", pg.locator("[data-pdfseite]").count() == 200)
    g = pg.evaluate(GEZEICHNET); print("gezeichnet am Anfang:", g)
    pruefe("Seite 1 gezeichnet", 1 in g)
    pruefe("nur wenige Seiten gezeichnet", len(g) <= 6)

    # Weit nach unten rollen: dort wird gezeichnet, oben freigegeben
    pg.evaluate("() => { const b = document.querySelector('.pdfansicht__buehne'); b.scrollTop = document.querySelector('[data-pdfseite=\"150\"]').offsetTop; }")
    pg.wait_for_function("() => document.querySelector('[data-pdfseite=\"150\"] canvas').dataset.fertig === '1'", timeout=10000)
    pg.wait_for_timeout(500)
    g = pg.evaluate(GEZEICHNET); print("gezeichnet bei Seite 150:", g)
    pruefe("Seite 150 gezeichnet", 150 in g)
    pruefe("Seite 1 freigegeben", 1 not in g)
    pruefe("weiterhin nur wenige Seiten", len(g) <= 6)

    # Zurück nach oben: Seite 1 kommt wieder
    pg.evaluate("() => { document.querySelector('.pdfansicht__buehne').scrollTop = 0; }")
    pg.wait_for_function("() => document.querySelector('[data-pdfseite=\"1\"] canvas').dataset.fertig === '1'", timeout=10000)
    pruefe("Seite 1 wieder gezeichnet", 1 in pg.evaluate(GEZEICHNET))
    pruefe("keine Skriptfehler", not f)
    if f: print(f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
