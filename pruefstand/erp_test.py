# Test ERP (1.672.0, Wunsch Patrick 20. November 2026): nur mit Vermerk
# erpSehen, Kalkulation steht als Reiter im ERP statt im Menü. Ganzer
# Ablauf: Bestellung → Wareneingang, Auftrag → FA → Material → Fertig →
# Lieferschein (nur gleicher Index) → Rechnung → Fibu → Rückverfolgung.
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
TEST.daten.erp_lager = [{ id: 'lg1', art: 'lager', platz: 'A1', bezeichnung: 'Regal A' }];
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
    f.locator("input[data-erp-feld='menge']").last.fill(menge)
    if preis: f.locator("input[data-erp-feld='preis']").last.fill(preis)
    f.locator("[data-erp-speichern]").click(); pg.wait_for_timeout(700)
    pg.screenshot(path=BILD + "/erp-nach-%s.png" % typ)

def tabelle(pg, t): return pg.evaluate("() => TEST.daten.%s" % t)

with sync_playwright() as p:
    br, pg, pf = start(p, False)
    pruefe(pg.locator("a[href='#/erp']").count() == 0, "ohne Vermerk kein Menüpunkt Test ERP")
    br.close()

    br, pg, pf = start(p, True)
    pruefe(pg.locator("a[href='#/erp']").count() >= 1, "mit Vermerk Menüpunkt Test ERP")
    pruefe(pg.locator("a[href='#/kalkulation']").count() == 0, "Kalkulation nicht mehr im Menü")
    pg.evaluate("location.hash='#/erp'"); pg.wait_for_selector("[data-erp-reiter='auftrag']")

    # Bestellung und Wareneingang
    neuer_beleg(pg, "bestellung", "l1", "X8CrNiS18-9 rd 12", "100")
    be = [b for b in tabelle(pg, "erp_belege") if b["typ"] == "bestellung"]
    pruefe(len(be) == 1 and be[0]["nr"].startswith("BE26-"), "Bestellung gespeichert: %s" % [b["nr"] for b in be])
    oben(pg).locator("[data-erp-aktion='we']").click(); pg.wait_for_selector("[data-erp-wepos]")
    pg.locator(".dialog [data-erp-ja]").last.click(); pg.wait_for_timeout(800)
    we = [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "eingang"]
    pruefe(len(we) == 1 and we[0]["menge"] == 100 and we[0]["charge"].startswith("WE-BE26-"), "Wareneingang gebucht: %s" % we)
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
    oben(pg).locator("[data-erp-aktion='material']").click(); pg.wait_for_selector(".dialog:has-text('Material für') input")
    pg.locator(".dialog:has-text('Material für') input[data-erp-feld='menge']").fill("30")
    pg.locator(".dialog:has-text('Material für') [data-erp-ja]").click(); pg.wait_for_timeout(800)
    ent = [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "entnahme"]
    pruefe(len(ent) == 1 and ent[0]["menge"] == -30 and ent[0]["artikel_id"] == "r1", "Material entnommen: %s" % ent)
    oben(pg).locator("[data-erp-aktion='fertig']").click(); pg.wait_for_selector(".dialog:has-text('Fertig melden') input")
    pg.locator(".dialog:has-text('Fertig melden') [data-erp-ja]").click(); pg.wait_for_timeout(800)
    fm = [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "fertig"]
    pruefe(len(fm) == 1 and fm[0]["menge"] == 200 and fm[0]["artikel_id"] == "a1" and fm[0]["charge"] == fa[0]["nr"], "Fertig gemeldet: %s" % fm)
    pg.screenshot(path=BILD + "/erp-fa.png")
    pg.locator("[data-erp-beleg='%s'] [data-nein]" % fa[0]["nr"]).click(); pg.wait_for_timeout(300)

    # Lieferschein aus dem noch offenen Auftragsfenster (holt den frischen Bestand)
    oben(pg).locator("[data-erp-aktion='ls']").click(); pg.wait_for_selector("[data-erp-lspos]")
    pg.locator("[data-erp-lspos] input[data-erp-feld='menge']").fill("150")
    pg.locator(".dialog:has([data-erp-lspos]) [data-erp-ja]").click(); pg.wait_for_timeout(1000)
    lf = [x for x in tabelle(pg, "erp_bewegungen") if x["art"] == "lieferung"]
    pruefe(len(lf) == 1 and lf[0]["menge"] == -150 and lf[0]["charge"] == fa[0]["nr"], "Lieferschein bucht 150 aus der FA-Charge: %s" % lf)
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

    # Rückverfolgung der FA-Charge bis zum Rohmaterial und Kunden
    pg.click("[data-erp-reiter='rueck']"); pg.locator(".erp-suche").fill(fa[0]["nr"]); pg.wait_for_timeout(400)
    spur = pg.inner_text("[data-erp-spur='%s']" % fa[0]["nr"])
    pruefe("X8CrNiS18-9" in spur and "Muster AG" in spur and "WE-BE26-" in spur, "Spur zeigt Material-Charge und Kunde")
    pg.screenshot(path=BILD + "/erp-rueck.png")

    # Kalkulation im ERP
    pg.click("[data-erp-reiter='kalk']"); pg.wait_for_timeout(800)
    pruefe(pg.locator(".erp-kalk").count() == 1 and "K-1" in pg.inner_text(".erp-kalk"), "Modul Kalkulation im Reiter")
    pg.click("[data-erp-kalkreiter='artikel']"); pg.wait_for_selector("[data-erp-kalk='K-1']")
    pg.click("[data-erp-kalk='K-1']"); pg.wait_for_timeout(800)
    neu = [a for a in tabelle(pg, "erp_artikel") if a["nr"] == "10007-0590"]
    pruefe(len(neu) == 1 and neu[0]["idx"] == "C" and neu[0]["kunde_id"] == "k1", "Artikel aus Kalkulation angelegt: %s" % neu)
    pg.screenshot(path=BILD + "/erp-kalk.png")
    a = neu[0] if neu else {}
    pl = (a.get("daten") or {}).get("preisliste") or {}
    pruefe(pl.get("pe") == 1000 and pl.get("kalkulation_nr") == "K-1"
           and [(x["ab"], x["preis"]) for x in pl.get("staffeln", [])] == [(1000, 250), (5000, 200)] and a.get("preis") == 250,
           "Preisliste aus Kalkulation: %s" % pl)
    pruefe((a.get("daten") or {}).get("rohmaterial_id") == "r1", "Rohmaterial zugewiesen: %s" % a.get("daten"))
    pg.click("[data-erp-kalk='K-2']"); pg.wait_for_timeout(800)
    a2 = [x for x in tabelle(pg, "erp_artikel") if x["nr"] == "10007-0591"]
    pruefe(len(a2) == 1 and not (a2[0]["daten"] or {}).get("rohmaterial_id") and a2[0]["daten"]["material"] == "CuZn39Pb3 rd 8"
           and not [x for x in tabelle(pg, "erp_artikel") if x["art"] == "rohmaterial" and "CuZn" in x["nr"]],
           "Fehlendes Rohmaterial nur als Text, nicht angelegt")
    # Reihenfolge der Reiter: Kalkulation, Stammdaten, Rest
    pruefe(pg.locator("[data-erp-reiter]").first.get_attribute("data-erp-reiter") == "kalk"
           and pg.locator("[data-erp-reiter]").nth(1).get_attribute("data-erp-reiter") == "stamm", "Reiter: Kalkulation zuerst")
    # Artikelfenster mit Preisliste, Herkunft, Rohmaterial, Platz für Zeichnung und 3D
    pg.click("[data-erp-reiter='stamm']"); pg.wait_for_timeout(300)
    pg.click("[data-erp-stamm='artikel']"); pg.wait_for_timeout(300)
    pg.locator("[data-erp-zeile='%s']" % a["id"]).click(); pg.wait_for_selector("[data-erp-artfenster]")
    pruefe("K-1" in pg.inner_text("[data-erp-pl-herkunft]") and pg.locator("[data-erp-pl-zeile]").count() == 2
           and "X8CrNiS18-9" in pg.inner_text("[data-erp-art-roh]") and pg.locator("[data-erp-art-modell]").count() == 1,
           "Artikelfenster zeigt Preisliste, Herkunft und Rohmaterial")
    breite = pg.evaluate("() => document.querySelector('[data-erp-artfenster]').getBoundingClientRect().width")
    pruefe(breite > 1200, "Artikelfenster gross: %s" % breite)
    pg.wait_for_timeout(800); pg.screenshot(path=BILD + "/erp-artikelfenster.png")
    pg.click("[data-erp-pl-bearbeiten]"); pg.wait_for_timeout(200)
    pg.locator("[data-erp-artfenster] input").nth(1).fill("240"); pg.click("[data-erp-pl-speichern]"); pg.wait_for_timeout(700)
    a = [x for x in tabelle(pg, "erp_artikel") if x["id"] == a["id"]][0]
    pl = a["daten"]["preisliste"]
    pruefe(pl.get("von_hand") and "von Hand" in pg.inner_text("[data-erp-pl-herkunft]"), "Von Hand geändert vermerkt: %s" % pl)
    pg.locator("[data-erp-artfenster] [aria-label='Schliessen']").click(); pg.wait_for_timeout(200)
    # Auftrag mit 6'000 Stk nimmt Staffel ab 5'000 und Preis pro 1'000
    neuer_beleg(pg, "auftrag", "k1", "10007-0590 Ind. C · Hülse", "6000")
    ap = [x for x in tabelle(pg, "erp_positionen") if x["artikel_id"] == a["id"]]
    pruefe(ap and ap[-1]["preis"] == 200 and (ap[-1].get("daten") or {}).get("pe") == 1000, "Auftrag nimmt Staffelpreis: %s" % ap)

    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()

print("Fehler:", "keine" if not fehler else fehler)
