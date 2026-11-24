# Reklamationsmanagement (1.746.0, Wunsch Patrick 23. November 2026):
# Reiter in der Qualitätssicherung, Reklamation zur HOCO Nr. erfassen,
# 8D mit Häkchen, Häkchen einer früheren Reklamation derselben HOCO Nr.
# übernehmen, 8D-Bericht als PDF.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("RK_BILDER", "")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    # Eine frühere Reklamation derselben HOCO Nr.
    pg.evaluate("""() => { TEST.daten.reklamationen = [{ id: 'rk1', nr: 'RK26-001', art: 'kunde', partner: 'Kunde A',
        eingang: '2026-10-02', hoco_nr: '10000-0301', fehler: 'Durchmesser zu gross', fehlerart: 'Mass ausser Toleranz',
        status: 'abgeschlossen', kontakt: 'Herr Alt', kopf: { adresse: 'Gasse 5\\n4500 Solothurn', kunden_art: 'KA-77', index: 'C' }, dateien: [], achtd: { d4: ['Werkzeugverschleiss'], d5: ['Endkontrolle verschärfen'] } }];
        TEST.daten.erp_partner = [{ id: 'p1', art: 'kunde', nr: '10000', name: 'Muster AG', aktiv: true,
          daten: { adresse: { strasse: 'Weg 1', plz: '3000', ort: 'Bern', land: 'CH' }, kontakte: [{ name: 'Frau Test' }] } }];}""")
    pg.evaluate("location.hash='#/qs'"); pg.wait_for_timeout(1200)
    tab = pg.locator("[data-reiter='reklamationen'], button:has-text('Reklamationsmanagement')").first
    if not tab.count(): fehler.append("Reiter Reklamationsmanagement fehlt")
    tab.click(); pg.wait_for_selector("#rk")
    if not pg.locator("#rk-leer").count() and pg.locator("[data-rk]").count(): fehler.append("Abgeschlossene im Filter Offen")
    pg.click("[data-rkstand='alle']"); pg.wait_for_selector("[data-rk='RK26-001']")
    if BILDER: pg.screenshot(path=BILDER + "/rk-liste.png")
    # Neue Reklamation
    pg.click("#rk-neu"); pg.wait_for_selector("#rk-fenster")
    # Kunde aus den Stammdaten: Nummer eintippen füllt Name, Adresse, Kontakt
    pg.fill("#rk-f-partner", "10000"); pg.locator("#rk-f-partner").blur(); pg.wait_for_timeout(300)
    if pg.input_value("#rk-f-partner") != "Muster AG": fehler.append("Kunde nicht aus Stammdaten: " + pg.input_value("#rk-f-partner"))
    if "Bern" not in pg.input_value("#rk-k-adresse"): fehler.append("Adresse nicht aus Stammdaten")
    if pg.input_value("#rk-f-kontakt") != "Frau Test": fehler.append("Kontakt nicht aus Stammdaten")
    # Vorschau rechts zeigt live, was eingetragen ist (1.749.0)
    if "Muster AG" not in pg.inner_text("#rk-vorschau"): fehler.append("Vorschau ohne Kunde")
    if not pg.locator("#rk-vorschau section[data-s='kopf']").count(): fehler.append("Vorschau ohne Teil kopf")
    if pg.locator("[data-rk8d]").count(): fehler.append("Fragebogen zeigt schon die 8D-Schritte")
    pg.fill("#rk-f-partner", "Kunde B")
    if "Kunde B" not in pg.inner_text("#rk-vorschau"): fehler.append("Vorschau nicht live")
    # Früherer Kunde ohne Stammdaten: Kontakt und Adresse aus der letzten Reklamation (1.752.0)
    pg.fill("#rk-f-kontakt", ""); pg.fill("#rk-k-adresse", "")
    pg.fill("#rk-f-partner", "Kunde A"); pg.locator("#rk-f-partner").blur(); pg.wait_for_timeout(300)
    if pg.input_value("#rk-f-kontakt") != "Herr Alt": fehler.append("Kontakt nicht aus früherer Reklamation")
    if "Solothurn" not in pg.input_value("#rk-k-adresse"): fehler.append("Adresse nicht aus früherer Reklamation")
    if not pg.locator("#rk-stamm option[value='Kunde A']").count(): fehler.append("Früherer Kunde fehlt in Vorschlägen")
    pg.fill("#rk-f-partner", "Kunde B")
    pg.click("#rk-weiter"); pg.wait_for_selector("#rk-f-hoco_nr")
    pg.fill("#rk-f-hoco_nr", "10000-0301"); pg.locator("#rk-f-hoco_nr").blur(); pg.wait_for_timeout(600)
    if not pg.locator("#rk-frueher [data-rkuebernehmen='RK26-001']").count(): fehler.append("Frühere Reklamation nicht angezeigt")
    if pg.locator("#rk-k-kunden_art").count() and pg.input_value("#rk-k-kunden_art") != "KA-77": fehler.append("Kunden Art. Nr. nicht vorgeschlagen")
    pg.click("[data-rkuebernehmen='RK26-001']"); pg.wait_for_timeout(300)
    pg.click("[data-rkschritt='d4']"); pg.wait_for_selector("[data-rk8d='d4']")
    if "Werkzeugverschleiss" not in pg.inner_text("#rk-vorschau section[data-s='d4']"): fehler.append("Vorschau ohne Ursache")
    an = pg.locator(".rk-haken__punkt.an").all_inner_texts()
    if not any("Werkzeugverschleiss" in x for x in an): fehler.append("Häkchen nicht übernommen: " + str(an))
    # „Wie festgelegt“ kreuzt in D6 die eingeführten Massnahmen zu D5 an
    pg.click("[data-rkschritt='d5']")
    if pg.locator(".rk-gruppe__name").count() < 3: fehler.append("Massnahmen nicht in Gruppen")
    pg.click("[data-rk8d='d5'] [data-rkhaken='Dokumente anpassen']")
    pg.click("#rk-weiter")
    pg.click("#rk-wiegeplant"); pg.wait_for_timeout(200)
    an7 = pg.locator("[data-rk8d='d6'] .rk-haken__punkt.an").all_inner_texts()
    if not any("Dokumente wurden angepasst" in x for x in an7): fehler.append("Wie geplant: " + str(an7))
    pg.click("[data-rkschritt='artikel']"); pg.wait_for_timeout(150); pg.fill("#rk-k-lieferschein", "LS-1")
    pg.click("[data-rkschritt='d3']"); pg.click("[data-rk8d='d3'] [data-rkhaken='Ersatzlieferung']")
    # Speichern ohne Problembeschreibung springt zum Schritt Problem
    pg.click("#rk-speichern"); pg.wait_for_timeout(300)
    if not pg.locator("#rk-f-fehler").count(): fehler.append("Kein Sprung zum Problem")
    pg.fill("#rk-f-fehler", "Gewinde nicht gängig")
    if "Gewinde nicht" not in pg.inner_text("#rk-vorschau section[data-s='d2']"): fehler.append("Vorschau ohne Problem")
    # Klassisches 8D: D1 Team mit Namen, D2 Fehlerart zum Ankreuzen
    pg.click("[data-rkschritt='d1']"); pg.wait_for_selector("[data-rk8d='d1']")
    pg.click("[data-rk8d='d1'] [data-rkhaken='Qualität']")
    pg.click("[data-rkschritt='d2']"); pg.click("[data-rk8d='d2'] [data-rkhaken='Gewindefehler']")
    # Liste selbst bearbeiten (1.766.0): eigener Punkt dazu, einer umbenannt,
    # gilt für alle (app_config.rk_punkte)
    pg.click("[data-rkschritt='d7']"); pg.wait_for_selector("[data-rkliste='d7']")
    pg.click("[data-rkliste='d7']"); pg.wait_for_selector("[data-rkliste-feld='d7']")
    if BILDER: pg.screenshot(path=BILDER + "/rk-liste-bearbeiten.png")
    n = pg.locator("[data-rkliste-feld='d7'] [data-rkliste-punkt]").count()
    pg.locator("[data-rkliste-feld='d7'] [data-rkliste-punkt]").nth(n - 1).fill("Eigener Punkt Test")
    pg.locator("[data-rkliste-feld='d7'] [data-rkliste-punkt='0-0']").fill("Auf alle ähnlichen Teile übertragen")
    pg.click("[data-rkliste-weg='0-1']")
    pg.click("[data-rkliste-speichern]"); pg.wait_for_timeout(500)
    if pg.locator("[data-rkliste-feld]").count(): fehler.append("Listenfeld nach Speichern noch offen")
    if not pg.locator("[data-rk8d='d7'] [data-rkhaken='Eigener Punkt Test']").count(): fehler.append("Eigener Punkt fehlt")
    if pg.locator("[data-rk8d='d7'] [data-rkhaken='Hinweis im Einrichtblatt']").count(): fehler.append("Gelöschter Punkt noch da")
    if not pg.locator("[data-rk8d='d7'] [data-rkhaken='Auf alle ähnlichen Teile übertragen']").count(): fehler.append("Umbenennen ging nicht")
    cfg = pg.evaluate("() => (TEST.daten.app_config || []).find(x => x.schluessel === 'rk_punkte')")
    if not cfg or "Eigener Punkt Test" not in cfg.get("wert", ""): fehler.append("Liste nicht gespeichert: " + str(cfg))
    pg.click("[data-rk8d='d7'] [data-rkhaken='Eigener Punkt Test']")
    if "Eigener Punkt Test" not in pg.inner_text("#rk-vorschau section[data-s='d7']"): fehler.append("Eigener Punkt nicht in Vorschau")
    # Bild zu einem D-Punkt (1.767.0): erscheint gleich in der Vorschau unter D7
    png = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d4944415478da63f8cfc0f01f0005000201e2a6f1e90000000049454e44ae426082")
    pg.set_input_files("[data-rkdfeld='d7']", files=[{"name": "massnahme.png", "mimeType": "image/png", "buffer": png}])
    pg.wait_for_timeout(300)
    if not pg.locator("#rk-vorschau section[data-s='d7'] .dbilder img").count(): fehler.append("Bild D7 nicht in Vorschau")
    if pg.locator("#rk-vorschau section[data-s='d3'] .dbilder img").count(): fehler.append("Bild D7 bei D3")
    vt = pg.inner_text("#rk-vorschau")
    if not pg.locator("#rk-vorschau ul.auf li").count(): fehler.append("Angekreuztes nicht als Aufzählung")
    for x in ("D1", "D8", "Team", "Abstellmassnahmen einführen"):
        if x not in vt: fehler.append("Vorschau ohne " + x)
    if BILDER: pg.screenshot(path=BILDER + "/rk-fenster.png", full_page=True)
    # Bericht speichert zuerst und lädt ein PDF
    with pg.expect_download(timeout=30000) as d:
        pg.click("#rk-bericht")
    if BILDER: d.value.save_as(BILDER + "/rk.pdf")
    if not d.value.suggested_filename.startswith("8D-Bericht RK"): fehler.append("PDF-Name: " + d.value.suggested_filename)
    z = pg.evaluate("() => TEST.daten.reklamationen.find(r => r.partner === 'Kunde B')")
    if not z: fehler.append("Neue Reklamation nicht gespeichert")
    else:
        if "Ersatzlieferung" not in (z.get("achtd") or {}).get("d3", []): fehler.append("D3 nicht gespeichert: " + str(z.get("achtd")))
        if "Gewindefehler" not in (z.get("achtd") or {}).get("d2", []): fehler.append("D2 nicht gespeichert")
        if "Qualität" not in (z.get("achtd") or {}).get("d1", []): fehler.append("D1 nicht gespeichert")
        if "Eigener Punkt Test" not in (z.get("achtd") or {}).get("d7", []): fehler.append("Eigener Punkt nicht gespeichert")
        if z.get("nr") != "RK26-002": fehler.append("Nummer: " + str(z.get("nr")))
        dd = [x for x in (z.get("dateien") or []) if x.get("d") == "d7"]
        if len(dd) != 1 or dd[0].get("typ") != "bild": fehler.append("Bild D7 nicht gespeichert: " + str(z.get("dateien")))
        if (z.get("kopf") or {}).get("lieferschein") != "LS-1": fehler.append("Kopf nicht gespeichert: " + str(z.get("kopf")))
    pg.click("#rk-fenster [data-zu]"); pg.wait_for_timeout(500)
    # Stammdaten aus dem Bericht (1.776.0): gemerkt in app_config.rk_stamm,
    # beim nächsten Mal genügt der Name
    st = pg.evaluate("() => (TEST.daten.app_config || []).find(x => x.schluessel === 'rk_stamm')")
    if not st or "kunde:kunde b" not in st.get("wert", ""): fehler.append("Stammdaten nicht gemerkt: " + str(st))
    pg.click("#rk-neu"); pg.wait_for_selector("#rk-fenster")
    pg.evaluate("() => { TEST.daten.reklamationen = TEST.daten.reklamationen.filter(r => r.partner !== 'Kunde B'); }")
    pg.fill("#rk-f-partner", "kunde b"); pg.locator("#rk-f-partner").blur(); pg.wait_for_timeout(300)
    if pg.input_value("#rk-f-partner") != "Kunde B": fehler.append("Name nicht wie gemerkt: " + pg.input_value("#rk-f-partner"))
    if pg.input_value("#rk-f-kontakt") != "Herr Alt": fehler.append("Kontakt nicht aus Gemerktem: " + pg.input_value("#rk-f-kontakt"))
    if "Solothurn" not in pg.input_value("#rk-k-adresse"): fehler.append("Adresse nicht aus Gemerktem")
    pg.click("#rk-fenster [data-zu]"); pg.wait_for_timeout(500)
    if pg.locator(".dialog-huelle").count():
        b = pg.locator(".dialog-huelle button:has-text('Verwerfen'), .dialog-huelle button:has-text('Schliessen')")
        if b.count(): b.first.click(); pg.wait_for_timeout(300)
    # Interne Reklamation: kein „8D-Report“ im Titel, Kopf bleibt
    pg.click("#rk-neu"); pg.wait_for_selector("#rk-fenster")
    pg.click("[data-rkfart='intern']"); pg.wait_for_timeout(200)
    h1 = pg.inner_text("#rk-vorschau h1")
    if "Interne Reklamation" not in h1 or "8D" in h1: fehler.append("Titel intern: " + h1)
    if not pg.locator("#rk-vorschau .kacheln").count(): fehler.append("Kopf intern fehlt")
    if "8D" in pg.inner_text("#rk-bericht"): fehler.append("Knopf intern: " + pg.inner_text("#rk-bericht"))
    if BILDER: pg.screenshot(path=BILDER + "/rk-intern.png")
    pg.click("#rk-fenster [data-zu]"); pg.wait_for_timeout(500)
    # Dunkel
    pg.evaluate("document.body.classList.add('dunkel')")
    pg.click("[data-rk='RK26-001']"); pg.wait_for_selector("#rk-fenster")
    pg.wait_for_timeout(800)
    if BILDER: pg.screenshot(path=BILDER + "/rk-dunkel.png")
    # Schmaler Bildschirm: Vorschau hinter dem Knopf
    pg.set_viewport_size({"width": 900, "height": 900}); pg.wait_for_timeout(300)
    if pg.locator("#rk-vorschau").is_visible(): fehler.append("Vorschau schmal sichtbar")
    pg.click("#rk-vorschau-knopf"); pg.wait_for_timeout(200)
    if not pg.locator("#rk-vorschau").is_visible(): fehler.append("Vorschau-Knopf geht nicht")
    if BILDER: pg.screenshot(path=BILDER + "/rk-schmal.png")
    br.close()

print("Fehler:", "keine" if not fehler else "\n  " + "\n  ".join(fehler))
