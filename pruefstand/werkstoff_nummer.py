# Werkstoffnummer von Hand (seit 1.171.0, Wunsch Patrick 24. Oktober 2026):
# in den Einstellungen bei einem nicht erkannten Werkstoff eintragen,
# danach findet die Suche ihn unter Nummer und Name und zeigt beides.
# Reiter Farben und Material auch mit dem Häkchen „Materialplatz bearbeiten“.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("""() => {
      const D = TEST.daten;
      D.jobs[0].material_bez = 'Sonderguss ZX7 rd 020 mm h9';
      D.planwand = D.jobs;
      D.material_posten = [{ id: 'p1', material: 'Sonderguss ZX7 rd 020 mm h9', menge: 50, einheit: 'kg', ort: 'Halle',
        art: 'lager', weg_am: null }, { id: 'p2', material: 'X8CrNiS18-9 rd 012 mm', menge: 20, einheit: 'kg', ort: 'Halle',
        art: 'lager', weg_am: null }];
    }""")
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='farben']").click(); pg.wait_for_timeout(2000)
    feld = pg.locator("[data-wsnummer='k:sonderguss zx7'], [data-wsnummer^='k:sonderguss']").first
    pruefe("Feld Nummer beim nicht erkannten Werkstoff", feld.count() == 1)
    feld.fill("1.4305"); feld.press("Enter"); pg.wait_for_timeout(800)
    gespeichert = pg.evaluate("(TEST.daten.app_config.find(z => z.schluessel === 'werkstoff_nummern') || {}).wert || ''")
    pruefe("gespeichert mit Kurzname: " + gespeichert, "1.4305" in gespeichert and "X8CrNiS18-9" in gespeichert)
    pruefe("Feld zeigt beides", "X8CrNiS18-9" in feld.input_value())
    while pg.locator(".dialog-huelle").count():
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    pg.evaluate("location.hash = '#/material'"); pg.wait_for_timeout(1800)
    pg.keyboard.press("Control+k"); pg.wait_for_timeout(600)
    pg.keyboard.type("Sonderguss"); pg.wait_for_timeout(400)
    liste = pg.inner_text("#suche-alles-liste")
    pruefe("Treffer zeigt Nummer und Name", "1.4305 · X8CrNiS18-9" in liste)
    pg.fill("#suche-alles-feld", "1.4305"); pg.wait_for_timeout(400)
    liste = pg.inner_text("#suche-alles-liste")
    pruefe("Nummer findet beide Posten", "Sonderguss" in liste and "X8CrNiS18-9 rd 012" in liste)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Ohne Admin, mit Häkchen Materialplatz: Reiter sichtbar, ohne nicht
    ROLLE = 'role: "admin", is_active: true,'
    for mit in (True, False):
        fake = FAKE.replace(ROLLE, 'role: "langdreher", is_active: true, darf_materialplatz: ' + ("true" if mit else "false") + ',', 1)
        pg2 = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
        pg2.route("**/cdn.jsdelivr.net/**", (lambda body: lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))(fake))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg2.route(u, lambda r: r.abort())
        pg2.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg2.wait_for_selector("#inhalt"); pg2.wait_for_timeout(1500)
        pg2.locator("#kopf-einstellungen").click(); pg2.wait_for_timeout(800)
        n = pg2.locator("[data-einst='farben']").count()
        pruefe(("mit" if mit else "ohne") + " Häkchen: Reiter Farben und Material " + ("da" if mit else "weg"),
               n == (1 if mit else 0) and pg2.locator("[data-einst='nutzer']").count() == 0)
        pg2.close()
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
