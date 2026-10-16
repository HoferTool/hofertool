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
    # Ein Einrichtblatt mit „Art. Bez.: Getriebedeckel 17 x 7.00“ (seit 1.70.0 liest die App selbst)
    import os
    blatt = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "laenge-test.xlsx"), "rb").read()
    pg.route("**://blatt.test/**", lambda r: r.fulfill(status=200, body=blatt,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
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
      // Rahmenauftrag: ohne Mengenrechnung
      D.jobs.push({ ...basis, id: 'mF', job_number: '10555-0006', plan_status: 'geplant', material_bez: mat,
        planned_from: '2026-11-17', abruf_info: 'Neuer Rahmen 50000 Stk.' });
      // Bestellt mit Termin vor dem Stichtag: gilt als geliefert
      D.jobs.push({ ...basis, id: 'mE', job_number: '10555-0005', plan_status: 'geplant',
        material_bez: 'X10CrNiS18-9 rd 016 mm h8', planned_from: '2026-11-10',
        material_menge: '300 kg · Notz 2026009999', material_liefertermin: '10.10.26' });
      D.jobs.push({ ...basis, id: 'mD', job_number: '10555-0004', plan_status: 'geplant',
        material_bez: 'CuNi7Zn39Pb3Mn2 rd 017 mm h9', planned_from: '2026-11-03' });
      D.planwand = D.jobs;
      D.hoco_type_data = D.hoco_type_data.filter(x => x.hoco_nr !== '10555-0001');
      D.hoco_type_data.push({ hoco_nr: '10555-0001', type_id: 't1', stueckzeit_s: 30, blatt_url: 'https://blatt.test/10555-0001.xlsx' });
      D.hoco_parts.push({ hoco_nr: '10555-0001', teil_laenge_mm: null, teil_mass_bestaetigt: false, teil_mass_quelle: null });
      D.hoco_parts.push({ hoco_nr: '10555-0002', teil_d_mm: 24, teil_laenge_mm: 30, teil_mass_bestaetigt: false,
        teil_mass_quelle: 'Einrichtblatt: Deckel 24 x 30' });
      D.hoco_parts.push({ hoco_nr: '10555-0003', teil_d_mm: 24, teil_laenge_mm: 30, teil_mass_bestaetigt: true });
      D.material_posten = [{ id: 'p1', material: 'X14CrMoS17 rd 024 mm h8', menge: 200, einheit: 'kg',
        ort: 'Restelager', art: 'lager', weg_am: null, erstellt_am: '2026-10-01T08:00:00Z' }];
    }""")

    pg.evaluate("location.hash='#material'")
    pg.wait_for_selector("[data-ort='Restelager']", timeout=8000); pg.wait_for_timeout(500)
    pruefe("Nur Restmaterial, keine Reiter", pg.locator("[data-matreiter]").count() == 0 and pg.locator("#mat-bestellen, #mat-bestellt").count() == 0)
    pruefe("Knopf Material im Menü", pg.locator("a[href='#/material'], [data-pfad='material'], a:has-text('Material')").count() >= 1)
    pg.screenshot(path="/tmp/material_seite.png", full_page=True)

    # Erfassen mit Zuweisen: 200 kg für 10555-0002, mit genauem Platz
    pg.click("#mat-neu"); pg.wait_for_selector(".mat-dialog #mat-suche")
    pruefe("Keine Wahl Ist da / Bestellt mehr", pg.locator(".mat-dialog button:has-text('Bestellt')").count() == 0)
    pg.fill("#mat-suche", "14cr 24"); pg.wait_for_timeout(200)
    pg.locator(".mat-vorschlag", has_text="X14CrMoS17 rd 024 mm h9").first.click()
    pg.click(".mat-dialog button:has-text('200 kg')"); pg.click(".mat-dialog button:has-text('Aussenlager Nord')")
    pg.wait_for_selector(".mat-dialog #mat-fuer")
    pg.click(".mat-dialog [data-fuer='10555-0006']"); pg.wait_for_timeout(150)
    pruefe("Rahmen vorgewählt bei Rahmenauftrag", pg.is_checked("#mat-rahmen"))
    pg.click(".mat-dialog [data-fuer='10555-0002']"); pg.wait_for_timeout(150)
    pruefe("Kein Rahmen bei normalem Auftrag", not pg.is_checked("#mat-rahmen"))
    breite = pg.evaluate("document.querySelector('.mat-dialog').getBoundingClientRect().width")
    pruefe("Fenster am Computer gross (%d px)" % breite, breite > 900)
    pg.screenshot(path="/tmp/material_fenster.png")
    pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(500)
    pruefe("Ohne Platz nicht gespeichert", pg.locator(".mat-dialog").count() == 1)
    pg.fill("#mat-platz", "Regal 3 unten")
    pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(1200)
    neu = pg.evaluate("TEST.daten.material_posten.find(p => p.platz === 'Regal 3 unten')")
    pruefe("Zuweisung gespeichert", bool(neu) and neu["art"] == "lager" and neu.get("job_id") == "mB" and neu["menge"] == 200)

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

    # Nach Ort
    pruefe("Nach Ort", pg.locator("[data-ort='Aussenlager Nord']").count() == 1)
    pruefe("Zuweisung sichtbar", "für 10555-0002, Regal 3 unten" in pg.inner_text("[data-ort='Aussenlager Nord']"))
    l = pg.evaluate("TEST.daten.hoco_parts.find(h => h.hoco_nr === '10555-0001')")
    pruefe("Länge selbst aus dem Einrichtblatt gelesen (7, unbestätigt)",
           l.get("teil_laenge_mm") == 7 and l.get("teil_mass_bestaetigt") is False and "Getriebedeckel" in (l.get("teil_mass_quelle") or ""))

    # Schnellvorschau: Material ganz oben
    pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1200)
    b = pg.locator(".pw-balken[data-auftrag='mB']").first
    if b.count():
        b.scroll_into_view_if_needed(); b.hover(); pg.wait_for_timeout(700)
        info = pg.locator(".pw-info")
        z = info.locator(".pw-info__zeile").first.inner_text() if info.count() else ""
        pruefe("Schnellvorschau zuoberst Material: " + z, z.startswith("Material: "))
        pg.screenshot(path="/tmp/material_vorschau.png")
    else:
        pruefe("Balken mB sichtbar", False)
    pruefe("kein neues Zeichen auf dem Balken", pg.locator(".pw-mat").count() == 0)

    # Mat. info. (1.73.0): kurz über dem Zustand, immer, ✗L ohne bestätigte Länge
    def vorschau(id_):
        pg.mouse.move(5, 5); pg.wait_for_timeout(300)
        bb = pg.locator(".pw-balken[data-auftrag='%s']" % id_).first
        if not bb.count():
            # Liegt ausserhalb der gezeichneten Tage: über die Suche hin
            pg.keyboard.press("h"); pg.wait_for_timeout(500)
        if not bb.count(): return ["Balken %s nicht gezeichnet" % id_]
        bb.scroll_into_view_if_needed(); bb.hover(); pg.wait_for_timeout(600)
        return [z.inner_text() for z in pg.locator(".pw-info .pw-info__zeile").all()]
    zz = vorschau("mB")
    i = next((k for k, t in enumerate(zz) if t.startswith("Mat. info.:")), -1)
    pruefe("Mat. info. direkt über dem Zustand (mB): " + (zz[i] if i >= 0 else "fehlt"),
           i >= 0 and zz[i + 1].startswith("○") and "kg / " in zz[i] and zz[i].endswith("(✗L)"))
    pruefe("keine doppelte Mindestmenge in der obersten Zeile", "mind." not in zz[0])
    zz = vorschau("mC")
    pruefe("Bestätigt ohne ✗L (mC): " + next((t for t in zz if t.startswith("Mat.")), "fehlt"),
           any(t.startswith("Mat. info.: min.") and "✗L" not in t for t in zz))
    pg.screenshot(path="/tmp/matinfo_vorschau.png")
    pg.mouse.move(5, 5)
    pg.locator(".pw-balken[data-auftrag='mB']").first.dblclick()
    pg.wait_for_selector("#pl-matinfo", timeout=5000)
    txt = pg.inner_text("#pl-matinfo")
    lage = pg.evaluate("[document.querySelector('#pl-matinfo').getBoundingClientRect().bottom, document.querySelector('#pl-zustand').getBoundingClientRect().top]")
    pruefe("Auftragsfenster: Mat. info. über dem Zustand: " + txt, txt.startswith("Mat. info.: min.") and "(✗L)" in txt and lage[0] <= lage[1])
    pg.click("#pl-matinfo .mat-info__l"); pg.wait_for_timeout(300)
    pruefe("✗L antippen erklärt es", "Länge des Fertigteils" in pg.inner_text("body"))
    pg.screenshot(path="/tmp/matinfo_fenster.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    zz = vorschau("mA")
    pruefe("Auch wenn er läuft (mA): " + next((t for t in zz if t.startswith("Mat.")), "fehlt"),
           any(t.startswith("Mat. info.: min.") for t in zz))

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
    g = pg.inner_text("#mat-gebraucht")
    pruefe("Rest-Hinweis nennt Aufträge, die es noch brauchen: " + g.replace(chr(10), " | "),
           "noch gebraucht" in g and "10555-0002" in g and "10555-0003" in g)
    pruefe("Material vorgegeben", "X14CrMoS17 rd 024 mm h9" in pg.inner_text(".mat-gewaehlt"))
    pruefe("Posten zum Abhaken (200 kg Aussenlager)", pg.locator(".mat-leer label:has-text('200 kg')").count() == 1)
    pg.click(".mat-leer label:has-text('200 kg') input")
    pg.click(".mat-dialog button:has-text('50 kg')")
    pg.screenshot(path="/tmp/material_rest.png")
    pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(1500)
    pruefe("Rest gespeichert", pg.evaluate("TEST.daten.material_posten.some(p => p.job_id === 'mA' && p.menge === 50 && p.ort === 'Restelager')"))
    pruefe("Posten aufgebraucht", pg.evaluate("!!TEST.daten.material_posten.find(p => p.platz === 'Regal 3 unten').weg_am"))
    pruefe("Auftrag fertig", pg.evaluate("TEST.daten.jobs.find(j => j.id === 'mA').plan_status") == "fertig")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
