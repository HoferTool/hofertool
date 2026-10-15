# Material-Übersicht (1.67.0, Wunsch Patrick 15. Oktober 2026): Seite
# „Material“ mit „Zu bestellen“, Bestellungen aus der Notiz, Posten
# erfassen, „Ist da“, Längen aus dem Einrichtblatt bestätigen, die Zeile
# ganz oben in der Schnellvorschau der Planwand und „Rest Material?“
# beim Beenden im Pad.
import time
from pruefstand import art_info, server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1500, "height": 950}, timezone_id="Europe/Zurich").new_page()
    pg.clock.set_fixed_time("2026-10-13T14:00:00+02:00")
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:200])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")

    # Drei Aufträge mit demselben Material auf m-k1, einer mit Bestellung
    # in der Notiz, einer läuft; dazu ein anderes Material ohne alles
    pg.evaluate("""() => {
      const D = TEST.daten;
      const m = D.machines.find(x => x.id === 'm-k1'); m.type_id = 't1';
      D.machine_types.forEach(t => { t.stangen_mm = 3000; t.stumpen_mm = 250; t.abstecher_mm = 2.5; });
      D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
      const basis = { machine_id: 'm-k1', maschine: m.name, maschine_nr: m.machine_number, ended_at: null,
        planned_days: 3, target_quantity: 5000, stand: 0, started_at: '2026-09-01T04:00:00Z', color: 'rosa' };
      const mat = 'X14CrMoS17 rd 024 mm h9';
      D.jobs.push({ ...basis, id: 'mA', job_number: '10555-0001', plan_status: 'laeuft', material_bez: mat,
        planned_from: '2026-10-05', stand: 1000 });
      D.jobs.push({ ...basis, id: 'mB', job_number: '10555-0002', plan_status: 'geplant', material_bez: mat,
        planned_from: '2026-10-20', material_menge: '680 kg · Notz 2026008261', material_liefertermin: '24.10.26' });
      D.jobs.push({ ...basis, id: 'mC', job_number: '10555-0003', plan_status: 'geplant', material_bez: mat,
        planned_from: '2026-10-27', plan_note: 'Mat ab Rahmen Notz 2026008261' });
      D.jobs.push({ ...basis, id: 'mD', job_number: '10555-0004', plan_status: 'geplant',
        material_bez: 'CuNi7Zn39Pb3Mn2 rd 017 mm h9', planned_from: '2026-11-03' });
      D.planwand = D.jobs;
      D.hoco_type_data = D.hoco_type_data.filter(x => x.hoco_nr !== '10555-0001');
      D.hoco_type_data.push({ hoco_nr: '10555-0001', type_id: 't1', stueckzeit_s: 30 });
      D.hoco_parts.push({ hoco_nr: '10555-0002', teil_d_mm: 24, teil_laenge_mm: 30, teil_mass_bestaetigt: false,
        teil_mass_quelle: 'Einrichtblatt: Deckel 24 x 30' });
      D.hoco_parts.push({ hoco_nr: '10555-0003', teil_d_mm: 24, teil_laenge_mm: 30, teil_mass_bestaetigt: true });
      D.material_posten = [{ id: 'p1', material: 'X14CrMoS17 rd 024 mm h8', menge: 200, einheit: 'kg',
        ort: 'Restelager', art: 'lager', weg_am: null, erstellt_am: '2026-10-01T08:00:00Z' }];
    }""")

    pg.evaluate("location.hash='#material'")
    pg.wait_for_selector("#mat-tabelle", timeout=8000); pg.wait_for_timeout(500)
    pruefe("Knopf Material im Menü", pg.locator("a[href='#/material'], [data-pfad='material'], a:has-text('Material')").count() >= 1)
    best = pg.inner_text("#mat-bestellen")
    pruefe("Zu bestellen nennt Neusilber ohne alles", "CuNi7Zn39Pb3Mn2" in best and "nichts da, nichts bestellt" in best)
    pruefe("Zu bestellen: Chromstahl fehlt (2 × 575 kg, nur 680 bestellt)", "X14CrMoS17" in best and "fehlt ca." in best)
    zeile = pg.locator(".mat-zeile[data-material='X14CrMoS17 rd 024 mm h9']")
    t = zeile.inner_text()
    pruefe("Bestellung aus der Notiz einmal gezählt", t.count("2026008261") == 1 and "680 kg" in t)
    pruefe("Laufender Auftrag an der Maschine", "an " in t)
    import re
    pruefe("Mindestmenge mit Abstecher 2,5 + 0,5 mm, nicht sicher", re.search(r"mind\. ca\. 1.275 kg", t) and "nicht bestätigt" in t)
    pruefe("Ähnlich an Lager (h8)", "ähnlich an Lager: h8" in t)
    pg.screenshot(path="/tmp/material_seite.png", full_page=True)

    # Ist da: aus der Bestellung wird ein Posten an Lager
    zeile.click(); pg.wait_for_selector(".mat-mehr")
    pg.click(".mat-mehr button:has-text('Ist da')"); pg.wait_for_selector(".mat-dialog")
    pg.click(".mat-dialog button:has-text('Aussenlager Nord')")
    pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(1200)
    neu = pg.evaluate("TEST.daten.material_posten.find(p => p.be_nr === '2026008261')")
    pruefe("Ist da legt Posten an", bool(neu) and neu["art"] == "lager" and neu["ort"] == "Aussenlager Nord" and neu["menge"] == 680)
    t = pg.locator(".mat-zeile[data-material='X14CrMoS17 rd 024 mm h9']").inner_text()
    pruefe("danach an Lager statt bestellt", "680 kg" in t and "Aussenlager Nord" in t and t.count("2026008261") == 0)

    # Erfassen mit Suche
    pg.click("#mat-neu"); pg.wait_for_selector(".mat-dialog #mat-suche")
    pg.fill("#mat-suche", "cuni 17")
    pg.wait_for_timeout(200)
    pruefe("Suche findet Material", pg.locator(".mat-vorschlag", has_text="CuNi7Zn39Pb3Mn2 rd 017").count() >= 1)
    pg.locator(".mat-vorschlag", has_text="CuNi7Zn39Pb3Mn2 rd 017").first.click()
    pg.click(".mat-dialog button:has-text('500 kg')"); pg.click(".mat-dialog button:has-text('Restelager')")
    pg.screenshot(path="/tmp/material_erfassen.png")
    pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(1200)
    pruefe("Erfasst", pg.evaluate("TEST.daten.material_posten.some(p => p.material.startsWith('CuNi7') && p.menge === 500)"))
    pruefe("Neusilber nicht mehr zu bestellen", "CuNi7Zn39Pb3Mn2" not in pg.inner_text("#mat-bestellen"))

    # An Lager und Längen
    pg.click("[data-matreiter='lager']"); pg.wait_for_selector("[data-ort='Restelager']")
    pruefe("An Lager nach Ort", pg.locator("[data-ort='Aussenlager Nord']").count() == 1)
    pg.click("[data-matreiter='laengen']"); pg.wait_for_selector("[data-hoco='10555-0002']")
    pg.click("[data-hoco='10555-0002'] button:has-text('Stimmt')"); pg.wait_for_timeout(1000)
    pruefe("Länge bestätigt", pg.evaluate("TEST.daten.hoco_parts.find(h => h.hoco_nr === '10555-0002').teil_mass_bestaetigt") is True)
    pg.screenshot(path="/tmp/material_laengen.png", full_page=True)

    # Schnellvorschau: Material ganz oben
    pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1200)
    b = pg.locator(".pw-balken[data-auftrag='mB']").first
    if b.count():
        b.scroll_into_view_if_needed(); b.hover(); pg.wait_for_timeout(700)
        info = pg.locator(".pw-info")
        z = info.locator(".pw-info__zeile").first.inner_text() if info.count() else ""
        pruefe("Schnellvorschau zuoberst Material: " + z, z.startswith("Material: da"))
        pg.screenshot(path="/tmp/material_vorschau.png")
    else:
        pruefe("Balken mB sichtbar", False)
    pruefe("kein neues Zeichen auf dem Balken", pg.locator(".pw-mat").count() == 0)

    # Beenden im Pad fragt nach dem Rest
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_text="10555-0001").first.click()
    pg.wait_for_selector("#pad [data-padstatus]"); pg.wait_for_timeout(500)
    pg.click("#pad [data-padstatus]"); pg.wait_for_selector(".dialog-huelle [data-w='fertig']")
    pg.click(".dialog-huelle [data-w='fertig']"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(700)
    if pg.locator(".zifferblock h2:has-text('Letzte Stückzahl')").count():
        pg.click(".zifferblock [data-zbnein]")
    art_info(pg, laenge=7)
    pg.wait_for_selector(".mat-dialog", timeout=6000)
    pruefe("Rest Material? erscheint", "Rest Material?" in pg.inner_text(".mat-dialog"))
    pruefe("Material vorgegeben", "X14CrMoS17 rd 024 mm h9" in pg.inner_text(".mat-gewaehlt"))
    pruefe("Posten zum Abhaken (680 kg Aussenlager)", pg.locator(".mat-leer label:has-text('680 kg')").count() == 1)
    pg.click(".mat-leer label:has-text('680 kg') input")
    pg.click(".mat-dialog button:has-text('50 kg')")
    pg.screenshot(path="/tmp/material_rest.png")
    pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(1500)
    pruefe("Rest gespeichert", pg.evaluate("TEST.daten.material_posten.some(p => p.job_id === 'mA' && p.menge === 50 && p.ort === 'Restelager')"))
    pruefe("Posten aufgebraucht", pg.evaluate("!!TEST.daten.material_posten.find(p => p.be_nr === '2026008261').weg_am"))
    pruefe("Auftrag fertig", pg.evaluate("TEST.daten.jobs.find(j => j.id === 'mA').plan_status") == "fertig")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
