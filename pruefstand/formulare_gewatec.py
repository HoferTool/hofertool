# Druckformulare wie im Gewatec (1.935.0): Rechnung, Lieferschein,
# Auftragsbestätigung, Bestellung in vier Arten und Angebot. Erfundene
# Musterdaten (keine echten Kunden). Jedes Blatt wird als PDF gedruckt;
# mit FORMULAR_BILDER=<ordner> bleiben PDF und PNG zum Ansehen liegen.
import time, os, subprocess
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("FORMULAR_BILDER", "/tmp/formulare")
os.makedirs(BILD, exist_ok=True)
fehler = []
PFL = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

SAAT = """
TEST.daten.erp_partner = [
  { id: 'k1', art: 'kunde', nr: '10099', name: 'Muster Antriebe AG', aktiv: true,
    daten: { adresse: { strasse: 'Industriestrasse 8', plz: '9999', ort: 'MUSTERHAUSEN' }, telefon: '0041 99 111 22 33', fax: '0041 99 111 22 34' } },
  { id: 'l1', art: 'lieferant', nr: '70099', name: 'Beispiel Metall AG', aktiv: true,
    daten: { adresse: { strasse: 'Werkweg 5', plz: '9998', ort: 'BEISPIELDORF' }, telefon: '0041 99 222 33 44', fax: '0041 99 222 33 45' } },
  { id: 'l2', art: 'lieferant', nr: '70098', name: 'Finish Oberflächen AG', aktiv: true,
    daten: { adresse: { zusatz: 'Oberflächenfinish', strasse: 'Ulmenweg 1', plz: '9997', ort: 'TESTINGEN' }, telefon: '0041 99 333 44 55' } } ];
TEST.daten.erp_bedingungen = [
  { id: 'b1', art: 'liefer', text: 'ab Werk' }, { id: 'b2', art: 'zahlung', text: '14 Tage 2.00% Skonto, 30 Tage netto' } ];
TEST.daten.erp_lager = [];
TEST.daten.erp_artikel = [
  { id: 'r1', art: 'rohmaterial', nr: '10129-0053', bezeichnung: '11SMnPb37 rd 014 mm h9', einheit: 'kg', aktiv: true, arbeitsplan: [], daten: { text: 'Stangenlänge 3000 mm\\nangespitzt + angefast' } },
  { id: 'r2', art: 'rohmaterial', nr: 'R-CU', bezeichnung: 'CuNi7Zn39Pb3Mn2 rd 017 mm h9 CW400J', einheit: 'kg', aktiv: true, arbeitsplan: [], daten: {} },
  { id: 'a1', art: 'hofer', nr: '10099-0381', idx: 'F', bezeichnung: 'Getriebedeckel Ø 16 x 7 blank', zeichnung: '416.0000.02', einheit: 'Stk', aktiv: true, arbeitsplan: [],
    daten: { kunden_nr: '416.0000.02', rohmaterial_id: 'r2', zolltarif: '7415.3910', gewicht: 0.0066 } },
  { id: 'a2', art: 'hofer', nr: '10099-0594', idx: 'A', bezeichnung: 'Gehäuse Ø 32 x 24.85 blank', zeichnung: '420.0000.00', einheit: 'Stk', aktiv: true, arbeitsplan: [],
    daten: { kunden_nr: '420.0000.02', material: 'X14CrMoS17 rd 033 mm h9 1.4104', zolltarif: '7318.1910' } } ];
TEST.daten.erp_belege = [
  { id: 'ab1', typ: 'auftrag', nr: '2026000640', partner_id: 'k1', art: 'rahmen', status: 'offen', datum: '2026-11-27',
    daten: { ihre_nr: '4600000425', ihre_datum: '2026-01-26', zeichen: 'Muster', liefer: 'b1', zahlung: 'b2', versand: 'via Spedition Muster',
      anschrift: { name: 'Muster Antriebe AG', strasse: 'Industriestrasse 8', plz: '9999', ort: 'Musterhausen' } } },
  { id: 'ls1', typ: 'lieferschein', nr: '2026015407', partner_id: 'k1', status: 'offen', datum: '2026-11-27', bezug_id: 'ab1',
    daten: { anschrift: { name: 'Muster Antriebe AG', strasse: 'Industriestrasse 8', plz: '9999', ort: 'Musterhausen' }, ihre_nr: '4600000425', ihre_datum: '2026-01-26',
      zeichen: 'Muster', liefer: 'b1', versand: 'via Spedition Muster', verpackung: '49 Renfer=3 Geb.HoCo', verp_kosten: '42.00' } },
  { id: 're1', typ: 'rechnung', nr: '2026009600', partner_id: 'k1', status: 'offen', datum: '2026-11-27', bezug_id: 'ls1',
    daten: { liefer: 'b1', zahlung: 'b2', anschrift: { name: 'Muster Antriebe AG', strasse: 'Industriestrasse 8', plz: '9999', ort: 'MUSTERHAUSEN' } } },
  { id: 'be1', typ: 'bestellung', nr: '2026008792', partner_id: 'l1', art: 'einzel', status: 'offen', datum: '2026-11-27', daten: { bestellart: 'rohmaterial' } },
  { id: 'be2', typ: 'bestellung', nr: '2026008790', partner_id: 'l2', art: 'einzel', status: 'offen', datum: '2026-11-26', daten: { bestellart: 'za' } },
  { id: 'be3', typ: 'bestellung', nr: '2026008789', partner_id: 'l2', art: 'einzel', status: 'offen', datum: '2026-11-26', daten: { bestellart: 'auftrag_ls' } },
  { id: 'be4', typ: 'bestellung', nr: '2026008788', partner_id: 'l2', art: 'einzel', status: 'offen', datum: '2026-11-30', daten: { bestellart: 'ls_bestellung' } } ];
TEST.daten.erp_positionen = [
  { id: 'ap1', beleg_id: 'ab1', pos: 10, artikel_id: 'a1', menge: 100000, einheit: 'Stk', preis: 110, daten: { pe: 100,
    abrufe: [{ kw: '51/26', menge: 5000, bemerkung: '4501061686 Pos.10 v. 15.10.26' }, { kw: '2/27', menge: 5000, bemerkung: '4501066788 v. 02.11.26' }, { termin: '', kw: '', menge: 41349, bemerkung: '' }] } },
  { id: 'ap2', beleg_id: 'ab1', pos: 20, artikel_id: 'a2', menge: 528, einheit: 'Stk', preis: 3.72, termin: '2026-12-15', daten: {} },
  { id: 'lp1', beleg_id: 'ls1', pos: 10, artikel_id: 'a1', menge: 5096, einheit: 'Stk', bezug_id: 'ap1', text: '4501038383 Pos.10 v. 28.07.26', daten: { charge: 'FA-1' } },
  { id: 'lp2', beleg_id: 'ls1', pos: 20, artikel_id: 'a2', menge: 528, einheit: 'Stk', bezug_id: 'ap2', daten: {} },
  { id: 'rp1', beleg_id: 're1', pos: 10, artikel_id: 'a1', menge: 5096, einheit: 'Stk', preis: 110, bezug_id: 'lp1', text: '4501038383 Pos.10 v. 28.07.26', daten: { pe: 100 } },
  { id: 'rp2', beleg_id: 're1', pos: 20, artikel_id: 'a2', menge: 528, einheit: 'Stk', preis: 3.72, bezug_id: 'lp2', daten: { pe: 1 } },
  { id: 'bp1', beleg_id: 'be1', pos: 10, artikel_id: 'r1', menge: 65, einheit: 'kg', preis: 2.2, termin: '2026-11-27', daten: { lp_bemerkung: 'wird heute vormittag abgeholt', ausfuehrung: 'gezogen', komm: '10129-0053' } },
  { id: 'bp2', beleg_id: 'be2', pos: 10, artikel_id: 'a2', menge: 87950, einheit: 'Stk', preis: 0, termin: '2026-12-15', daten: { vorschrift: 'Entgraten' } },
  { id: 'bp3', beleg_id: 'be3', pos: 10, artikel_id: 'a2', menge: 9650, einheit: 'Stk', termin: '2026-12-02', daten: { vorschrift: 'Trowalisieren' } },
  { id: 'bp4', beleg_id: 'be4', pos: 10, artikel_id: 'a1', menge: 80400, einheit: 'Stk', termin: '2026-12-15', daten: { vorschrift: 'Entgraten' } } ];
TEST.daten.erp_bewegungen = [];
TEST.daten.kalkulationen = [{ id: 'kk1', nr: 'K-1', kunde: 'Muster Antriebe AG', artikel: '10099-0803',
  daten: { kopf: { artikel: '10099-0803', index: 'AB', zeichnung: '700000000169', bezeichnung: 'Pinion Ø 19.05 x 20.8 blank', kunde: 'Muster Antriebe AG',
      strasse: 'Industriestrasse 8', plz: '9999', ort: 'MUSTERHAUSEN', zeichen: 'I. Muster', kundencode: '10099', anfrage: '2026-11-17' }, ags: [],
    material: { bez: 'X105CrMo17 rd 020 mm h9' }, preis: { pe: '1', waehrung: 'CHF', rundung: '0.01' },
    angebot: { lieferzeit: '20 Arbeitswochen ab Bestelleingang oder nach Absprache', lieferbed: 'franko Domizil, inkl. Verpackung', zahlung: '30 Tage netto',
      gueltig: 'Offerte freibleibend, gültig 1 Monat ab Offertdatum. (Materialpreisveränderungen ausgenommen)' },
    staffeln: [{ menge: '40', lose: '1', angebot: '92.5' }, { menge: '80', lose: '1', angebot: '54' }, { menge: '120', lose: '1', angebot: '40' }] } }];
TEST.daten.kalk_maschinen = [];
TEST.erpAlle = true;
"""

