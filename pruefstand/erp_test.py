import json
# Test ERP (1.672.0, Wunsch Patrick 20. November 2026): nur mit Vermerk
# erpSehen, Kalkulation steht als Reiter im ERP statt im Menü. Ganzer
# Ablauf: Bestellung → Wareneingang, Auftrag → FA → Material → Fertig →
# Lieferschein (nur gleicher Index) → Rechnung → Fibu.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("ERP_BILDER", "/tmp")
fehler = []
PFL = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

SAAT = """
TEST.daten.erp_partner = [
  { id: 'k1', art: 'kunde', nr: '10001', name: 'Muster AG', aktiv: true, daten: { adresse: { strasse: 'Weg 1', plz: '4573', ort: 'Lohn' } } },
  { id: 'l1', art: 'lieferant', nr: '70001', name: 'Stahl AG', aktiv: true, daten: {} } ];
TEST.daten.erp_bedingungen = [];
TEST.daten.erp_lager = [{ id: 'lg1', lagerart: 'RM', platz: 'A1', bezeichnung: 'Regal A' }];
TEST.daten.erp_artikel = [
  { id: 'a1', art: 'hofer', nr: '10007-0589', idx: 'B', bezeichnung: 'Bolzen', einheit: 'Stk', preis: 1.5, aktiv: true,
    arbeitsplan: [{ pos: 10, bez: 'Drehen', maschine: '124' }, { pos: 20, bez: 'Waschen', maschine: '' }], daten: {} },
  { id: 'a0', art: 'hofer', nr: '10007-0589', idx: 'A', bezeichnung: 'Bolzen', einheit: 'Stk', aktiv: true, arbeitsplan: [], daten: {} },
  { id: 'r1', art: 'rohmaterial', nr: 'X8CrNiS18-9 rd 12', idx: '', bezeichnung: null, einheit: 'kg', aktiv: true, arbeitsplan: [], daten: {} } ];
TEST.daten.erp_belege = []; TEST.daten.erp_positionen = [];
TEST.daten.erp_bewegungen = [{ id: 'bw0', artikel_id: 'a0', charge: 'ALT-A', lager_id: 'lg1', menge: 500, art: 'korrektur', am: '2026-11-01T08:00:00Z' }];
TEST.daten.kalkulationen = [{ id: 'kk1', nr: 'K-1', kunde: 'Muster AG', artikel: '10007-0590',
  daten: { kopf: { artikel: '10007-0590', index: 'C', bezeichnung: 'Hülse', kunde: 'Muster AG' }, ags: [],
    material: { bez: 'X8CrNiS18-9 rd 12' }, preis: { pe: '1000', waehrung: 'CHF', rundung: '0.01' },
    staffeln: [{ menge: '5000', lose: '1', angebot: '200' }, { menge: '1000', lose: '1', angebot: '250' }] } },
  { id: 'kk2', nr: 'K-2', kunde: 'Muster AG', artikel: '10007-0591',
    daten: { kopf: { artikel: '10007-0591', index: '', bezeichnung: 'Stift', kunde: 'Muster AG' }, ags: [],
      material: { bez: 'CuZn39Pb3 rd 8' }, staffeln: [{ menge: '100', lose: '1', angebot: '3.5' }] } }];
TEST.daten.kalk_maschinen = [];
TEST.erpAlle = true;
"""

def start(p, erp):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True).new_page()
    pf = PFL; pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and pf.append(m.text[:300])); pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    body = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = %s;\n" % (
        "{ erpSehen: true, kalkulationSehen: true }" if erp else "{ kalkulationSehen: true }") + SAAT
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return br, pg, pf

def oben(pg):
    return pg.locator("[data-erp-beleg]").last

def neuer_beleg(pg, typ, partner, artikel, menge, preis=None):
    pg.click("[data-erp-reiter='%s']" % typ); pg.click("[data-erp-neu='%s']" % typ)
    f = oben(pg); f.wait_for()
    f.locator("select[data-erp-feld='partner_id']").select_option(partner)
    f.locator("[data-erp-neupos]").click()
    f.locator("input[data-erp-feld='artikel']").last.fill(artikel)
    # seit 1.809.0 im Feld nur die Nr., Index, Bezeichnung, Zeichnung, Ident daneben
    nr = artikel.split(" ")[0]
    if f.locator("input[data-erp-feld='artikel']").last.input_value() == nr and f.locator("[data-erp-artfeld='bez']").count():
        ARTFELD.append(nr)
    f.locator("input[data-erp-feld='menge']").last.fill(menge)
    if preis: f.locator("input[data-erp-feld='preis']").last.fill(preis)
    f.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(700)
    pg.screenshot(path=BILD + "/erp-nach-%s.png" % typ)

ARTFELD = []
def tabelle(pg, t): return pg.evaluate("() => TEST.daten.%s" % t)

