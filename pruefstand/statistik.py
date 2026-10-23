# Statistik (1.159.0): Ausstoss, Produktionszeit aus Stückzeit,
# Auslastung (10 h = 100 %), Übergang vom Beenden zum nächsten
# laufenden Auftrag und Werkzeug aus den Bestellungen. Externe sehen
# die Seite nicht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []

DATEN = """(() => {
  const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  // Ein Werktag Di bis Fr vor heute, damit der Vortag auch ein Werktag ist
  let d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 1);
  while (d.getDay() < 2 || d.getDay() > 5) d.setDate(d.getDate() - 1);
  const vor = new Date(d); vor.setDate(vor.getDate() - 1);
  const um = (t, h) => { const x = new Date(t); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const D = TEST.daten;
  const vorlage = D.jobs.find(j => j.machine_id === 'm-k1');
  D.jobs.forEach(j => { if (j.machine_id === 'm-k1') { j.started_at = null; j.ended_at = null; j.plan_status = 'geplant'; } });
  D.jobs.push({ ...vorlage, id: 'sA', job_number: '10111-0001', plan_status: 'fertig',
    started_at: um(new Date(vor.getTime() - 5 * 864e5), 7), ended_at: um(d, 10), target_quantity: 800 });
  D.jobs.push({ ...vorlage, id: 'sB', job_number: '10222-0002', plan_status: 'laeuft',
    started_at: um(d, 12), ended_at: null, target_quantity: 1000 });
  D.production_records = D.production_records.filter(z => z.machine_id !== 'm-k1');
  D.production_records.push(
    { id: 's1', machine_id: 'm-k1', job_id: 'sA', record_date: iso(vor), quantity: 500 },
    { id: 's2', machine_id: 'm-k1', job_id: 'sA', record_date: iso(d), quantity: 800 },
    { id: 's3', machine_id: 'm-k1', job_id: 'sB', record_date: iso(d), quantity: 200 });
  // 72 s und 36 s: Vortag 500 × 72 = 10 h, Tag 300 × 72 + 200 × 36 = 8 h
  D.hoco_type_data.push({ hoco_nr: '10111-0001', type_id: 't2', stueckzeit_s: 72 },
                        { hoco_nr: '10222-0002', type_id: 't2', stueckzeit_s: 36 });
  D.articles.push({ id: 'a9', article_number: 'BOHR-42', name: 'Bohrer 4.2', unit: 'Stück', supplier_id: 's1', is_active: true });
  D.order_items.push({ id: 'o9', article_id: 'a9', supplier_id: 's1', quantity: 12, status: 'bestellt',
    ziel_art: 'maschine', ziel_text: 'Tornos M1 K-2001', created_at: um(vor, 8), ordered_at: um(d, 9) });
  D.qs_ausschuss = [{ id: 'q1', machine_id: 'm-k1', job_id: 'sB', hoco_nr: '10222-0002', stueck: 50,
    notiz: 'Grat', erstellt_am: um(d, 14), erstellt_name: 'Saheesan' }];
  return iso(d);
})()"""

