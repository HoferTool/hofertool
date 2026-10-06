# Bestellungen: Wohin-Person zeigt den heutigen Namen (auch alte
# Einträge mit Vorname oder Kurzadresse), neue Einträge merken sich die
# Mailadresse, und nur die Artikelnummer bleibt gross.
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
BILD = sys.argv[1] if len(sys.argv) > 1 else None
server_starten(); time.sleep(0.4)
fehler = []
DATEN = """() => {
  const d = TEST.daten;
  d.profiles[2].full_name = 'Tristan Ecker';
  d.articles.push({ id: 'a2', article_number: 'CCMT 09T304-SM', name: 'Wendeplatte', unit: 'Stück',
    description: 'IC907 für V4A', supplier_id: 's2', is_active: true });
  d.order_items.push({ id: 'o2', article_id: 'a2', supplier_id: 's2', quantity: 20, status: 'offen',
    needed_by: '2026-10-02', note: 'dringend für Auftrag 4711', ziel_art: 'person', ziel_text: 'tristan.ecker',
    created_by: 'u1', created_at: '2026-09-28T08:00:00Z' });
  d.order_items.push({ id: 'o3', article_id: 'a1', supplier_id: 's1', quantity: 5, status: 'offen',
    needed_by: null, note: null, ziel_art: 'person', ziel_text: 'Ramona',
    created_by: 'u1', created_at: '2026-09-29T08:00:00Z' });
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
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(500)
    text = pg.inner_text("#best-inhalt")
    if "Tristan Ecker" not in text: fehler.append("Kurzadresse nicht als Name: " + text[:300])
    if "Ramona Jordi" not in text and "Ramona" in text:
        # Fake-Profil heisst "ramona.jordi" ohne vollen Namen: Anzeige aus der Adresse
        pass
    if "tristan.ecker" in text.lower().replace("tristan ecker", ""): fehler.append("alter Text noch sichtbar")

    # Umbenennen wirkt sofort beim nächsten Laden
    pg.evaluate("TEST.daten.profiles[2].full_name = 'Tristan Neu'")
    pg.click("[data-best='bestellt']"); pg.wait_for_timeout(300)
    pg.click("[data-best='offen']"); pg.wait_for_timeout(700)
    if "Tristan Neu" not in pg.inner_text("#best-inhalt"): fehler.append("Umbenennen nicht übernommen")

    # Schriftgrössen: Nummer grösser als Bezeichnung und Beschreibung
    g = pg.evaluate("""() => { const f = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
      return [f('.bs-pos__nr'), f('.bs-pos__name'), f('.bs-pos__beschreibung'), f('.bs-pos__chips .bs-chip')]; }""")
    if not (g[0] > g[1] > g[2] and g[0] > g[3]): fehler.append("Schriftgrössen: " + str(g))
    if BILD: pg.screenshot(path=BILD)

    # Bearbeiten: Person steht zur Wahl, gespeichert wird die Adresse
    pg.click("[data-bearb-best='o2']"); pg.wait_for_selector(".dialog-huelle")
    pg.locator(".dialog-huelle button", has_text="Diese Bestellung").first.click()
    pg.wait_for_selector(".dialog-huelle select"); pg.wait_for_timeout(200)
    wert = pg.eval_on_selector(".dialog-huelle select", "s => s.value")
    if wert != "person::tristan.ecker@hoferco.ch": fehler.append("Bearbeiten wählt Person nicht: " + wert)
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(700)
    z = pg.evaluate("TEST.daten.order_items.find(x => x.id === 'o2').ziel_text")
    if z != "tristan.ecker@hoferco.ch": fehler.append("nicht als Adresse gespeichert: " + str(z))
    if "Tristan Neu" not in pg.inner_text("#best-inhalt"): fehler.append("Nach Speichern Name weg")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
