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
        planned_from: '2026-10-20', material_menge: '680 kg · Notz 2026008261', material_liefertermin: '24.10.26',
        plan_note: 'Teile dringend\\nMat. Lager Süd\\n(aus infoBoard)', geaendert_am: '2026-10-12T08:00:00Z' });
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
        ort: 'Restelager', art: 'lager', weg_am: null, erstellt_am: '2026-10-01T08:00:00Z',
        erstellt_von: 'u1', geaendert_am: '2026-10-02T13:05:00Z', geaendert_von: 'u1' }];
    }""")

    pg.evaluate("location.hash='#material'")
    pg.wait_for_selector("[data-ort='Restelager']", timeout=8000); pg.wait_for_timeout(500)
    pruefe("Nur Restmaterial, keine Reiter", pg.locator("[data-matreiter]").count() == 0 and pg.locator("#mat-bestellen, #mat-bestellt").count() == 0)
    # Suche nach Werkstoffnummer findet auch den Kurznamen (1.99.0)
    for wort, soll in (("1.4104", 1), ("x14crmos17", 1), ("1.4305", 0)):
        pg.fill("#mat-filter", wort); pg.wait_for_timeout(300)
        pruefe("Suche " + wort + " → " + str(soll), pg.locator("[data-ort='Restelager']").count() == soll)
    pg.fill("#mat-filter", ""); pg.wait_for_timeout(300)
    pg.evaluate("""TEST.daten.material_verlauf = [
      { id: 2, posten_id: 'p1', was: 'geaendert', material: 'X14CrMoS17 rd 024 mm h8', menge: 200, einheit: 'kg', ort: 'Aussenlager Nord', vorher: 'Menge 150 kg', am: '2026-10-16T10:00:00Z' },
      { id: 1, posten_id: 'p1', was: 'erfasst', material: 'X14CrMoS17 rd 024 mm h8', menge: 150, einheit: 'kg', ort: 'Aussenlager Nord', am: '2026-10-15T09:00:00Z' }]""")
    pg.wait_for_selector("#mat-historie-knopf:not([disabled])", timeout=8000)
    pg.click("#mat-historie-knopf"); pg.wait_for_selector("#mat-historie", timeout=5000)
    h = pg.inner_text("#mat-historie")
    pruefe("Historie im Fenster: " + h.replace(chr(10), " | ")[:160], "Geändert" in h and "vorher: Menge 150 kg" in h and "Erfasst" in h and "200 kg" in h)
    pg.click("#mat-historie [data-zu]"); pg.wait_for_timeout(300)
    pruefe("Knopf Material im Menü", pg.locator("a[href='#/material'], [data-pfad='material'], a:has-text('Material')").count() >= 1)
    pg.screenshot(path="/tmp/material_seite.png", full_page=True)
    # Wer und wann (1.81.0, Wunsch Patrick 16. Oktober 2026)
    ww = pg.locator("[data-ort='Restelager'] .mat-posten__werwann").first.inner_text()
    print("     " + ww)
    pruefe("Erfasst mit Datum, Zeit und Person", "Erfasst 01.10. 10:00" in ww and "saheesan.hudson" in ww)
    pruefe("Geändert mit Datum, Zeit und Person", "geändert 02.10. 15:05 · saheesan.hudson" in ww)

    # Erfassen: Restmaterial gehört keinem Auftrag (1.104.0, Wunsch Patrick 19. Oktober 2026)
    pg.click("#mat-neu"); pg.wait_for_selector(".mat-dialog #mat-suche")
    pruefe("Keine Wahl Ist da / Bestellt mehr", pg.locator(".mat-dialog button:has-text('Bestellt')").count() == 0)
    pg.fill("#mat-suche", "14cr 24"); pg.wait_for_timeout(200)
    pg.locator(".mat-vorschlag", has_text="X14CrMoS17 rd 024 mm h9").first.click()
    pg.fill("#mat-menge", "200"); pg.click(".mat-dialog button:has-text('Aussenlager Nord')")
    pg.fill("#mat-notiz", "Regal 3 unten"); pg.wait_for_timeout(200)
    pruefe("Keine Wahl „Für welchen Auftrag“", pg.locator(".mat-dialog #mat-fuer, .mat-dialog [data-fuer], #mat-platz").count() == 0)
    breite = pg.evaluate("document.querySelector('.mat-dialog').getBoundingClientRect().width")
    pruefe("Fenster am Computer gross (%d px)" % breite, breite > 900)
    pg.screenshot(path="/tmp/material_fenster.png")
    pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(1200)
    neu = pg.evaluate("TEST.daten.material_posten.find(p => p.notiz === 'Regal 3 unten')")
    pruefe("Gespeichert ohne Auftrag", bool(neu) and neu["art"] == "lager" and not neu.get("job_id") and not neu.get("fuer_hoco") and neu["menge"] == 200)

    # Rotes M: wo einsetzen? Geplant mit rotem M und gleichem Material: mC und mF;
    # mB hat eine Menge (kein M), mA läuft
    m = pg.locator("[data-ort='Aussenlager Nord'] .mat-m").first
    pruefe("Rotes M beim Posten mit Zahl 2", m.count() == 1 and m.get_attribute("data-m") == "2")
    m.click(); pg.wait_for_selector("#mat-wo", timeout=5000)
    w = pg.inner_text("#mat-wo")
    pruefe("Fenster zeigt 10555-0003 und 10555-0006: " + w.replace(chr(10), " | ")[:200],
           "10555-0003" in w and "10555-0006" in w and "10555-0002" not in w and "10555-0001" not in w)
    pg.wait_for_timeout(700); pg.screenshot(path="/tmp/material_wo.png")
    pg.click("#mat-wo [data-wo='10555-0003'] button"); pg.wait_for_timeout(800)
    pruefe("HOCO Nr. öffnet das Auftragsfenster", pg.locator(".dialog--auftrag").count() == 1 and pg.locator("#mat-wo").count() == 0)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    # Andere Toleranz zählt als ähnlich
    pg.locator("[data-ort='Restelager'] .mat-m").first.click(); pg.wait_for_selector("#mat-wo", timeout=5000)
    pruefe("Andere Toleranz als ähnlich", "ähnlich" in pg.inner_text("#mat-wo"))
    pg.click("#mat-wo [data-zu]"); pg.wait_for_timeout(300)

    # Erfassen mit Suche
    pg.click("#mat-neu"); pg.wait_for_selector(".mat-dialog #mat-suche")
    pg.fill("#mat-suche", "cuni 17")
    pg.wait_for_timeout(200)
    pruefe("Suche findet Material", pg.locator(".mat-vorschlag", has_text="CuNi7Zn39Pb3Mn2 rd 017").count() >= 1)
    pg.locator(".mat-vorschlag", has_text="CuNi7Zn39Pb3Mn2 rd 017").first.click()
    pg.fill("#mat-menge", "500"); pg.click(".mat-dialog button:has-text('Restelager')")
    pg.screenshot(path="/tmp/material_erfassen.png")
    pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(1200)
    pruefe("Erfasst", pg.evaluate("TEST.daten.material_posten.some(p => p.material.startsWith('CuNi7') && p.menge === 500)"))

    # Nach Ort
    pruefe("Nach Ort", pg.locator("[data-ort='Aussenlager Nord']").count() == 1)
    pruefe("Kein „für …“ beim Restmaterial", "für 10555" not in pg.inner_text("#inhalt"))
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
        pruefe("Oben keine Zeile Material da/bestellt mehr: " + z, not z.startswith("Material: "))
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
    # Seit 1.95.0 wieder in der Schnellvorschau, ganz unten
    pruefe("Mat. info. ganz unten in der Schnellvorschau (mB): " + (zz[-1] if zz else "leer"),
           bool(zz) and zz[-1].startswith("Mat. info.") and "min. ca." in zz[-1])
    pruefe("Notiz ohne „aus infoBoard“ in der Schnellvorschau", not any("infoBoard" in t for t in zz))
    pruefe("Werkstoffnummer in der Schnellvorschau: " + next((t for t in zz if "1.4104" in t), "fehlt"),
           any(t.startswith("1.4104 · ") for t in zz))
    pg.screenshot(path="/tmp/matinfo_vorschau.png")
    pg.mouse.move(5, 5)
    pg.locator(".pw-balken[data-auftrag='mB']").first.dblclick()
    pg.wait_for_selector("#pl-matinfo", timeout=5000)
    txt = pg.inner_text("#pl-matinfo")
    lage = pg.evaluate("[document.querySelector('#pl-matinfo').getBoundingClientRect().bottom, document.querySelector('#pl-zustand').getBoundingClientRect().top]")
    pruefe("Auftragsfenster: Mat. info. über dem Zustand: " + txt, txt.startswith("Mat. info.: min.") and "min. ca." in txt and "✗L" not in txt and lage[0] <= lage[1])
    notiz = pg.evaluate("[...document.querySelectorAll('.dialog-huelle textarea, .fenster textarea')].map(t => t.value).join('|')")
    pruefe("Auftragsfenster: Notiz ohne „aus infoBoard“: " + notiz.replace(chr(10), " / "), "Teile dringend" in notiz and "infoBoard" not in notiz)
    pg.click("#pl-matinfo .mat-info__l"); pg.wait_for_timeout(300)
    pruefe("ca. antippen erklärt es", "Länge des Fertigteils" in pg.inner_text("body"))
    pg.screenshot(path="/tmp/matinfo_fenster.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    zz = vorschau("mA")
    mia = next((t for t in zz if t.startswith("Mat. info.")), "fehlt")
    # Seit 1.97.0 auf die ganze Fertigungsmenge: Länge 7 + 2,5 + 0,5 = 10 mm, 275 je Stange,
    # 5'000 → 19 Stangen (auf die offenen 4'000 wären es 15)
    pruefe("Laufender Auftrag (mA, 1'000 von 5'000 gemacht): Mat. info. auf die ganze Menge: " + mia, mia.startswith("Mat. info.") and "/ 19 Stangen" in mia.replace("\n", " "))

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
    pruefe("Keine vorgegebenen Mengen", pg.locator(".mat-dialog button:has-text('50 kg'), .mat-dialog button:has-text('20 kg')").count() == 0)
    # In Stangen mit Komma eintippen, die kg stehen gleich daneben
    pg.click(".mat-dialog button:has-text('Stangen')")
    pg.fill("#mat-menge", "2,5")
    u = pg.inner_text("#mat-umrechnung")
    pruefe("Stangen zeigen kg und Faktor der Farbe: " + u, "kg" in u and "ca." in u and "Rostfrei Chromstahl, 7,8 g/cm³" in u)
    pg.click(".mat-dialog .mat-knoepfe button:text-is('kg')")
    kg = pg.input_value("#mat-menge")
    pruefe("Umschalten rechnet um: " + kg + " / " + pg.inner_text("#mat-umrechnung"), "," in kg and "Stangen" in pg.inner_text("#mat-umrechnung"))
    pg.click(".mat-dialog .mat-knoepfe button:text-is('Stangen')")
    pg.fill("#mat-menge", "2,5")
    pg.screenshot(path="/tmp/material_rest.png")
    pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(1500)
    pruefe("Rest gespeichert", pg.evaluate("TEST.daten.material_posten.some(p => !p.job_id && p.einheit === 'kg' && p.menge > 20 && p.menge < 30 && p.ort === 'Restelager')"))
    pruefe("Posten aufgebraucht", pg.evaluate("!!TEST.daten.material_posten.find(p => p.notiz === 'Regal 3 unten').weg_am"))
    pruefe("Auftrag fertig", pg.evaluate("TEST.daten.jobs.find(j => j.id === 'mA').plan_status") == "fertig")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