def neu(br, rolle=None, breite=1500, hoehe=950, dunkel=False):
    ctx = br.new_context(viewport={"width": breite, "height": hoehe}, timezone_id="Europe/Zurich",
                         color_scheme="dark" if dunkel else "light")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    body = FAKE
    if rolle:
        body = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
            "daten.profiles[0].role = '" + rolle + "';\nif (typeof window !== \"undefined\") window.TEST = TEST;")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**",
              "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    return pg

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = neu(br)
    tag = pg.evaluate(DATEN)
    pg.wait_for_timeout(800)
    if not pg.locator(".nav__punkt", has_text="Statistik").count():
        fehler.append("Kein Menüpunkt Statistik")
    pg.evaluate("location.hash='#/statistik'")
    pg.wait_for_selector("#st-auslastung", timeout=15000); pg.wait_for_timeout(600)
    pg.screenshot(path="statistik-maschinen.png", full_page=True)

    # Eine Maschine: 1'000 Stk, 18 h, Übergang 2 h
    pg.click("#st-auslastung [data-dgzeile='m-k1']"); pg.wait_for_selector("#st-maschine-name"); pg.wait_for_timeout(400)
    aus = pg.inner_text("#st-k-ausstoss"); zeit = pg.inner_text("#st-k-zeit"); ueb = pg.inner_text("#st-k-uebergang")
    if "1'000" not in aus: fehler.append("Ausstoss m-k1 falsch: " + aus)
    if "18,0 h" not in zeit: fehler.append("Produktionszeit m-k1 falsch: " + zeit)
    if "2,0 h" not in ueb: fehler.append("Übergang m-k1 falsch: " + ueb)
    aus2 = pg.inner_text("#st-k-ausschuss")
    if "50 Stk" not in aus2 or "5,0 %" not in aus2: fehler.append("Ausschuss m-k1 falsch: " + aus2)
    if "Grat" not in pg.inner_text("#st-ausschuss-liste"): fehler.append("Ausschussmeldung fehlt")
    zeile = pg.inner_text("#st-uebergaenge tbody tr")
    if "10111-0001" not in zeile or "10222-0002" not in zeile: fehler.append("Übergang ohne Aufträge: " + zeile)
    saeulen = pg.locator("#st-zeit-tag .dg-saeule").count()
    if saeulen != 30: fehler.append(f"{saeulen} Säulen statt 30")
    hoch = pg.evaluate("""[...document.querySelectorAll('#st-zeit-tag .dg-saeule')].map(e => e.style.height).filter(h => h !== '0%')""")
    if len(hoch) != 2: fehler.append("Produktionszeit: Säulen " + str(hoch))
    if not pg.locator("#st-zeit-tag .dg-ziel").count(): fehler.append("Keine 10-h-Linie")
    pg.hover("#st-zeit-tag .dg-spalte:nth-last-child(1)"); pg.wait_for_timeout(200)
    if not pg.locator("#st-zeit-tag .dg-tip").count(): fehler.append("Kein Fenster beim Darüberfahren")
    pg.screenshot(path="statistik-maschine.png", full_page=True)

    # Artikel
    pg.evaluate("document.querySelector('#inhalt [data-streiter=artikel]').click()"); pg.wait_for_selector("#st-artikel-tabelle"); pg.wait_for_timeout(400)
    z = pg.locator("[data-startikel='10111-0001']")
    if not z.count(): fehler.append("Artikel 10111-0001 fehlt")
    else:
        t = z.inner_text()
        if "800" not in t or "72 s" not in t or "16,0 h" not in t: fehler.append("Artikelzeile falsch: " + t)
        z.click(); pg.wait_for_selector("#st-artikel-name"); pg.wait_for_timeout(300)
        if "Tornos M1" not in pg.inner_text("#st-artikel-maschinen"): fehler.append("Artikel: Maschine fehlt")
        pg.screenshot(path="statistik-artikel.png", full_page=True)

    # Werkzeug
    pg.evaluate("document.querySelector('#inhalt [data-streiter=werkzeug]').click()"); pg.wait_for_selector("#st-wz-artikel"); pg.wait_for_timeout(500)
    w = pg.locator("[data-stwz='a9']")
    if not w.count() or "Tornos M1 K-2001" not in w.inner_text(): fehler.append("Werkzeug: Bohrer an Maschine fehlt")
    if "Tornos M1" not in pg.inner_text("#st-wz-maschinen"): fehler.append("Werkzeug: je Maschine fehlt")
    pg.screenshot(path="statistik-werkzeug.png", full_page=True)

    # Zeitraum 12 Monate: Säulen je Woche
    pg.evaluate("document.querySelector('#inhalt [data-streiter=maschinen]').click()"); pg.wait_for_timeout(300)
    pg.click("[data-stzeit='365']"); pg.wait_for_timeout(1500)
    if pg.locator("#st-ausstoss-tag .dg-saeule").count() > 60: fehler.append("12 Monate nicht je Woche")

    # Handy und dunkel
    h = neu(br, breite=390, hoehe=844, dunkel=True)
    h.evaluate(DATEN); h.wait_for_timeout(500)
    h.evaluate("location.hash='#/statistik'"); h.wait_for_selector("#st-auslastung", timeout=15000); h.wait_for_timeout(600)
    breit = h.evaluate("document.documentElement.scrollWidth")
    if breit > 392: fehler.append(f"Handy: Seite {breit} px breit")
    h.screenshot(path="statistik-handy-dunkel.png", full_page=True)

    # Extern: kein Menüpunkt, die Adresse führt nicht hin
    e = neu(br, rolle="extern"); e.wait_for_timeout(1500)
    e.evaluate("location.hash='#/statistik'"); e.wait_for_timeout(1500)
    if e.locator("#st-zeit").count(): fehler.append("Extern sieht die Statistik")
    br.close()

print("Fehler:", "; ".join(fehler) if fehler else "keine")
