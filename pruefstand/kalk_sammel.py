# Sammelangebot (1.946.0, Wunsch Patrick 28. November 2026): Kalkulationen
# mit derselben Sammelnummer werden Positionen eines Angebots.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

SAAT = """
(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { kalkulationSehen: true };
TEST.daten.kalk_maschinen = [];
TEST.daten.erp_artikel = []; TEST.daten.erp_partner = [{ id: 'k1', art: 'kunde', nr: '10332', name: 'Gysin AG', aktiv: true, daten: { adresse: { strasse: 'Stammweg 1', plz: '4500', ort: 'Solothurn', land: 'CH' } } }];
const kk = (id, nr, art, bez, sammel, preis) => ({ id, nr, kunde: 'Gysin AG', artikel: art, geaendert_am: '2026-11-0' + nr.slice(-1) + 'T08:00:00Z',
  daten: { kopf: { kunde: 'Gysin Alt', kundencode: '10332', strasse: 'Altweg 9', plz: '9999', ort: 'Altdorf', artikel: art, bezeichnung: bez, sammel, anfrage_nr: 'AN-9' }, material: { bez: '1.4305' }, ags: [],
    preis: { pe: '1', waehrung: 'CHF', rundung: '0.01' }, staffeln: [{ menge: '1000', lose: '1', angebot: preis }] } });
TEST.daten.kalkulationen = [kk('kk1', '20260021', '10332-0706', 'Ring Gear', '', '3.65'), kk('kk2', '20260022', '10332-0707', 'Sun Gear', 'Gysin Nov', '4.10'),
  kk('kk3', '20260023', '10332-0708', 'Planet', 'andere', '1.00')];
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1400, "height": 1000})
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + ";\n" + SAAT))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/kalkulation'"); pg.wait_for_selector("#kalk-suche")
    pg.check("#kalk-alle"); pg.wait_for_timeout(300)
    nrn = pg.locator(".kalk-liste__nr").all_inner_texts()
    pruefe(nrn[:3] == ["20260023", "20260022", "20260021"], "Liste anzeigen ohne Suche, höchste Nr. zuoberst (1.949.0): %s" % nrn)
    pg.uncheck("#kalk-alle"); pg.fill("#kalk-suche", "20260021"); pg.wait_for_selector("[data-kalk='kk1']"); pg.wait_for_timeout(500)
    pg.click("[data-kalk='kk1']"); pg.wait_for_selector("[data-kalk-reiter='angebot']"); pg.wait_for_timeout(600)
    # Adresse immer aus dem Kundenstamm (1.948.2), ohne dass die Kalkulation als geändert gilt
    pg.wait_for_timeout(800)
    pruefe(pg.input_value("#kalk-adr-strasse") == "Stammweg 1" and pg.input_value("#kalk-kunde") == "Gysin AG", "Adresse und Name aus dem Kundenstamm: %s" % pg.input_value("#kalk-adr-strasse"))
    pruefe(pg.locator("#kalk-adr-strasse").get_attribute("readonly") is not None, "Adresse nur im Stamm änderbar")
    pruefe("Nicht gespeichert" not in pg.locator(".kalk-kompakt").inner_text(), "Abgleich zählt nicht als Änderung")
    pg.locator("[data-kalk-reiter='angebot']").click(); pg.wait_for_selector("#kalk-sammel")
    pruefe(pg.locator("#kalk-sammel-pdf").count() == 0, "ohne Sammelnummer kein Sammelangebot")
    pg.fill("#kalk-sammel", "gysin nov"); pg.wait_for_timeout(300)
    t = pg.locator("#kalk-sammel-info").inner_text()
    pruefe("20260022" in t and "20260023" not in t, "findet die Kalkulation mit gleicher Sammelnummer: %s" % t.replace("\n", " | "))
    with pg.expect_popup() as po: pg.click("#kalk-sammel-pdf")
    w = po.value; w.wait_for_load_state(); pg.wait_for_timeout(500)
    h = w.locator("body").inner_text()
    pruefe("10332-0706" in h and "10332-0707" in h and "10332-0708" not in h, "Sammelangebot mit beiden Artikeln")
    pruefe("Ring Gear" in h and "Sun Gear" in h, "beide Bezeichnungen")
    pruefe("Sammelangebot" in h and "gysin nov" in h, "Sammelnummer im Kopf")
    pruefe("Anfrage Nr. AN-9" in h, "Anfrage-Nr. im Angebot")
    pruefe(h.find("Ring Gear") < h.find("Sun Gear"), "Reihenfolge nach Nummer")
    pruefe("Stammweg 1" in h and "Altweg" not in h, "Angebot mit Adresse aus dem Kundenstamm")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
