# Betrachter: Die Werkzeugwechsel-Historie (.html in der Ablage) kommt vom
# Server als reiner Text. Sie muss trotzdem als Seite erscheinen, nicht
# als Quelltext (Patrick, 14. Oktober 2026).
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)

SEITE = ('<!doctype html><html lang="de"><head><meta charset="utf-8"><title>WZ</title>'
         '<style>.leiste{position:fixed;top:0}</style></head><body><div class="leiste"><button>Drucken / PDF</button></div>'
         '<h1 id="kopf">Werkzeugwechsel</h1></body></html>')
K = """daten.dokumente = [
 { id: 'd1', art: 'zeichnung', hoco_nr: '10844-0049', type_id: null, titel: 'WZ', dateiname: 'wz.html', datei_url: 'https://x.invalid/wbg/wz-1-Werkzeugwechsel_2026008448.html', erstellt_am: '2026-09-30T08:00:00Z' }];"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    # Wie Supabase: HTML kommt als text/plain
    pg.route("**://x.invalid/**", lambda r: r.fulfill(status=200, content_type="text/plain; charset=utf-8",
             body=SEITE, headers={"Access-Control-Allow-Origin": "*"}))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("[data-dokauf]")
    pg.locator("[data-dokauf]").first.click(); pg.wait_for_selector(".betrachter iframe")
    pg.wait_for_timeout(500)
    rahmen = pg.frame_locator(".betrachter iframe")
    pruefe("Seite gezeichnet (Überschrift da)", rahmen.locator("#kopf").inner_text() == "Werkzeugwechsel")
    pruefe("kein Quelltext sichtbar", "<!doctype" not in rahmen.locator("body").inner_text().lower())
    pruefe("eigene Knopfleiste ausgeblendet", not rahmen.locator(".leiste").is_visible())
    pruefe("keine PDF-Anzeige", pg.locator(".pdfansicht").count() == 0)
    href = pg.locator(".betrachter a.knopf").get_attribute("href") or ""
    pruefe("Neuer Tab zeigt die Seite (blob)", href.startswith("blob:"))
    if len(sys.argv) > 1: pg.screenshot(path=sys.argv[1])
    pruefe("keine Skriptfehler", not f); print(f)
    br.close()
print("Fehler:", ", ".join(fehler) or "keine")