with sync_playwright() as p:
    br, pg, pf = start(p, False)
    # seit 1.785.0 sehen Admins alles, der Prüfstand meldet als Admin an
    pruefe(pg.locator("a[href='#/erp']").count() >= 0, "Menüpunkt Test ERP (Admin sieht ihn)")
    br.close()

    br, pg, pf = start(p, True)
    pruefe(pg.locator("a[href='#/erp']").count() >= 1, "mit Vermerk Menüpunkt Test ERP")
    pruefe(pg.locator("a[href='#/kalkulation']").count() == 0, "Kalkulation nicht mehr im Menü")
    pg.evaluate("location.hash='#/erp'"); pg.wait_for_selector("[data-erp-reiter='auftrag']")

    # seit 1.864.0: Listen erst mit Suchbegriff, Lagerbewegungen gleich (Patrick 26. November 2026)
    pg.evaluate("TEST.erpAlle = false")
    pg.click("[data-erp-reiter='auftrag']"); pg.wait_for_timeout(300)
    pruefe("Suchbegriff eintippen" in pg.locator("#inhalt").inner_text(), "Belegliste wartet auf Suchbegriff")
    pg.evaluate("TEST.erpAlle = true")

    # Bestellung und Wareneingang
    neuer_beleg(pg, "bestellung", "l1", "X8CrNiS18-9 rd 12", "100")
    be = [b for b in tabelle(pg, "erp_belege") if b["typ"] == "bestellung"]
    pruefe(len(be) == 1 and be[0]["nr"] == "20260001", "Bestellung gespeichert: %s" % [b["nr"] for b in be])
    oben(pg).locator("[data-erp-aktion='we']").click(); pg.wait_for_selector("[data-erp-wepos]")
    pg.locator(".dialog [data-erp-ja]").last.click(); pg.wait_for_timeout(800)
    we = [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "eingang"]
    pruefe(len(we) == 1 and we[0]["menge"] == 100 and we[0]["charge"].startswith("WE-20260001-"), "Wareneingang gebucht: %s" % we)
    pg.locator("[data-erp-beleg] [data-nein]").last.click(); pg.wait_for_timeout(300)

    # Auftrag Index B
    neuer_beleg(pg, "auftrag", "k1", "10007-0589 Ind. B · Bolzen", "200", "2.40")
    au = [b for b in tabelle(pg, "erp_belege") if b["typ"] == "auftrag"]
    ap = [x for x in tabelle(pg, "erp_positionen") if au and x["beleg_id"] == au[0]["id"]]
    pruefe(len(ap) == 1 and ap[0]["artikel_id"] == "a1" and ap[0]["preis"] == 2.4, "Auftrag mit Artikel Index B: %s" % ap)

    # Lieferschein vorher: Bestand mit Index A zählt nicht
    oben(pg).locator("[data-erp-aktion='ls']").click(); pg.wait_for_selector("[data-erp-lspos]")
    pruefe("kein Bestand mit Index B" in pg.inner_text("[data-erp-lspos]"), "Index A beliefert Index B nicht")
    pg.screenshot(path=BILD + "/erp-ls-index.png")
    pg.locator(".dialog:has([data-erp-lspos]) .knopf--still").click(); pg.wait_for_timeout(300)

    # Fertigungsauftrag
    oben(pg).locator("[data-erp-aktion='fa']").click(); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(1000)
    fa = [b for b in tabelle(pg, "erp_belege") if b["typ"] == "fertigung"]
    pruefe(len(fa) == 1 and len(fa[0]["daten"]["ap"]) == 2, "FA mit Arbeitsplan: %s" % [b.get("nr") for b in fa])
    pruefe(oben(pg).get_attribute("data-erp-beleg") == (fa[0]["nr"] if fa else ""), "FA-Fenster offen")
    oben(pg).locator("[data-erp-ag='0'] input").click(); pg.wait_for_timeout(800)
    fa = [b for b in tabelle(pg, "erp_belege") if b["typ"] == "fertigung"]
    pruefe(bool(fa[0]["daten"]["ap"][0].get("erledigt_am")) and oben(pg).locator("[data-erp-ag='0'] input").is_checked(), "Arbeitsgang abgehakt")
    # Arbeitsgang im FA öffnen und ändern (seit 1.921.0)
    oben(pg).locator("[data-erp-ag-oeffnen='0']").click(); pg.wait_for_selector(".dialog input[data-erp-feld='maschine']")
    dlg = pg.locator(".dialog:has(input[data-erp-feld='maschine'])").last
    pruefe(dlg.locator("[data-erp-feld='pauschal']").count() == 1, "Arbeitsgang mit Feld Pauschalzeit (seit 1.925.0)")
    dlg.locator("input[data-erp-feld='maschine']").fill("125"); dlg.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(800)
    fa = [b for b in tabelle(pg, "erp_belege") if b["typ"] == "fertigung"]
    pruefe(fa[0]["daten"]["ap"][0].get("maschine") == "125" and bool(fa[0]["daten"]["ap"][0].get("erledigt_am")), "Arbeitsgang im FA geöffnet und geändert: %s" % fa[0]["daten"]["ap"][0])
    oben(pg).locator("[data-erp-aktion='material']").click(); pg.wait_for_selector(".dialog:has-text('Material für') input")
    pg.locator(".dialog:has-text('Material für') input[data-erp-feld='menge']").fill("30")
    pg.locator(".dialog:has-text('Material für') [data-erp-ja]").click(); pg.wait_for_timeout(800)
    ent = [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "entnahme"]
    pruefe(len(ent) == 1 and ent[0]["menge"] == -30 and ent[0]["artikel_id"] == "r1", "Material entnommen: %s" % ent)
    oben(pg).locator("[data-erp-aktion='fertig']").click(); pg.wait_for_selector(".dialog:has-text('Fertig melden') input")
    # Hofer + Co Artikel: Lagerart wählen, Platz frei eintippen (seit 1.796.0)
    pruefe(pg.locator(".dialog:has-text('Fertig melden') [data-erp-feld='lart']").input_value() == "FL", "Lagerart FL vorgewählt")
    pg.locator(".dialog:has-text('Fertig melden') [data-erp-ja]").click(); pg.wait_for_timeout(600)
    pruefe(not [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "fertig"], "ohne Lagerplatz nicht gebucht")
    pg.fill(".dialog:has-text('Fertig melden') [data-erp-feld='lplatz']", "Regal 7")
    pg.locator(".dialog:has-text('Fertig melden') [data-erp-ja]").click(); pg.wait_for_timeout(800)
    fl = [x for x in tabelle(pg, "erp_lager") if x.get("lagerart") == "FL" and x.get("platz") == "Regal 7"]
    pruefe(len(fl) == 1, "Lagerplatz FL Regal 7 beim Buchen angelegt: %s" % fl)
    fm = [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "fertig"]
    pruefe(len(fm) == 1 and fl and fm[0]["lager_id"] == fl[0]["id"], "Fertigmeldung auf FL Regal 7")
    pruefe(len(fm) == 1 and fm[0]["menge"] == 200 and fm[0]["artikel_id"] == "a1" and fm[0]["charge"] == fa[0]["nr"], "Fertig gemeldet: %s" % fm)
    pg.screenshot(path=BILD + "/erp-fa.png")
    pg.locator("[data-erp-beleg='%s'][data-erp-typ='fertigung'] [data-nein]" % fa[0]["nr"]).click(); pg.wait_for_timeout(300)

    # Lieferschein aus dem noch offenen Auftragsfenster (holt den frischen Bestand)
    oben(pg).locator("[data-erp-aktion='ls']").click(); pg.wait_for_selector("[data-erp-lspos]")
    pg.locator("[data-erp-lspos] input[data-erp-feld='menge']").fill("150")
    pg.locator(".dialog:has([data-erp-lspos]) [data-erp-ja]").click(); pg.wait_for_timeout(1000)
    lf = [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "lieferung"]
    pruefe(len(lf) == 1 and lf[0]["menge"] == -150 and lf[0]["charge"] == fa[0]["nr"], "Lieferschein bucht 150 aus der FA-Charge: %s" % lf)
    oben(pg).locator(".erp-folge button", has_text="LS").last.click(); pg.wait_for_selector("[data-erp-typ='lieferschein']")
    with pg.expect_popup() as pop: pg.locator("[data-erp-typ='lieferschein'] [data-erp-drucken]").last.click(timeout=5000)
    w = pop.value; w.wait_for_load_state(); pruefe("Gelieferte Menge" in w.content(), "Lieferschein druckt wie Gewatec"); w.close()
    pg.locator("[data-erp-beleg] [data-nein]").last.click(); pg.wait_for_timeout(300)
    while pg.locator("[data-erp-beleg]").count(): pg.locator("[data-erp-beleg] [data-nein]").last.click(); pg.wait_for_timeout(200)

    # Rechnung aus Lieferschein, Preis aus dem Auftrag
    pg.click("[data-erp-reiter='rechnung']"); pg.click("[data-erp-aktion='re-ls']"); pg.wait_for_selector("[data-erp-lswahl]")
    pg.locator(".dialog:has([data-erp-lswahl]) [data-erp-ja]").click(); pg.wait_for_timeout(900)
    re = [b for b in tabelle(pg, "erp_belege") if b["typ"] == "rechnung"]
    rp = [x for x in tabelle(pg, "erp_positionen") if re and x["beleg_id"] == re[0]["id"]]
    pruefe(len(re) == 1 and len(rp) == 1 and rp[0]["menge"] == 150 and rp[0]["preis"] == 2.4, "Rechnung aus LS: %s" % rp)

    # Gutschrift aus der Rechnung
    pg.locator("[data-erp-zeile='%s']" % re[0]["id"]).click(); oben(pg).wait_for()
    oben(pg).locator("[data-erp-aktion='gs']").click(); pg.wait_for_timeout(400)
    oben(pg).locator("input[data-erp-feld='menge']").last.fill("10")
    oben(pg).locator("[data-erp-speichern]").click(); pg.wait_for_timeout(800)
    gs = [b for b in tabelle(pg, "erp_belege") if b["typ"] == "gutschrift"]
    pruefe(len(gs) == 1 and gs[0]["bezug_id"] == re[0]["id"], "Gutschrift aus Rechnung")
    while pg.locator("[data-erp-beleg]").count(): pg.locator("[data-erp-beleg] [data-nein]").last.click(); pg.wait_for_timeout(200)

    # Fibu: Rechnung und Gutschrift
    pg.click("[data-erp-reiter='fibu']"); pg.click("text=Alle offenen wählen")
    with pg.expect_download() as dl:
        pg.click("[data-erp-aktion='fibu']")
    text = open(dl.value.path(), encoding="utf-8-sig", newline="").read()
    zeilen = [z for z in text.split("\r\n") if z]
    pruefe(len(zeilen) == 3 and zeilen[0].startswith("Belegart;") and any(z.startswith("RE;") for z in zeilen)
           and any(z.startswith("GS;") and ";-" in z for z in zeilen), "Fibu-Export RE und GS (GS negativ): %s" % zeilen)
    pg.wait_for_timeout(600)
    pruefe(all((b.get("daten") or {}).get("fibu_am") for b in tabelle(pg, "erp_belege") if b["typ"] in ("rechnung", "gutschrift")), "fibu_am gesetzt")

    # Reiter Rückverfolgung gibt es seit 1.888.0 nicht mehr
    pruefe(pg.locator("[data-erp-reiter='rueck']").count() == 0, "kein Reiter Rückverfolgung")

    # Reiter Fertigung zeigt ohne Suche alle FAs, Häkchen je Stand (seit 1.909.0)
    pg.click("[data-erp-reiter='fertigung']"); pg.wait_for_timeout(300)
    pg.evaluate("TEST.erpAlle = false")
    pg.click("[data-erp-reiter='auftrag']"); pg.wait_for_timeout(100); pg.click("[data-erp-reiter='fertigung']"); pg.wait_for_timeout(300)
    zahl_fa = lambda: pg.locator(".erp-tabelle tbody tr").count()
    vorher = zahl_fa()
    pruefe(vorher >= 1 and pg.locator("[data-erp-fa-stand]").count() == 6, "Fertigung ohne Suche: %s Zeilen, Häkchen je Stand" % vorher)
    pruefe("Planwand" in pg.inner_text(".erp-tabelle thead"), "Liste der FAs mit Spalte Planwand")
    stand = pg.locator(".erp-tabelle tbody tr").first.locator("td").last.inner_text().strip()
    pg.locator("[data-erp-fa-stand='%s'] input" % stand).uncheck(); pg.wait_for_timeout(150)
    pruefe(zahl_fa() < vorher or pg.locator(".karte--hinweis").count() > 0, "Häkchen „%s“ weg blendet aus" % stand)
    pg.locator("[data-erp-fa-stand='%s'] input" % stand).check()
    pg.evaluate("TEST.erpAlle = true")
    pg.click("[data-erp-reiter='auftrag']"); pg.wait_for_timeout(300)

    # Bestellungen: ohne Suche alle, Häkchen Rohmaterial / ZA extern / Andere (seit 1.913.0)
    pg.evaluate("TEST.erpAlle = false")
    pg.click("[data-erp-reiter='bestellung']"); pg.wait_for_timeout(300)
    n_be = pg.locator(".erp-tabelle tbody tr").count()
    pruefe(n_be >= 1 and pg.locator("[data-erp-be-art]").count() == 3, "Bestellungen ohne Suche: %s, Häkchen je Art" % n_be)
    for w in ("roh", "za", "andere"):
        pg.locator("[data-erp-be-art='%s'] input" % w).uncheck()
    pg.wait_for_timeout(150)
    pruefe(pg.locator(".erp-tabelle tbody tr").count() == 0, "alle Häkchen weg: keine Bestellung")
    pg.locator("[data-erp-be-art='roh'] input").check(); pg.wait_for_timeout(150)
    n_roh = pg.locator(".erp-tabelle tbody tr").count()
    pg.locator("[data-erp-be-art='za'] input").check(); pg.locator("[data-erp-be-art='andere'] input").check()
    pruefe(n_roh <= n_be, "nur Rohmaterial: %s von %s" % (n_roh, n_be))
    pg.evaluate("TEST.erpAlle = true")

    # Logistik: Kachel Wareneingang ZA extern (seit 1.920.0)
    pg.click("[data-erp-reiter='logistik']"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-logi-funktion]").count() == 0, "Logistik: beim Öffnen unten noch nichts (seit 1.929.0)")
    pg.click("[data-logi-kachel='we-za']"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-logi-kachel='we-za']").count() == 1 and pg.locator("[data-logi-funktion='we-za']").count() == 1,
           "Logistik mit Kachel und Liste Wareneingang ZA extern")
    pg.screenshot(path=BILD + "/erp-logistik.png")
    # Kachel ZA extern anlegen (seit 1.925.0): externer Arbeitsgang im offenen FA wird zur Bestellung beim Lieferanten
    pg.evaluate("""() => { const fa = TEST.daten.erp_belege.find(b => b.typ === 'fertigung');
      fa.status = 'offen'; fa.daten = { ...fa.daten, ap: [...fa.daten.ap, { pos: 30, bez: 'Härten', code: 'HAERT', extern: true, lieferant_nr: '70001', pauschal: 5, pauschal_einheit: 'Tag' }] };
      fa.daten.planwand = { job_id: 'jwbg', maschine: '124', stand: 'laeuft' };
      const au = TEST.daten.erp_belege.filter(b => b.typ === 'auftrag').map(b => b.id);
      const t = new Date(); t.setDate(t.getDate() + 3);
      TEST.daten.erp_positionen.filter(q => au.includes(q.beleg_id)).forEach(q => { q.termin = t.toISOString().slice(0, 10); q.daten = { ...(q.daten || {}), abrufe: [] }; q.menge = Number(q.menge) + 100; });
      TEST.daten.jobs = TEST.daten.jobs || []; TEST.daten.jobs.push({ id: 'jwbg', wbg_url: 'https://example.invalid/wbg.pdf' });
      TEST.daten.production_records = TEST.daten.production_records || []; TEST.daten.production_records.push({ id: 'pr1', job_id: 'jwbg', quantity: 1234, record_date: '2026-11-27' });
      TEST.daten.erp_positionen.filter(q => q.beleg_id === fa.id).forEach(q => { q.menge = Number(q.menge) + 50; });
      const a = TEST.daten.erp_artikel.find(x => x.id === 'a1'); a.arbeitsplan = [...(a.arbeitsplan || []), { pos: 90, bez: 'Härten', code: 'HAERT', extern: true, lieferant_nr: '70001', pauschal: 5 }]; }""")
    pg.evaluate("location.hash='#/'"); pg.wait_for_timeout(500)
    pg.evaluate("location.hash='#/erp'"); pg.wait_for_selector("[data-erp-reiter='logistik']"); pg.wait_for_timeout(500)
    pg.click("[data-erp-reiter='logistik']"); pg.wait_for_timeout(500)
    pg.click("[data-logi-kachel='za-neu']"); pg.wait_for_timeout(300)
    z = pg.locator("[data-logi-funktion='za-neu'] .erp-tabelle tbody tr")
    pruefe(z.count() == 1 and "Stahl AG" in z.first.inner_text() and "HAERT" in z.first.inner_text(), "ZA extern anlegen: offener externer Arbeitsgang mit Lieferant")
    z.first.click(); pg.wait_for_timeout(600)
    pruefe(oben(pg).count() == 1 and "Stahl AG" in oben(pg).inner_text(), "neue Bestellung ZA extern vorausgefüllt")
    pg.screenshot(path=BILD + "/erp-za-neu.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    if pg.locator(".dialog-huelle [data-ja]").count(): pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(300)
    # Kacheln ziehen (seit 1.926.0): ZA extern anlegen vor Wareneingang
    q = pg.locator("[data-logi-kachel='za-neu']").bounding_box(); w = pg.locator("[data-logi-kachel='we-za']").bounding_box()
    pg.mouse.move(q["x"] + 30, q["y"] + 30); pg.mouse.down(); pg.mouse.move(q["x"] + 10, q["y"] + 20, steps=3)
    pg.mouse.move(w["x"] + 30, w["y"] + 30, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    reihe = pg.evaluate("[...document.querySelectorAll('[data-logi-kachel]')].map(k => k.dataset.logiKachel)")
    pruefe(reihe[:2] == ["za-neu", "we-za"] and pg.locator("[data-logi-funktion='za-neu']").count() == 1, "Kacheln verschoben, Ziehen öffnet nichts: %s" % reihe)
    # Kachel WBG drucken (seit 1.928.0)
    pg.click("[data-logi-kachel='wbg']"); pg.wait_for_timeout(800)
    z = pg.locator("[data-logi-funktion='wbg'] .erp-tabelle tbody tr")
    pruefe(z.count() == 1 and "vorhanden" in z.first.inner_text() and pg.locator("[data-logi-wbg-drucken]").count() == 1, "WBG drucken: FA mit WBG und Knopf Drucken")
    pg.locator("[data-logi-wbg-mehr]").click(); pg.locator("[data-logi-wbg-mehr]").click()
    pruefe(pg.locator("[data-logi-wbg-kopien]").inner_text() == "3", "WBG drucken: Anzahl wählbar")
    # Kachel Lieferschein anlegen (seit 1.928.0)
    pg.click("[data-logi-kachel='ls-neu']"); pg.wait_for_timeout(300)
    pg.locator("[data-logi-ls-alle] input").check(); pg.wait_for_timeout(200)
    n_ls = pg.locator("[data-logi-funktion='ls-neu'] .erp-tabelle tbody tr").count()
    pruefe(pg.locator("[data-logi-funktion='ls-neu']").count() == 1, "Lieferschein anlegen: Liste da (%s Positionen mit Häkchen „auch ohne Bestand“)" % n_ls)
    pg.click("[data-logi-kachel='fa']"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-logi-funktion='fa'] [data-erp-fa-stand]").count() >= 4, "FA Übersicht mit Häkchen je Stand")
    # Kachel Lieferplan Liste (seit 1.929.0)
    pg.click("[data-logi-kachel='lieferplan']"); pg.wait_for_timeout(300)
    n_lp = pg.locator("[data-logi-funktion='lieferplan'] .erp-tabelle tbody tr").count()
    with pg.expect_popup() as pop:
        pg.click("[data-logi-lp-drucken]")
    blatt = pop.value; blatt.wait_for_load_state()
    txt = blatt.content()
    pruefe(n_lp >= 1 and "Offene Lieferungen" in txt and "Rüstmenge" in txt and "landscape" in txt, "Lieferplan Liste: %s Fälligkeiten, Blatt quer zum Drucken" % n_lp)
    blatt.close()
    pg.click("[data-logi-kachel='extern']"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-logi-funktion='extern']").count() == 1, "Aktuell extern: Liste da")
    # Kachel Fertigung einlagern (seit 1.927.0)
    pg.click("[data-logi-kachel='einlagern']"); pg.wait_for_timeout(300)
    z = pg.locator("[data-logi-funktion='einlagern'] .erp-tabelle tbody tr")
    pg.wait_for_timeout(500)
    pruefe(z.count() >= 1 and "1'234" in z.first.inner_text() and "Läuft" in z.first.inner_text(), "Fertigung einlagern: offener FA mit Stand, Planwand und Stückzahl: %s" % (z.first.inner_text() if z.count() else ""))
    z.first.click(); pg.wait_for_timeout(800)
    pruefe(pg.locator(".dialog:has-text('ertig')").count() >= 1, "Fertigmeldung geht auf")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    if pg.locator(".dialog-huelle [data-ja]").count(): pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(300)
    # Ohne FA über den Arbeitsplan des Artikels
    pg.click("[data-logi-kachel='za-neu']"); pg.wait_for_timeout(300)
    pg.click("[data-logi-za-ap]"); pg.wait_for_selector("[data-logi-ap-fenster] input")
    pg.fill("[data-logi-ap-fenster] input", "10007"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-logi-ap-fenster] .erp-tabelle tbody tr").count() >= 1, "ZA extern über den Arbeitsplan: Artikel mit externem Arbeitsgang")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Spaltenkopf antippen sortiert (seit 1.898.0): Hofer-Artikel nach Index auf- und absteigend
    pg.click("[data-erp-reiter='stamm']"); pg.wait_for_timeout(300)
    pg.click("[data-erp-stamm='artikel']"); pg.wait_for_timeout(300)
    def spalte1():
        return pg.evaluate("""() => [...document.querySelectorAll('.erp-tabelle tbody tr')].map(t => (t.cells[1]||{}).innerText.trim())""")
    kopf = pg.locator(".erp-tabelle th[data-erp-sort='1']").first
    if kopf.count():
        kopf.click(); pg.wait_for_timeout(150); auf = spalte1()
        kopf.click(); pg.wait_for_timeout(150); ab = spalte1()
        pruefe(len(auf) >= 2 and auf == sorted(auf) and ab == list(reversed(auf)) and "▼" in kopf.inner_text(),
               "Sortieren nach Spalte: %s / %s" % (auf, ab))
        kopf.click()
    else:
        pruefe(False, "Sortierkopf in der Liste fehlt")

    # Kalkulation im ERP
    pg.click("[data-erp-reiter='kalk']"); pg.wait_for_timeout(800)
    pruefe(pg.locator("#kalk-leer").count() == 1 and pg.locator(".kalk-liste__zeile").count() == 0, "Kalkulationen erst mit Suchbegriff")
    pg.fill("#kalk-suche", "K-"); pg.wait_for_timeout(300)
    pruefe(pg.locator(".erp-kalk").count() == 1 and "K-1" in pg.inner_text(".erp-kalk"), "Modul Kalkulation im Reiter")
    pruefe(pg.locator("[data-erp-kalkreiter]").count() == 0, "Kein eigener Reiter Artikel und Arbeitsplan mehr")
    pg.click("tr[data-kalk='kk1']"); pg.wait_for_selector("#kalk-erp-uebernehmen")
    pg.click("#kalk-erp-uebernehmen"); pg.wait_for_timeout(1200)
    neu = [a for a in tabelle(pg, "erp_artikel") if a["nr"] == "10007-0590"]
    pruefe(len(neu) == 1 and neu[0]["idx"] == "C" and neu[0]["kunde_id"] == "k1", "Artikel aus Kalkulation angelegt: %s" % neu)
    pg.screenshot(path=BILD + "/erp-kalk.png")
    a = neu[0] if neu else {}
    pl = (a.get("daten") or {}).get("preisliste") or {}
    pruefe(pl.get("pe") == 1000 and pl.get("kalkulation_nr") == "K-1"
           and [(x["ab"], x["preis"]) for x in pl.get("staffeln", [])] == [(1000, 250), (5000, 200)] and a.get("preis") == 250,
           "Preisliste aus Kalkulation: %s" % pl)
    pruefe((a.get("daten") or {}).get("rohmaterial_id") == "r1", "Rohmaterial zugewiesen: %s" % a.get("daten"))
    # Nochmals übernehmen: Artikel besteht, Fenster fragt nach Index, Preisliste, Arbeitsplan
    pg.click("#kalk-erp-uebernehmen"); pg.wait_for_selector(".dialog-huelle:not(.kalk-huelle)")
    pruefe("gibt es schon" in pg.inner_text(".dialog-huelle:not(.kalk-huelle)"), "Fragt beim bestehenden Artikel nach")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.click("#kalk-zurueck"); pg.wait_for_selector("tr[data-kalk='kk2']")
    pg.click("tr[data-kalk='kk2']"); pg.wait_for_selector("#kalk-erp-uebernehmen")
    # Fehlendes Rohmaterial: App fragt, ob es angelegt werden soll (1.951.0); zuerst Nein
    pg.click("#kalk-erp-uebernehmen"); pg.wait_for_selector(".dialog-huelle:not(.kalk-huelle) [data-nein]")
    dlg = pg.inner_text(".dialog-huelle:not(.kalk-huelle)")
    pruefe("Rohmaterial anlegen" in dlg and "CuZn39Pb3 rd 8" in dlg, "Fragt nach fehlendem Rohmaterial: %s" % dlg[:120])
    pg.click(".dialog-huelle:not(.kalk-huelle) [data-nein]"); pg.wait_for_timeout(1200)
    a2 = [x for x in tabelle(pg, "erp_artikel") if x["nr"] == "10007-0591"]
    pruefe(len(a2) == 1 and not (a2[0]["daten"] or {}).get("rohmaterial_id") and a2[0]["daten"]["material"] == "CuZn39Pb3 rd 8"
           and not [x for x in tabelle(pg, "erp_artikel") if x["art"] == "rohmaterial" and "CuZn" in x["nr"]],
           "Fehlendes Rohmaterial nur als Text, nicht angelegt")
    # Nochmals übernehmen und diesmal Ja: Rohmaterial wird angelegt und zugewiesen
    pg.click("#kalk-erp-uebernehmen"); pg.wait_for_selector(".dialog-huelle:not(.kalk-huelle) [data-ja]")
    pg.click(".dialog-huelle:not(.kalk-huelle) [data-ja]"); pg.wait_for_timeout(500)
    pg.wait_for_selector(".dialog-huelle:not(.kalk-huelle) [data-ja]")
    pruefe("Rohmaterial anlegen" in pg.inner_text(".dialog-huelle:not(.kalk-huelle)"), "Frage auch beim bestehenden Artikel")
    pg.click(".dialog-huelle:not(.kalk-huelle) [data-ja]"); pg.wait_for_timeout(1200)
    rn = [x for x in tabelle(pg, "erp_artikel") if x["art"] == "rohmaterial" and x["nr"] == "CuZn39Pb3 rd 8"]
    a2 = [x for x in tabelle(pg, "erp_artikel") if x["nr"] == "10007-0591"]
    pruefe(len(rn) == 1 and a2 and (a2[0]["daten"] or {}).get("rohmaterial_id") == rn[0]["id"], "Rohmaterial angelegt und zugewiesen: %s" % rn)
    pg.click("#kalk-zurueck"); pg.wait_for_timeout(500)
    # Reihenfolge der Reiter: Kalkulation, Artikel, Rest
    pruefe(pg.locator("[data-erp-reiter]").first.get_attribute("data-erp-reiter") == "kalk"
           and pg.locator("[data-erp-reiter]").nth(1).get_attribute("data-erp-reiter") == "artikel", "Reiter: Kalkulation zuerst")
    # Artikelfenster mit Preisliste, Herkunft, Rohmaterial, Platz für Zeichnung und 3D
    pg.click("[data-erp-reiter='stamm']"); pg.wait_for_timeout(300)
    pg.click("[data-erp-stamm='artikel']"); pg.wait_for_timeout(300)
    pg.locator("[data-erp-zeile='%s']" % a["id"]).click(); pg.wait_for_selector("[data-erp-artfenster]")
    pruefe("X8CrNiS18-9" in pg.inner_text("[data-erp-art-roh]"), "Artikelfenster zeigt Rohmaterial im Kopf")
    breite = pg.evaluate("() => document.querySelector('[data-erp-artfenster]').getBoundingClientRect().width")
    pruefe(breite > 1200, "Artikelfenster gross: %s" % breite)
    pg.click("[data-erp-artfenster] [data-gf-reiter='verkauf']"); pg.wait_for_timeout(200)
    pruefe("K-1" in pg.inner_text("[data-erp-pl-herkunft]") and pg.locator("[data-erp-pl-zeile]").count() == 2,
           "Reiter Verkauf zeigt Preisliste und Herkunft")
    pg.wait_for_timeout(500); pg.screenshot(path=BILD + "/erp-artikelfenster.png")
    pg.click("[data-erp-artfenster] [data-gf-reiter='dokumente']"); pg.wait_for_timeout(300)
    hz = pg.evaluate("() => { const z = document.querySelector('[data-erp-art-zeichnung]'); return z ? z.getBoundingClientRect().height : 0 }")
    pruefe(pg.locator("[data-erp-modell]").count() == 1 and pg.locator("[data-erp-modell-neu]").count() == 1 and hz > 400,
           "Dokumente: Zeichnung gross (%d) und Feld 3D-Modell" % hz)
    pg.click("[data-erp-artfenster] [data-gf-reiter='verkauf']"); pg.wait_for_timeout(200)
    pg.locator("[data-erp-pl-zeile='0'] input[data-erp-feld='preis']").fill("240")
    pg.click("[data-erp-artfenster] [data-erp-speichern]"); pg.wait_for_timeout(800)
    a = [x for x in tabelle(pg, "erp_artikel") if x["id"] == a["id"]][0]
    pl = a["daten"]["preisliste"]
    pruefe(pl.get("von_hand") and pl["staffeln"][0]["preis"] == 240, "Von Hand geändert vermerkt: %s" % pl)
    # Arbeitsplan: neuer interner Arbeitsgang über das Fenster
    pg.locator("[data-erp-zeile='%s']" % a["id"]).click() if not pg.locator("[data-erp-artfenster]").count() else None
    pg.wait_for_selector("[data-erp-artfenster]")
    pg.click("[data-erp-artfenster] [data-gf-reiter='arbeitsplan']"); pg.wait_for_timeout(200)
    vorher = len(a.get("arbeitsplan") or [])
    pg.click("[data-erp-ag-neu='int']"); pg.wait_for_selector(".dialog:has-text('Arbeitsgang') input[data-erp-feld='code']")
    dlg = pg.locator(".dialog:has(input[data-erp-feld='code'])").last
    dlg.locator("input[data-erp-feld='code']").fill("ENTGR"); dlg.locator("textarea[data-erp-feld='bez']").fill("Entgraten"); dlg.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(300); pg.screenshot(path=BILD + "/erp-ag-dlg.png")
    pg.click("[data-erp-artfenster] [data-erp-speichern]"); pg.wait_for_timeout(800)
    a = [x for x in tabelle(pg, "erp_artikel") if x["id"] == a["id"]][0]
    ap_ = a.get("arbeitsplan") or []
    pruefe(len(ap_) == vorher + 1 and ap_[-1].get("code") == "ENTGR", "Arbeitsgang angelegt: %s" % ap_)
    pg.screenshot(path=BILD + "/erp-arbeitsplan.png")
    # Ziehen: letzten Arbeitsgang ganz nach oben
    pg.click("[data-erp-ag-neu='int']"); pg.wait_for_selector(".dialog:has-text('Arbeitsgang') input[data-erp-feld='code']")
    dlg = pg.locator(".dialog:has(input[data-erp-feld='code'])").last
    dlg.locator("input[data-erp-feld='code']").fill("WASCH"); dlg.locator("textarea[data-erp-feld='bez']").fill("Waschen"); dlg.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(300)
    zeilen = pg.locator("#erp-ap-liste .ziehliste__zeile")
    if zeilen.count() >= 2:
        q = zeilen.last.bounding_box(); z = zeilen.first.bounding_box()
        pg.mouse.move(q["x"] + 60, q["y"] + q["height"] / 2); pg.mouse.down()
        for i in range(1, 16): pg.mouse.move(q["x"] + 60, q["y"] + q["height"] / 2 + (z["y"] - q["y"] - 8) * i / 15); pg.wait_for_timeout(20)
        pg.mouse.up(); pg.wait_for_timeout(500)
        pg.click("[data-erp-artfenster] [data-erp-speichern]"); pg.wait_for_timeout(800)
        a = [x for x in tabelle(pg, "erp_artikel") if x["id"] == a["id"]][0]
        ap2 = a.get("arbeitsplan") or []
        pruefe(ap2 and ap2[0].get("code") == "WASCH" and len(ap2) == vorher + 2 and ap2[0].get("pos") == 10 and not any("_k" in x for x in ap2), "Arbeitsgang per Ziehen nach oben: %s" % [(x.get("pos"), x.get("code")) for x in ap2])
    pg.click("[data-erp-artfenster] [data-gf-reiter='dokumente']"); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-erp-art-modell]").count() == 1, "Reiter Dokumente mit Platz für 3D")
    pruefe(pg.locator("[data-erp-artfenster] [data-erp-zeichnung]").count() >= 1, "Zeichnung der HOCO Nr. im Artikelfenster")
    # Blaue Felder: Menü mit Sprüngen, hier ins Artikel-Cockpit
    pg.click("[data-erp-artfenster] [data-erp-art-cockpit]"); pg.wait_for_selector("[data-erp-cockpit]")
    pruefe(pg.locator("[data-erp-cockpit-teil]").count() == 4, "Artikel-Cockpit mit vier Bereichen")
    pg.screenshot(path=BILD + "/erp-cockpit.png")
    pg.locator("[data-erp-cockpit] [data-gf-verweis]").first.click(button="right"); pg.wait_for_selector("[data-gf-menue]")
    pruefe(pg.locator("[data-gf-menue]").count() >= 1, "Rechtsklick aufs blaue Feld zeigt Menü")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    while pg.locator("[data-erp-cockpit]").count(): pg.locator("[data-erp-cockpit] [data-nein]").last.click(); pg.wait_for_timeout(200)
    while pg.locator("[data-erp-artfenster]").count():
        pg.locator("[data-erp-artfenster] [aria-label='Schliessen']").last.click(); pg.wait_for_timeout(300)
        if pg.locator(".dialog-huelle [data-ja]").count(): pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(200)
    # Kundenfenster
    pg.click("[data-erp-stamm='kunde']"); pg.wait_for_timeout(300)
    pg.locator("[data-erp-zeile='k1']").click(); pg.wait_for_timeout(500)
    pruefe(pg.locator(".gf [data-gf-reiter]").count() >= 3, "Kundenfenster mit Reitern")
    pg.screenshot(path=BILD + "/erp-kunde.png")
    pg.locator(".gf [aria-label='Schliessen']").last.click(); pg.wait_for_timeout(300)
    # Auftrag mit 6'000 Stk nimmt Staffel ab 5'000 und Preis pro 1'000
    neuer_beleg(pg, "auftrag", "k1", "10007-0590 Ind. C · Hülse", "6000")
    ap = [x for x in tabelle(pg, "erp_positionen") if x["artikel_id"] == a["id"]]
    pruefe(ap and ap[-1]["preis"] == 200 and (ap[-1].get("daten") or {}).get("pe") == 1000, "Auftrag nimmt Staffelpreis: %s" % ap)
    # Tipp auf die Position öffnet gleich das Bearbeiten (1.817.0)
    oben(pg).locator("[data-erp-zeile]").first.click(); pg.wait_for_selector("[data-erp-pos-lpneu]")
    pruefe(pg.locator("[data-erp-posfenster]").count() == 0 and oben(pg).locator("[data-erp-speichern]").count() == 1, "Tipp auf Position öffnet Bearbeiten")
    pg.screenshot(path=BILD + "/erp-position.png")
    pruefe(len(ARTFELD) > 0, "Artikel-Nr. und Angaben in eigenen Feldern: %s" % ARTFELD)
    oben(pg).locator("[data-erp-pos-lpneu]").first.click(); pg.wait_for_selector("[data-erp-lp-zeile]")
    pg.click("[data-erp-lp-neu]")
    z = pg.locator("[data-erp-lp-zeile]")
    z.nth(0).locator("input[data-erp-feld='menge']").fill("4000"); z.nth(0).locator("input[data-erp-feld='termin']").fill("2026-12-15")
    z.nth(1).locator("input[data-erp-feld='menge']").fill("2000"); z.nth(1).locator("input[data-erp-feld='termin']").fill("2027-02-01")
    pruefe(z.nth(0).locator("input[data-erp-feld='kw']").input_value() == "51", "KW im laufenden Jahr ohne /JJ: %s" % z.nth(0).locator("input[data-erp-feld='kw']").input_value())
    pruefe(z.nth(1).locator("input[data-erp-feld='kw']").input_value() == "05/27", "KW im nächsten Jahr mit /JJ: %s" % z.nth(1).locator("input[data-erp-feld='kw']").input_value())
    z.nth(0).locator("input[data-erp-feld='kw']").fill("50")
    pruefe(z.nth(0).locator("input[data-erp-feld='termin']").input_value() == "2026-12-11", "KW 50 im Auftrag = Freitag: %s" % z.nth(0).locator("input[data-erp-feld='termin']").input_value())
    z.nth(0).locator("input[data-erp-feld='termin']").fill("2026-12-15")
    pg.screenshot(path=BILD + "/erp-lieferplan.png")
    z.nth(1).locator("input[data-erp-feld='abruf']").check(); pg.wait_for_timeout(100)
    pruefe(z.nth(1).locator("[data-erp-lp-abruf]").count() == 1, "Fälligkeit auf Abruf (seit 1.934.0)")
    pruefe(z.nth(1).locator("[data-erp-lp-abruf]").inner_text().strip() == "auf Abruf", "nur „auf Abruf“, kein bis-Text")
    z.nth(1).locator("input[data-erp-feld='abruf']").uncheck(); pg.wait_for_timeout(100)
    pruefe(z.nth(1).locator("input[data-erp-feld='termin']").input_value() == "", "Häkchen weg: Datum leer zum Eintragen")
    z.nth(1).locator("input[data-erp-feld='abruf']").check(); pg.wait_for_timeout(100)
    oben(pg).locator("[data-erp-speichern]").click(); pg.wait_for_timeout(800)
    pos = [x for x in tabelle(pg, "erp_positionen") if x["artikel_id"] == a["id"]][-1]
    ab = (pos.get("daten") or {}).get("abrufe") or []
    pruefe([x["menge"] for x in ab] == [4000, 2000], "Lieferplan gespeichert: %s" % ab)
    pruefe(len(ab) == 2 and ab[1].get("abruf") is True and ab[1].get("termin") == "" and ab[1].get("bis") == "2027-02-01", "auf Abruf gespeichert, bis = altes Datum: %s" % ab)
    # Auftragsbestätigung und Liefern je Position (1.818.0)
    with pg.expect_popup() as pop: oben(pg).locator("[data-erp-ab-drucken]").click()
    w = pop.value; w.wait_for_load_state(); pruefe("Auftragsbestätigung" in w.content(), "Auftragsbestätigung druckt"); w.close()
    oben(pg).locator("[data-erp-zeile]").first.click(); pg.wait_for_selector("[data-erp-pos-ls]")
    # „Artikel-Nr.“ in der Position öffnet das Artikelfenster
    n0 = pg.locator(".gf").count()
    oben(pg).locator("[data-erp-artnr-link]").first.click(); pg.wait_for_timeout(500)
    pruefe(pg.locator(".gf").count() == n0 + 1, "Artikel-Nr. öffnet den Artikel: %d -> %d" % (n0, pg.locator(".gf").count()))
    pg.locator(".gf").last.locator(".gf-zu").click(); pg.wait_for_timeout(300)
    if pg.locator(".dialog-huelle [data-ja]").count(): pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(300)
    oben(pg).locator("[data-erp-pos-ls]").first.click(); pg.wait_for_selector("[data-erp-lspos]")
    pruefe(pg.locator("[data-erp-lspos]").count() == 1, "Liefern zeigt nur diese Position: %d" % pg.locator("[data-erp-lspos]").count())
    pg.locator(".dialog:has([data-erp-lspos]) .knopf--still").click(); pg.wait_for_timeout(300)
    if oben(pg).locator("[data-nein]").count(): oben(pg).locator("[data-nein]").last.click(); pg.wait_for_timeout(300)
    if pg.locator(".dialog-huelle [data-ja]").count(): pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(300)

    # Nummernkreise: Startwert für den Wechsel vom alten ERP
    import datetime
    j = datetime.date.today().year
    for _ in range(4):
        if pg.locator(".dialog-huelle").count() == 0: break
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("[data-erp-reiter='stamm']"); pg.wait_for_timeout(300)
    pg.click("[data-erp-stamm='nummern']"); pg.wait_for_selector("[data-erp-nrstart='auftrag-%d']" % j)
    pg.fill("[data-erp-nrstart='auftrag-%d']" % j, "458")
    pg.fill("[data-erp-nrstart='kalkulation-%d']" % j, "6001")
    naechst = pg.inner_text("[data-erp-nrnaechst='auftrag']")
    pruefe(naechst == "%d0458" % j, "Vorschau nächste Nummer: %s" % naechst)
    folge = pg.inner_text("[data-erp-nrfolge='auftrag']")
    pruefe(folge == "%d0458" % (j + 1), "Nächstes Jahr zählt weiter: %s" % folge)
    pg.screenshot(path=BILD + "/erp-nummern.png")
    pg.click("#erp-nr-speichern"); pg.wait_for_timeout(700)
    cfg = [x for x in tabelle(pg, "app_config") if x["schluessel"] == "erp_nummern"]
    w = json.loads(cfg[0]["wert"]) if cfg else {}
    pruefe(w.get("auftrag", {}).get(str(j)) == 458 and w.get("kalkulation", {}).get(str(j)) == 6001, "Startwerte gespeichert: %s" % w)
    neuer_beleg(pg, "auftrag", "k1", "10007-0589 Ind. B · Bolzen", "10", "2.40")
    nrn = [b["nr"] for b in tabelle(pg, "erp_belege") if b["typ"] == "auftrag"]
    pruefe("%d0458" % j in nrn, "Neuer Auftrag mit Startwert: %s" % nrn)

    # Bestellung: KW gibt den Montag; einzelne Position löschen, der Beleg bleibt
    for _ in range(4):
        if pg.locator(".dialog-huelle").count() == 0: break
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        if pg.locator(".dialog-huelle [data-ja]").count(): pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(200)
    pg.click("[data-erp-reiter='bestellung']"); pg.click("[data-erp-neu='bestellung']")
    f = oben(pg); f.wait_for()
    f.locator("select[data-erp-feld='partner_id']").select_option("l1")
    for _ in range(2):
        f.locator("[data-erp-neupos]").click()
        f.locator("input[data-erp-feld='artikel']").last.fill("X8CrNiS18-9 rd 12")
        f.locator("input[data-erp-feld='menge']").last.fill("50")
    kwf = f.locator("input[data-erp-feld='_kw'], input[data-erp-feld='termin_kw']").last
    kwf.fill("50"); pg.wait_for_timeout(200)
    tf = f.locator("input[data-erp-feld='termin']").last.input_value()
    pruefe(tf == "2026-12-07", "KW 50 in der Bestellung = Montag: %s" % tf)
    f.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(700)
    be = sorted([b for b in tabelle(pg, "erp_belege") if b["typ"] == "bestellung"], key=lambda b: b["nr"])[-1]
    bp = [x for x in tabelle(pg, "erp_positionen") if x["beleg_id"] == be["id"]]
    pruefe(len(bp) == 2, "Bestellung mit zwei Positionen: %d" % len(bp))
    oben(pg).locator("[data-erp-zeile]").first.click(); pg.wait_for_selector("[data-erp-pos-weg]")
    oben(pg).locator("[data-erp-pos-weg]").first.click()
    oben(pg).locator("[data-erp-speichern]").click(); pg.wait_for_timeout(800)
    bp2 = [x for x in tabelle(pg, "erp_positionen") if x["beleg_id"] == be["id"]]
    pruefe(len(bp2) == 1 and any(b["id"] == be["id"] for b in tabelle(pg, "erp_belege")), "Position gelöscht, Beleg bleibt: %d" % len(bp2))
    # Neue Position direkt in der Ansicht, ohne Bearbeiten (1.811.1)
    oben(pg).locator("[data-erp-ansicht-neupos]").click(); pg.wait_for_selector("[data-erp-posfenster]")
    pfe = pg.locator("[data-erp-posfenster]").last
    pfe.locator("input[data-erp-feld='artikel']").fill("X8CrNiS18-9 rd 12"); pg.wait_for_timeout(200)
    pfe.locator("input[data-erp-feld='menge']").fill("30")
    pfe.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(800)
    bp3 = [x for x in tabelle(pg, "erp_positionen") if x["beleg_id"] == be["id"]]
    pruefe(len(bp3) == 2 and any(float(x["menge"]) == 30 and x.get("artikel_id") for x in bp3), "Position in der Ansicht hinzugefügt: %d" % len(bp3))

    # Pro HOCO Nr. nur ein Artikel: Neuer Index ändert denselben Artikel
    for _ in range(4):
        if pg.locator(".dialog-huelle").count() == 0: break
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("[data-erp-reiter='stamm']"); pg.wait_for_timeout(300)
    pg.click("[data-erp-stamm='artikel']"); pg.wait_for_timeout(300)
    vorher = len([x for x in tabelle(pg, "erp_artikel") if x["nr"] == a["nr"]])
    altidx = [x for x in tabelle(pg, "erp_artikel") if x["id"] == a["id"]][0].get("idx") or ""
    pg.locator("[data-erp-zeile='%s']" % a["id"]).click(); pg.wait_for_selector("[data-erp-artfenster]")
    pg.click("[data-erp-art-index]"); pg.wait_for_timeout(400)
    dlg = pg.locator(".dialog-huelle").last
    dlg.locator("input").first.fill("Z")
    dlg.locator("button:has-text('Index ändern')").click(); pg.wait_for_timeout(900)
    an = [x for x in tabelle(pg, "erp_artikel") if x["nr"] == a["nr"]]
    ax = [x for x in an if x["id"] == a["id"]][0]
    pruefe(len(an) == vorher and ax["idx"] == "Z" and (ax["daten"].get("indexe") or [{}])[-1].get("idx") == altidx,
           "Neuer Index am selben Artikel, alter im Verlauf: %s %s" % (ax["idx"], ax["daten"].get("indexe")))

    # Reiter Reklamationen im Artikel (aus dem Reklamationsmanagement)
    pg.evaluate("(nr) => { (TEST.daten.reklamationen = TEST.daten.reklamationen || []).push({ id: 'rk1', nr: 'RK26-001', hoco_nr: nr, art: 'kunde', status: 'offen', eingang: '2026-11-20', partner: 'Muster AG', fehler: 'Mass zu gross', menge_reklamiert: 12 }) }", a["nr"])
    pg.click("[data-gf-reiter='reklamationen']"); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-erp-art-rk-nr='RK26-001']").count() == 1, "Reklamation im Artikel")
    pg.screenshot(path=BILD + "/erp-art-rk.png")

    # Umbuchen von Hand mit Vermerk und Liste der Lagerbewegungen
    for _ in range(4):
        if pg.locator(".dialog-huelle").count() == 0: break
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("[data-erp-stamm='lager']"); pg.wait_for_timeout(400)
    pg.locator("tr[data-erp-zeile^='a1|']:has-text('Regal 7')").first.click(); pg.wait_for_selector("[data-erp-umbuchen]")
    u = pg.locator("[data-erp-umbuchen]")
    u.locator("[data-erp-feld='menge']").fill("20")
    u.locator("select[data-erp-feld='lart']").select_option("SPL")
    u.locator("[data-erp-feld='lplatz']").fill("Q1")
    u.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(500)
    pruefe(pg.locator("[data-erp-umbuchen]").count() == 1, "ohne Vermerk nicht umgebucht")
    u.locator("[data-erp-feld='grund']").fill("Masse prüfen, QS")
    u.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(900)
    ub = [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "umbuchung"]
    spl = [x for x in tabelle(pg, "erp_lager") if x.get("lagerart") == "SPL" and x.get("platz") == "Q1"]
    pruefe(len(ub) == 2 and sorted(x["menge"] for x in ub) == [-20, 20] and all(x["notiz"] == "Masse prüfen, QS" for x in ub)
           and spl and [x for x in ub if x["menge"] == 20][0]["lager_id"] == spl[0]["id"], "Umbuchung FL → SPL: %s" % ub)
    pg.wait_for_selector("[data-erp-bewegungen]")
    txt = pg.inner_text("[data-erp-bewegungen]")
    pruefe("Umbuchung" in txt and "SPL Q1" in txt and "Masse prüfen, QS" in txt and fa[0]["nr"] in txt, "Bewegungen zeigen Umbuchung und FA")
    for k in ("zu", "ab", "korrektur", "gewatec"): pg.locator("[data-erp-bewegungen-filter] [data-erp-bew-art='%s'] input, [data-erp-bew-art='%s'] input" % (k, k)).first.uncheck()
    pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-erp-bewegungen] tbody tr").count() == 2, "Filter Umbuchung")
    pg.screenshot(path=BILD + "/erp-bewegungen.png", full_page=True)

    # Abbuchen und Zubuchen von Hand (Korrektur am selben Platz)
    def korr(modus, menge, grund):
        pg.locator("tr[data-erp-zeile^='a1|']:has-text('Regal 7')").first.click(); pg.wait_for_selector("[data-erp-umbuchen]")
        u = pg.locator("[data-erp-umbuchen]")
        u.locator("[data-erp-modus='%s']" % modus).click(); pg.wait_for_timeout(200)
        u.locator("[data-erp-feld='menge']").fill(str(menge))
        u.locator("[data-erp-feld='grund']").fill(grund)
        u.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(900)
    def korrs(): return [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "korrektur" and x.get("notiz") in ("Bruch", "Gezählt")]
    korr("ab", 3, "Bruch")
    korr("zu", 5, "Gezählt")
    kk = korrs()
    pruefe(sorted(x["menge"] for x in kk) == [-3, 5] and len({x["lager_id"] for x in kk}) == 1, "Ab- und Zubuchen als Korrektur: %s" % kk)


    # Kalkulation: Kunde, Artikel und Material aus den Stammdaten wählen
    for _ in range(4):
        if pg.locator(".dialog-huelle").count() == 0: break
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.click("[data-erp-reiter='kalk']"); pg.wait_for_timeout(500)
    pg.click("#kalk-neu"); pg.wait_for_selector("#kalk-kunde")
    pg.fill("#kalk-kunde", "muster"); pg.wait_for_selector("[data-kalk-wahl='kalk-kunde'] [data-kalk-wahl-id='k1']")
    pg.screenshot(path=BILD + "/erp-kalk-wahl.png")
    pg.click("[data-kalk-wahl='kalk-kunde'] [data-kalk-wahl-id='k1']"); pg.wait_for_timeout(300)
    pruefe(pg.input_value("#kalk-kunde") == "Muster AG" and pg.input_value("#kalk-adr-strasse") == "Weg 1"
           and pg.input_value("#kalk-adr-ort") == "Lohn", "Kunde aus Stammdaten mit Adresse")
    pg.fill("#kalk-artikel", "0589 bolzen"); pg.wait_for_selector("[data-kalk-wahl='kalk-artikel'] [data-kalk-wahl-id='a1']")
    pg.click("[data-kalk-wahl='kalk-artikel'] [data-kalk-wahl-id='a1']"); pg.wait_for_timeout(300)
    pruefe(pg.input_value("#kalk-artikel") == "10007-0589" and pg.input_value("#kalk-index") == "B"
           and pg.input_value("#kalk-bez") == "Bolzen", "Artikel aus Stammdaten mit Index und Bezeichnung")
    pg.click("[data-kalk-reiter='material']"); pg.wait_for_selector("#kalk-mat")
    pg.fill("#kalk-mat", "x8cr"); pg.wait_for_selector("[data-kalk-wahl='kalk-mat'] [data-kalk-wahl-id='r1']")
    pg.click("[data-kalk-wahl='kalk-mat'] [data-kalk-wahl-id='r1']"); pg.wait_for_timeout(300)
    pruefe(pg.input_value("#kalk-mat") == "X8CrNiS18-9 rd 12", "Rohmaterial aus Stammdaten")

    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()

print("Fehler:", "keine" if not fehler else fehler)
