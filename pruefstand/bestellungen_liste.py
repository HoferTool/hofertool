# Bestellungen: Artikel als Liste (eine Zeile je Artikel) und Historie
# in Spalten über die ganze Breite (Wunsch Patrick, 6. Oktober 2026).
# Prüft Breite, Tablet und Handy auf Überlauf und Lage der Spalten.
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
BILD = sys.argv[1] if len(sys.argv) > 1 else None
server_starten(); time.sleep(0.4)
fehler = []
DATEN = """() => {
  const d = TEST.daten;
  d.articles.push({ id: 'a2', article_number: 'CCMT 09T304-SM', name: 'Wendeplatte', unit: 'Stück',
    description: 'IC907 für V4A', supplier_id: 's1', is_active: true });
  d.articles.push({ id: 'a3', article_number: '7015-0040', name: 'Spannzange', unit: 'Stück',
    description: '', supplier_id: null, is_active: false });
  const o = d.order_items[0];
  const g = (id, art, tag, menge, ziel) => d.order_items.push(Object.assign({}, o, { id, article_id: art,
    status: 'geliefert', quantity: menge, ziel_art: ziel[0], ziel_text: ziel[1],
    ordered_at: tag + 'T07:00:00Z', delivered_at: tag + 'T12:30:00Z', completed_at: tag + 'T12:30:00Z', status_am: tag + 'T12:30:00Z' }));
  g('h1', 'a1', '2026-10-02', 20, ['lager', 'Lager']);
  g('h2', 'a2', '2026-10-01', 50, ['maschine', 'Index C100']);
  g('h3', 'a1', '2026-09-12', 5, ['person', 'Ramona']);
}"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate(DATEN)
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(300)

    UEBERLAUF = """(s) => [...document.querySelectorAll(s)].filter(e => e.scrollWidth > e.clientWidth + 1
      || e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length"""

    # Artikel: eine Zeile je Artikel, alle Zellen auf gleicher Höhe
    pg.locator("[data-unter='bestellungen/artikel']:visible, [data-best='artikel']:visible").first.click()
    pg.wait_for_selector(".bs-tabelle--artikel .bs-tabelle__zeile"); pg.wait_for_timeout(300)
    n = pg.locator(".bs-tabelle--artikel .bs-tabelle__zeile").count()
    if n < 3: fehler.append("Artikel-Zeilen: " + str(n))
    if pg.locator(".bs-raster--artikel").count(): fehler.append("Raster noch da")
    lage = pg.evaluate("""() => { const z = document.querySelector('.bs-tabelle--artikel .bs-tabelle__zeile');
      const r = [...z.children].map(c => c.getBoundingClientRect());
      return { links: r.map(x => Math.round(x.left)), oben: r.map(x => Math.round(x.top)), breite: Math.round(z.getBoundingClientRect().width) }; }""")
    if not (lage["links"] == sorted(lage["links"]) and max(lage["oben"]) - min(lage["oben"]) < 20):
        fehler.append("Artikel nicht nebeneinander: " + str(lage))
    if BILD: pg.screenshot(path=BILD + "-artikel.png")

    # Historie: Spalten verteilt, keine grosse Lücke in der Mitte
    pg.locator("[data-unter='bestellungen/historie']:visible, [data-best='historie']:visible").first.click()
    pg.wait_for_selector(".bs-tabelle--historie .bs-tabelle__zeile"); pg.wait_for_timeout(300)
    if pg.locator("[data-hstatus]").count() < 3: fehler.append("Historie unvollständig")
    luecke = pg.evaluate("""() => { const z = document.querySelector('.bs-tabelle--historie .bs-tabelle__zeile');
      const r = [...z.children].map(c => c.getBoundingClientRect());
      let g = 0; for (let i = 1; i < r.length; i++) g = Math.max(g, r[i].left - r[i-1].right);
      return Math.round(g); }""")
    if luecke > 40: fehler.append("Lücke zwischen Spalten: " + str(luecke))
    text = pg.inner_text(".bs-tabelle--historie")
    for w in ["Index C100", "Lager", "Geliefert", "Bestellt von"]:
        if w.lower() not in text.lower(): fehler.append("fehlt in Historie: " + w)
    if BILD: pg.screenshot(path=BILD + "-historie.png")

    for breite, name in [(820, "tablet"), (390, "handy")]:
        pg.set_viewport_size({"width": breite, "height": 900}); pg.wait_for_timeout(300)
        u = pg.evaluate(UEBERLAUF, ".bs-tabelle--historie .bs-tabelle__zeile")
        if u: fehler.append(f"Historie läuft über ({name}): {u}")
        if BILD: pg.screenshot(path=BILD + f"-historie-{name}.png")
        pg.locator("[data-unter='bestellungen/artikel']:visible, [data-best='artikel']:visible").first.click(); pg.wait_for_timeout(400)
        u = pg.evaluate(UEBERLAUF, ".bs-tabelle--artikel .bs-tabelle__zeile")
        if u: fehler.append(f"Artikel läuft über ({name}): {u}")
        if BILD: pg.screenshot(path=BILD + f"-artikel-{name}.png")
        pg.locator("[data-unter='bestellungen/historie']:visible, [data-best='historie']:visible").first.click(); pg.wait_for_timeout(400)

    print("Fehler:", "; ".join(fehler) if fehler else "keine")
    br.close()
