# Strg + K je Seite (seit 1.169.0, Wunsch Patrick 24. Oktober 2026):
# Start und Planwand wie bisher HOCO Nummern, die anderen Seiten suchen,
# was dort steht, und ein Treffer führt dorthin.
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
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("""() => {
      const D = TEST.daten;
      const p = (id, material, ort) => ({ id, material, menge: 50, einheit: 'kg', ort, art: 'lager', weg_am: null,
        erstellt_am: '2026-10-01T08:00:00Z' });
      D.material_posten = [p('p1', 'X8CrNiS18-9 rd 020 mm h9', 'Halle'), p('p2', 'CuZn39Pb3 rd 012 mm h9', 'Restelager')];
      for (let i = 0; i < 40; i++) D.material_posten.push(p('px' + i, 'S235 rd 0' + (30 + i) + ' mm', 'Keller'));
      D.shopping_items.push({ id: 'e1', text: 'Kaffeebohnen', menge: '2 kg', laden: 'Migros', prio: 2, is_done: false,
        created_by: 'u1', created_at: '2026-10-20T08:00:00Z' });
    }""")

    def oeffnen(seite):
        pg.evaluate("h => location.hash = h", "#/" + seite); pg.wait_for_timeout(1500)
        pg.keyboard.press("Control+k"); pg.wait_for_timeout(700)

    def wo():
        return pg.evaluate("(document.querySelector('#suche-alles-wo')||{}).innerText || ''")

    # Start: wie bisher HOCO
    oeffnen("dashboard")
    pruefe("Start: HOCO wie bisher, ohne Umschalter", pg.locator(".suche-alles").count() == 1 and wo() == ""
           and "HOCO" in pg.get_attribute("#suche-alles-feld", "placeholder"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Planwand: wie bisher
    oeffnen("planwand")
    pruefe("Planwand: HOCO wie bisher", wo() == "" and "HOCO" in pg.get_attribute("#suche-alles-feld", "placeholder"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Material
    oeffnen("material")
    pruefe("Material: sucht auf der Seite", "Material" in wo())
    pg.fill("#mat-filter", "") if False else None
    pg.keyboard.type("1.4305"); pg.wait_for_timeout(400)
    liste = pg.inner_text("#suche-alles-liste")
    pruefe("Werkstoffnummer findet X8CrNiS18-9", "X8CrNiS18-9" in liste and "CuZn" not in liste)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.fill("#mat-filter", "CuZn"); pg.wait_for_timeout(300)
    pg.keyboard.press("Control+k"); pg.wait_for_timeout(500)
    pg.keyboard.type("S235 rd 069"); pg.wait_for_timeout(300)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    pruefe("Material: Filter weg", pg.input_value("#mat-filter") == "")
    pruefe("Material: Posten leuchtet", pg.locator("[data-posten='px39'].such-blitz").count() == 1)
    y = pg.evaluate("document.querySelector('[data-posten=\"px39\"]').getBoundingClientRect().top")
    pruefe("Material: Posten sichtbar (" + str(int(y)) + ")", 0 < y < 900)
    # Umschalten auf HOCO und zurück
    pg.keyboard.press("Control+k"); pg.wait_for_timeout(500)
    pg.click("#suche-alles-umschalten"); pg.wait_for_timeout(500)
    pruefe("Umschalten: HOCO Nummern", "HOCO" in wo() and "HOCO" in pg.get_attribute("#suche-alles-feld", "placeholder"))
    pg.keyboard.type("10000-0301"); pg.wait_for_timeout(400)
    pruefe("HOCO Treffer da", pg.locator("[data-treffer]").count() > 0)
    pg.click("#suche-alles-umschalten"); pg.wait_for_timeout(400)
    pruefe("zurück zu Material", "Seite Material" in wo())
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Bestellungen
    oeffnen("bestellungen")
    pruefe("Bestellungen: sucht auf der Seite", "Bestellungen" in wo())
    pg.keyboard.type("Wendeplatte"); pg.wait_for_timeout(1000)
    liste = pg.inner_text("#suche-alles-liste")
    pruefe("Position und Artikel gefunden", "POSITIONEN" in liste.upper() and "ARTIKEL" in liste.upper())
    pg.locator("[data-treffer]").filter(has_text="Wendeplatte").last.click(); pg.wait_for_timeout(1500)
    pruefe("Reiter Artikel, gefiltert", pg.evaluate("alt => 1", None) == 1 and pg.input_value("#ar-suche") == "MTEC-452410")
    pg.keyboard.press("Control+k"); pg.wait_for_timeout(700)
    pg.keyboard.type("Vischer"); pg.wait_for_timeout(1000)
    pg.locator("[data-treffer]").filter(has_text="Vischer").last.click(); pg.wait_for_timeout(1500)
    pruefe("Lieferanten gefiltert", pg.locator("#lf-suche").count() == 1 and "Vischer" in pg.input_value("#lf-suche"))

    # Maschinen
    oeffnen("maschinen")
    pruefe("Maschinen: sucht auf der Seite", "Maschinen" in wo())
    pg.keyboard.type("K-2003"); pg.wait_for_timeout(400)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    pruefe("Seite der Maschine offen", "K-2003" in pg.inner_text(".mseite-pfad"))
    pg.keyboard.press("Control+k"); pg.wait_for_timeout(500)
    pg.keyboard.type("Swiss GT"); pg.wait_for_timeout(400)
    import re
    pg.locator("[data-treffer]").filter(has_text=re.compile(r"\d+ Maschinen")).first.click(); pg.wait_for_timeout(1500)
    pruefe("Typ als Fenster offen", pg.locator(".dialog-huelle").count() >= 1)
    while pg.locator(".dialog-huelle").count():
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Produktion
    oeffnen("produktion")
    pruefe("Produktion: sucht auf der Seite", "Produktion" in wo())
    pg.keyboard.type("Tornos M3"); pg.wait_for_timeout(400)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(2500)
    pruefe("Maschine leuchtet", pg.locator("[data-msuche='m-k3'].such-blitz").count() == 1)

    # Statistik
    oeffnen("statistik")
    pg.wait_for_timeout(1000)
    pruefe("Statistik: sucht auf der Seite", "Statistik" in wo())
    pg.keyboard.type("L-1002"); pg.wait_for_timeout(400)
    n = pg.locator("[data-treffer]").count()
    pg.keyboard.press("Enter"); pg.wait_for_timeout(1200)
    pruefe("Statistik: Maschine offen (" + str(n) + ")", n > 0 and pg.locator("[data-stzurueck]").count() == 1)

    # Einkauf
    oeffnen("einkauf")
    pruefe("Einkauf: sucht auf der Seite", "Einkaufsliste" in wo())
    pg.keyboard.type("migros"); pg.wait_for_timeout(400)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
    pruefe("Eintrag leuchtet", pg.locator("[data-ek='e1'].such-blitz").count() == 1)

    # Rechner
    oeffnen("rechner")
    pg.keyboard.type("gravur"); pg.wait_for_timeout(300)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
    pruefe("Rechner: Reiter Gravur", pg.evaluate("[...document.querySelectorAll('[data-rech].aktiv, .reiter .aktiv')].map(x=>x.textContent).join()").find("Gravur") >= 0)

    # QS
    oeffnen("qs")
    pruefe("QS: sucht auf der Seite", "Qualitätssicherung" in wo())
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