def blatt(pop, name):
    w = pop.value; w.wait_for_load_state(); w.wait_for_timeout(300)
    txt = w.inner_text("body")
    w.pdf(path=BILD + "/" + name + ".pdf", prefer_css_page_size=True, print_background=True)
    subprocess.run(["pdftoppm", "-r", "60", "-png", BILD + "/" + name + ".pdf", BILD + "/" + name], check=False)
    seiten = subprocess.run(["pdfinfo", BILD + "/" + name + ".pdf"], capture_output=True, text=True).stdout
    unten = subprocess.run(["pdftotext", "-layout", BILD + "/" + name + ".pdf", "-"], capture_output=True, text=True).stdout
    w.close()
    return txt, seiten, unten

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and PFL.append(m.text[:300])); pg.on("pageerror", lambda e: PFL.append(str(e)[:200]))
    body = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { erpSehen: true, kalkulationSehen: true };\n" + SAAT
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/erp", wait_until="domcontentloaded"); pg.wait_for_timeout(1500)
    oben = lambda: pg.locator("[data-erp-beleg]").last

    def beleg(reiter, bid):
        pg.click("[data-erp-reiter='%s']" % reiter); pg.wait_for_timeout(300)
        pg.locator("[data-erp-zeile='%s']" % bid).click(); oben().wait_for()

    def zu():
        while pg.locator("[data-erp-beleg]").count(): pg.locator("[data-erp-beleg] [data-nein]").last.click(); pg.wait_for_timeout(200)

    # Rechnung
    beleg("rechnung", "re1")
    with pg.expect_popup() as pop: oben().locator("[data-erp-drucken]").click()
    t, s, u = blatt(pop, "rechnung")
    pruefe("Unsere UID Nr." in t and "Unsere AB 2026000640 / Lieferschein 2026015407 vom 27.11.2026" in t, "Rechnung: Kopf und Bezug zu AB und Lieferschein")
    pruefe("Summe Porto u. Verpackung" in t and "42.00" in t, "Rechnung: Verpackung aus dem Lieferschein")
    # 5096 × 110 / 100 = 5605.60, 528 × 3.72 = 1964.16, + 42 = 7611.76, MwSt 8.1 % = 616.55
    pruefe("7'611.76" in t and "616.55" in t and "8'228.31" in t, "Rechnung: Summen mit Verpackung und MwSt")
    pruefe("Bankverbindung" in u and "Seite 1 / 1" in u, "Rechnung: Bankverbindung und Seitenzahl im PDF")
    pruefe("Faulhaber" not in t, "keine echten Kundendaten")
    zu()

    # Lieferschein
    beleg("lieferschein", "ls1")
    with pg.expect_popup() as pop: oben().locator("[data-erp-drucken]").click()
    t, s, u = blatt(pop, "lieferschein")
    pruefe("Auftragsbestätigung: 2026000640 vom 27.11.2026" in t and "Gelieferte Menge" in t and "Ware erhalten" in t, "Lieferschein wie Gewatec")
    pruefe("CHF" in t and "42.00" in t and "präferenzbegünstigte Schweizer Ursprungswaren" in t, "Lieferschein: Verpackungskosten und Ursprung")
    zu()

    # Auftragsbestätigung
    beleg("auftrag", "ab1")
    with pg.expect_popup() as pop: oben().locator("[data-erp-ab-drucken]").click()
    t, s, u = blatt(pop, "ab")
    pruefe("LIEFERPLAN:" in t and "KW 51/26" in t and "Netto-Warenwert in CHF" in t and "Mit freundlichen Grüssen" in t and "Ursprungswaren" in t, "Auftragsbestätigung wie Gewatec")
    pruefe("110'000.00" in t, "AB: Betrag 100'000 × 110 / 100")
    zu()

    # Bestellungen, vier Arten
    for bid, name, muss, nicht in [
        ("be1", "be-rohmaterial", ["Materialzertifikat", "Lieferadresse:", "Bitte senden Sie uns eine Auftragsbestätigung!", "143.00", "wird heute vormittag abgeholt"], []),
        ("be2", "be-za", ["Bearbeitungsvorschrift:", "Entgraten", "Netto-Warenwert", "Auftragsbestätigung!"], ["Materialzertifikat"]),
        ("be3", "be-auftrag-ls", ["Auftrag / Lieferschein", "Trowalisieren", "LIEFERPLAN:"], ["E-PREIS", "Netto-Warenwert", "Auftragsbestätigung!"]),
        ("be4", "be-ls-bestellung", ["Lieferschein zu Bestellung", "Entgraten"], ["E-PREIS", "Netto-Warenwert", "Auftragsbestätigung!"])]:
        beleg("bestellung", bid)
        with pg.expect_popup() as pop: oben().locator("[data-erp-drucken]").click()
        t, s, u = blatt(pop, name)
        pruefe(all(x in t for x in muss) and not any(x in t for x in nicht), "Bestellung %s: %s" % (name, [x for x in muss if x not in t] + [x for x in nicht if x in t]))
        zu()

    # Angebot aus der Kalkulation
    pg.click("[data-erp-reiter='kalk']"); pg.wait_for_timeout(800)
    pg.fill("#kalk-suche", "K-"); pg.wait_for_timeout(300)
    pg.click("tr[data-kalk='kk1']"); pg.wait_for_selector("#kalk-band")
    pg.locator("[data-kalk-reiter='angebot']").click(); pg.wait_for_timeout(300)
    with pg.expect_popup() as pop: pg.click("#kalk-pdf")
    t, s, u = blatt(pop, "angebot")
    pruefe("Ihre Anfrage vom 17.11.2026" in t and "Preis (exkl. MwSt.)" in t and "92.50" in t and "Offerte freibleibend" in t, "Angebot wie Gewatec")
    # Designer (1.936.0): Text ändern und ausschalten, Vorschau, Speichern, Druck danach
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/erp", wait_until="domcontentloaded"); pg.wait_for_timeout(1200)
    pg.click("[data-erp-reiter='stamm']"); pg.wait_for_timeout(300)
    pg.click("[data-erp-stamm='formulare']"); pg.wait_for_selector("[data-fd-form]")
    pg.select_option("[data-fd-form]", "re"); pg.wait_for_timeout(200)
    pg.fill("[data-fd-text='firma']", "Probe-Firmenzeile {nr}"); pg.wait_for_timeout(400)
    vt = pg.frame_locator(".fd-vorschau").locator("body").inner_text()
    pruefe("Probe-Firmenzeile 2026000003" in vt and "Ursprungswaren" in vt, "Designer: Vorschau zeigt geänderten Text mit Platzhalter")
    pg.uncheck("[data-fd-an='ursprung']"); pg.uncheck("[data-fd-schalter='bank']"); pg.wait_for_timeout(400)
    vt = pg.frame_locator(".fd-vorschau").locator("body").inner_text()
    pruefe("Ursprungswaren" not in vt and "Bankverbindung" not in vt, "Designer: Text und Bankverbindung ausschalten")
    pg.screenshot(path=BILD + "/designer.png")
    pruefe("nicht geladen" not in pg.locator("body").inner_text(), "Designer: Einstellungen geladen")
    breit = pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    pruefe(breit, "Designer: kein seitliches Rollen")
    pg.click("#fd-speichern"); pg.wait_for_timeout(600)
    gesp = pg.evaluate("JSON.stringify((TEST.daten.app_config || []).find(x => x.schluessel === 'formulare') || null)")
    pruefe(gesp and "Probe-Firmenzeile" in gesp, "Designer: in app_config gespeichert")
    beleg("rechnung", "re1")
    with pg.expect_popup() as pop: oben().locator("[data-erp-drucken]").click()
    t, s, u = blatt(pop, "rechnung-designer")
    pruefe("Probe-Firmenzeile 2026009600" in t and "Ursprungswaren" not in t and "Bankverbindung" not in u, "Designer: Druck übernimmt die Einstellungen")
    zu()
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.click("[data-erp-reiter='stamm']"); pg.wait_for_timeout(300); pg.click("[data-erp-stamm='formulare']"); pg.wait_for_timeout(500)
    pruefe(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Designer am Handy: kein seitliches Rollen")
    br.close()

pruefe(not PFL, "keine Fehler in der Konsole: %s" % PFL[:3])
print("Fehler:", ", ".join(fehler) if fehler else "keine")
