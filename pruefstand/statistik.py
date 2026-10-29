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
  D.jobs.push({ ...vorlage, id: 'sA', job_number: '10111-0001', fa_nr: '4711', plan_status: 'fertig',
    started_at: um(vor, 7), ended_at: um(d, 10), target_quantity: 800 });
  // Lief schon vor dem ersten Eintrag: dessen Stand ist die Startmenge (1.160.0)
  D.jobs.push({ ...vorlage, id: 'sC', job_number: '10333-0003', plan_status: 'fertig',
    started_at: um(new Date(vor.getTime() - 30 * 864e5), 7), ended_at: um(new Date(vor.getTime() - 20 * 864e5), 6), target_quantity: 90000 });
  D.jobs.push({ ...vorlage, id: 'sB', job_number: '10222-0002', plan_status: 'laeuft',
    started_at: um(d, 12), ended_at: null, target_quantity: 1000 });
  D.production_records = D.production_records.filter(z => z.machine_id !== 'm-k1');
  D.production_records.push(
    { id: 's1', machine_id: 'm-k1', job_id: 'sA', record_date: iso(vor), quantity: 500 },
    { id: 's2', machine_id: 'm-k1', job_id: 'sA', record_date: iso(d), quantity: 800 },
    { id: 's3', machine_id: 'm-k1', job_id: 'sB', record_date: iso(d), quantity: 200 },
    { id: 's0', machine_id: 'm-k1', job_id: 'sC', record_date: iso(vor), quantity: 50000 });
  // 72 s und 36 s: Vortag 500 × 72 = 10 h, Tag 300 × 72 + 200 × 36 = 8 h
  D.hoco_type_data.push({ hoco_nr: '10111-0001', type_id: 't2', stueckzeit_s: 72 },
                        { hoco_nr: '10222-0002', type_id: 't2', stueckzeit_s: 36 },
                        { hoco_nr: '10333-0003', type_id: 't2', stueckzeit_s: 60 });
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
    # Feste Uhr nach dem Stichtag (STATISTIK_AB), damit die Beispieltage
    # immer gezählt werden, egal an welchem Tag der Test läuft
    pg.clock.set_fixed_time("2026-11-05T12:00:00+01:00")
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    # m-l2 steht in einem externen Park: die Statistik lässt sie weg (1.192.0)
    body = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
        "daten.machine_parks.push({ id: 'p-ext', name: 'Extern', is_active: true });\n"
        "daten.machines.find(m => m.id === 'm-l2').park_id = 'p-ext';\n"
        "if (typeof window !== \"undefined\") window.TEST = TEST;")
    if rolle:
        body = body.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
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
    if not pg.locator("#st-startmengen").count(): fehler.append("Kein Hinweis zu den Startmengen")
    if pg.locator("[data-startikel='10333-0003']").count(): fehler.append("Startmenge als Artikel gezählt")

    # Reihenfolge wie auf der Planwand (1.164.1): Park für Park, darin sort_order
    soll = pg.evaluate("""(() => {
      const D = TEST.daten;
      const ext = p => /extern|lohn|fremd/i.test(p.name || '') ? 1 : 0;
      const parks = D.machine_parks.filter(p => p.is_active !== false)
        .filter(p => !ext(p))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'de')).map(p => p.id);
      return D.machines.filter(m => m.is_active !== false && parks.includes(m.park_id))
        .sort((a, b) => parks.indexOf(a.park_id) - parks.indexOf(b.park_id) || (a.sort_order || 0) - (b.sort_order || 0)
          || String(a.name).localeCompare(String(b.name)))
        .map(m => m.id);
    })()""")
    ist = pg.evaluate("[...document.querySelectorAll('#st-maschinen-tabelle tr[data-stmaschine]')].map(t => t.dataset.stmaschine)")
    balken = pg.evaluate("[...document.querySelectorAll('#st-auslastung [data-dgzeile]')].map(t => t.dataset.dgzeile)")
    if 'm-l2' in ist or 'm-l2' in balken: fehler.append("Externe Maschine m-l2 in der Statistik")
    if ist != soll: fehler.append("Tabelle nicht wie Planwand: " + str(ist) + " statt " + str(soll))
    if balken != soll: fehler.append("Auslastung nicht wie Planwand: " + str(balken) + " statt " + str(soll))

    # Eine Maschine: 1'000 Stk, 18 h, Übergang 2 h
    pg.click("#st-auslastung [data-dgzeile='m-k1']"); pg.wait_for_selector("#st-maschine-name"); pg.wait_for_timeout(400)
    aus = pg.inner_text("#st-k-ausstoss"); zeit = pg.inner_text("#st-k-zeit"); ueb = pg.inner_text("#st-k-uebergang")
    if "1'000" not in aus: fehler.append("Ausstoss m-k1 falsch: " + aus)
    if "50'000 Stk Startmengen" not in aus: fehler.append("Startmenge nicht genannt: " + aus)
    if "18,0 h" not in zeit: fehler.append("Produktionszeit m-k1 falsch: " + zeit)
    if "2,0 h" not in ueb: fehler.append("Übergang m-k1 falsch: " + ueb)
    aus2 = pg.inner_text("#st-k-ausschuss")
    if "50 Stk" not in aus2 or "5,0 %" not in aus2: fehler.append("Ausschuss m-k1 falsch: " + aus2)
    if "Grat" not in pg.inner_text("#st-ausschuss-liste"): fehler.append("Ausschussmeldung fehlt")
    zeile = pg.inner_text("#st-uebergaenge tbody tr")
    if "10111-0001" not in zeile or "10222-0002" not in zeile: fehler.append("Übergang ohne Aufträge: " + zeile)
    saeulen = pg.locator("#st-zeit-tag .dg-saeule").count()
    # Gezählt wird erst ab 26. Oktober 2026, davor gibt es keine Säulen
    # (Uhr fest auf 5. November, heute zählt nicht: 26.10. bis 4.11. = 10 Tage)
    soll = 10
    if saeulen != soll: fehler.append(f"{saeulen} Säulen statt {soll}")
    if "ab 26.10.2026" not in pg.inner_text("#st-ab"): fehler.append("Hinweis „ab 26.10.“ fehlt: " + pg.inner_text("#st-ab"))
    hoch = pg.evaluate("""[...document.querySelectorAll('#st-zeit-tag .dg-saeule')].map(e => e.style.height).filter(h => h !== '0%')""")
    if len(hoch) != 2: fehler.append("Produktionszeit: Säulen " + str(hoch))
    if not pg.locator("#st-zeit-tag .dg-ziel").count(): fehler.append("Keine 10-h-Linie")
    achse = pg.inner_text("#st-zeit-tag .dg-achse")
    if "24 h" not in achse or "12 h" not in achse: fehler.append("Achse nicht bei 24 h gedeckelt: " + achse)
    # Werte an den Säulen ohne Darüberfahren (1.164.0)
    wh = pg.evaluate("""[...document.querySelectorAll('#st-zeit-tag .dg-wert')].map(e => e.textContent)""")
    if sorted(wh) != ["10,0 h", "8,0 h"]: fehler.append("Stunden an den Säulen: " + str(wh))
    ws = pg.evaluate("""[...document.querySelectorAll('#st-ausstoss-tag .dg-wert')].map(e => e.textContent)""")
    if sorted(ws) != ["500", "500"]: fehler.append("Stück an den Säulen: " + str(ws))
    # Nichts ragt über die Fläche hinaus
    raus = pg.evaluate("""[...document.querySelectorAll('.dg-wert')].filter(e => {
      const f = e.closest('.dg-flaeche').getBoundingClientRect(), b = e.getBoundingClientRect();
      return b.top < f.top - 1 || b.bottom > f.bottom + 1; }).map(e => e.textContent)""")
    if raus: fehler.append("Wert ragt aus dem Diagramm: " + str(raus))
    pg.hover("#st-zeit-tag .dg-spalte:nth-last-child(1)"); pg.wait_for_timeout(200)
    if not pg.locator("#st-zeit-tag .dg-tip").count(): fehler.append("Kein Fenster beim Darüberfahren")
    pg.screenshot(path="statistik-maschine.png", full_page=True)
    # 1.258.0: nur Tage mit Stückzahl zählen: 18 h an 2 Tagen = 90 %
    ausl = pg.inner_text("#st-k-auslastung")
    if "90 %" not in ausl: fehler.append("Auslastung nicht über Tage mit Stückzahl: " + ausl)
    leer = pg.locator("#st-zeit-tag .dg-spalte--blass").first
    leer.hover(); pg.wait_for_timeout(200)
    if "keine Stückzahl gemeldet" not in pg.inner_text("#st-zeit-tag .dg-tip"): fehler.append("Tag ohne Meldung nicht erklärt")
    # HOCO Nr. und FA Nr. in den Säulen der Maschine
    teile = pg.evaluate("""[...document.querySelectorAll('#st-ausstoss-tag .dg-teil-name')].map(e => e.textContent)""")
    if "10111-0001" not in teile or not any(t.startswith("10222-0002") for t in teile):
        fehler.append("Aufträge in den Säulen: " + str(teile))
    zwei = pg.evaluate("""[...document.querySelectorAll('#st-zeit-tag .dg-saeule--teile')].map(e => e.querySelectorAll('.dg-teil').length)""")
    if 2 not in zwei: fehler.append("Tag mit Auftragswechsel nicht geteilt: " + str(zwei))
    pg.locator("#st-zeit-tag").screenshot(path="statistik-auftraege.png")

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

        # Zurück (1.162.0): gut sichtbar, bleibt beim Rollen oben, geht dorthin, wo man herkam
        k = pg.locator("[data-stzurueck]")
        if "Zurück zu allen Artikeln" not in k.inner_text(): fehler.append("Zurück-Knopf Artikel: " + k.inner_text())
        pg.evaluate("window.scrollTo(0, 5000)"); pg.wait_for_timeout(200)
        box = k.bounding_box()
        if not box or box["y"] < 0 or box["y"] > 200: fehler.append(f"Zurück-Knopf beim Rollen nicht oben: {box}")
        k.click(); pg.wait_for_selector("#st-artikel-tabelle"); pg.wait_for_timeout(300)
        if pg.locator("#st-artikel-name").count(): fehler.append("Zurück führt nicht zur Liste")
        # Maschine → Artikel → zurück zur Maschine
        pg.evaluate("document.querySelector('#inhalt [data-streiter=maschinen]').click()"); pg.wait_for_selector("#st-maschine-name"); pg.wait_for_timeout(300)
        pg.click("#st-maschine-artikel [data-dgzeile='10111-0001']"); pg.wait_for_selector("#st-artikel-name"); pg.wait_for_timeout(300)
        if pg.evaluate("window.scrollY") > 5: fehler.append("Artikel öffnet nicht oben")
        t = pg.inner_text("[data-stzurueck]")
        if "Zurück zu Tornos M1" not in t: fehler.append("Zurück-Knopf nennt die Maschine nicht: " + t)
        pg.screenshot(path="statistik-zurueck.png")
        pg.click("[data-stzurueck]"); pg.wait_for_timeout(400)
        if not pg.locator("#st-maschine-name").count(): fehler.append("Zurück führt nicht zur Maschine")
        # Escape: eine Ebene zurück zur Liste der Maschinen
        pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
        if pg.locator("#st-maschine-name").count() or not pg.locator("#st-auslastung").count(): fehler.append("Escape geht nicht zur Liste")
        if pg.locator(".dialog-huelle").count(): fehler.append("Escape fragt nach Abmelden statt zurück")
        pg.click("#st-auslastung [data-dgzeile='m-k1']"); pg.wait_for_selector("#st-maschine-name"); pg.wait_for_timeout(300)

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
    if "26.10.2026 –" not in pg.inner_text(".st-zeit__text"): fehler.append("12 Monate nicht ab 26.10.: " + pg.inner_text(".st-zeit__text"))
    pg.click("[data-stzeit='frei']"); pg.wait_for_timeout(300)
    if pg.get_attribute("[data-stvon]", "min") != "2026-10-26": fehler.append("Von–bis erlaubt Daten vor 26.10.")
    # Heute zählt nie mit: Zeitraum endet gestern
    import datetime as _dt
    gestern = _dt.date(2026, 11, 4)  # Uhr fest auf 5. November
    if pg.get_attribute("[data-stbis]", "max") != gestern.isoformat(): fehler.append("Von–bis erlaubt heute")
    if pg.input_value("[data-stbis]") > gestern.isoformat(): fehler.append("Bis steht nach gestern: " + pg.input_value("[data-stbis]"))
    if "– " + gestern.strftime("%d.%m.%Y") not in pg.inner_text(".st-zeit__text"): fehler.append("Zeitraum endet nicht gestern: " + pg.inner_text(".st-zeit__text"))

    # Handy und dunkel
    h = neu(br, breite=390, hoehe=844, dunkel=True)
    h.evaluate(DATEN); h.wait_for_timeout(500)
    h.evaluate("location.hash='#/statistik'"); h.wait_for_selector("#st-auslastung", timeout=15000); h.wait_for_timeout(600)
    breit = h.evaluate("document.documentElement.scrollWidth")
    if breit > 392: fehler.append(f"Handy: Seite {breit} px breit")
    if not h.locator("#st-ausstoss-tag .dg-wert").count(): fehler.append("Handy: keine Werte an den Säulen")
    h.screenshot(path="statistik-handy-dunkel.png", full_page=True)
    h.evaluate("document.querySelector('#inhalt [data-streiter=artikel]').click()"); h.wait_for_selector("#st-artikel-tabelle"); h.wait_for_timeout(400)
    h.click("[data-startikel='10111-0001']"); h.wait_for_selector("#st-artikel-name"); h.wait_for_timeout(300)
    h.evaluate("window.scrollTo(0, 5000)"); h.wait_for_timeout(200)
    box = h.locator("[data-stzurueck]").bounding_box()
    if not box or box["y"] < 0 or box["y"] > 200: fehler.append(f"Handy: Zurück-Knopf nicht oben: {box}")
    h.screenshot(path="statistik-handy-zurueck.png")
    h.click("[data-stzurueck]"); h.wait_for_selector("#st-artikel-tabelle"); h.wait_for_timeout(200)

    # Extern: kein Menüpunkt, die Adresse führt nicht hin
    e = neu(br, rolle="extern"); e.wait_for_timeout(1500)
    e.evaluate("location.hash='#/statistik'"); e.wait_for_timeout(1500)
    if e.locator("#st-zeit").count(): fehler.append("Extern sieht die Statistik")
    br.close()

print("Fehler:", "; ".join(fehler) if fehler else "keine")
