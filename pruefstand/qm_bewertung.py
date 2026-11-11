# Managementbewertung wie ein Audit (1.483.0, Wunsch Patrick 11. November 2026):
# Fragekatalog, Zahlen mit Vorjahr, Werte aus dem HoferTool, Bewertung je
# Kapitel, Abschliessen gibt Bericht als PDF, Ziele und Massnahmen in die Listen.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("QM_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

VERMERK = """;
(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { qmSehen: true };
TEST.daten.qma_texte = [
  { schluessel: 'bewertung:fragen', gruppe: 'einstellung', titel: 'Fragekatalog', norm: '9.3', felder: { fragen: [
    { id: 'f1', kapitel: 'geschaeft', text: 'Umsatz', art: 'chf', einheit: '', hilfe: 'aus dem Abschluss' },
    { id: 'f2', kapitel: 'geschaeft', text: 'EBIT-Marge', art: 'prozent', einheit: '', hilfe: '' },
    { id: 'f3', kapitel: 'rueckmeldungen', text: 'Rückmeldungen der Kunden', art: 'text', einheit: '', hilfe: '' } ] } },
];
TEST.daten.qma_eintraege = [
  { id: 'b-2025', art: 'bewertung', nr: 1, titel: 'Managementbewertung 2025', status: 'freigegeben', daten: { jahr: 2025,
    mb: { antworten: { f1: { wert: '4200000' }, f2: { wert: '13' } }, kapitel: {}, fragen: [] } } },
  { id: 'b-2026', art: 'bewertung', nr: 2, titel: 'Managementbewertung 2026', status: 'entwurf', daten: { jahr: 2026, datum: '2026-11-10' } },
  { id: 'l-1', art: 'lieferant', nr: 1, titel: 'Steeltec', status: 'freigegeben', daten: { titel: 'Steeltec', letzte: '2026-02-18', punkte: 95 } },
];
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + VERMERK))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/qmalt", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.click("[data-qmareiter='bewertung']"); pg.wait_for_selector("#qma-bewertung")
    if pg.locator("#qma-bew-durchfuehren").count() == 0:
        pg.click("[data-qmabew='b-2026']"); pg.wait_for_timeout(300)
    pg.click("#qma-bew-durchfuehren"); pg.wait_for_selector("#qma-mb")
    pg.wait_for_timeout(1200)
    pruefe(pg.locator("[data-qmambkap]").count() == 14, "14 Kapitel nach ISO 9.3")
    pruefe(pg.locator("[data-qmambfrage]").count() == 3, "drei Fragen aus dem Katalog")
    pg.fill("[data-qmambwert='f1']", "4'500'000")
    pg.fill("[data-qmambwert='f2']", "11")
    t = pg.inner_text("[data-qmambkap='geschaeft']")
    pruefe("2025" in t and "+7.1" in t.replace(",", ".") , "Vorjahr und Veränderung beim Umsatz: %s" % t[:300].replace("\n", " | "))
    pruefe("Prozentpunkte" in t or "Pp" in t or "-2" in t, "Veränderung der Marge in Prozentpunkten")
    pg.click("[data-qmambkap='geschaeft'] .qma-mb__b--gruen")
    pg.click("[data-qmambkap='geschaeft'] .qma-mb__mass .qma-ck__b >> nth=0")
    pg.wait_for_timeout(1300)
    mb = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.id === 'b-2026').daten.mb")
    pruefe(mb and mb["antworten"]["f1"]["wert"] and mb["kapitel"]["geschaeft"]["b"] == "gut", "speichert von selbst")
    lt = pg.inner_text("[data-qmambkap='lieferanten']")
    pruefe("Lieferant" in lt, "Kapitel Lieferanten mit Werten aus dem HoferTool: %s" % lt[:200].replace("\n", " | "))
    pg.screenshot(path=BILD + "/qma-mb.png")
    # Ziel und Massnahme
    pg.click("#mb-k-ergebnis .qma-mb__liste >> nth=0 >> .knopf"); pg.wait_for_timeout(200)
    pg.locator("#mb-k-ergebnis .qma-mb__liste >> nth=0 >> input").first.fill("Liefertreue 95 %")
    pg.click("#mb-k-ergebnis .qma-mb__liste >> nth=1 >> .knopf"); pg.wait_for_timeout(200)
    pg.locator("#mb-k-ergebnis .qma-mb__liste >> nth=1 >> input").first.fill("Preise Klein verhandeln")
    pg.wait_for_timeout(1200)
    pg.click("#qma-mb-ab"); pg.wait_for_timeout(400)
    if pg.locator(".dialog-huelle").count() > 1:
        pg.locator(".dialog-huelle").last.locator(".knopf--haupt").last.click()
    pg.wait_for_function("!document.querySelector('#qma-mb')", timeout=20000)
    pg.wait_for_timeout(1200)
    b = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.id === 'b-2026')")
    pruefe(b["status"] == "freigegeben" and (b["daten"].get("bericht_name") or "").endswith("_Managementbewertung.pdf"), "abgeschlossen mit Bericht: %s" % b["daten"].get("bericht_name"))
    z = pg.evaluate("TEST.daten.qma_eintraege.filter(e => e.art === 'ziel' && e.daten.herkunft === 'b-2026').length")
    m = pg.evaluate("TEST.daten.qma_eintraege.filter(e => e.art === 'abweichung' && e.daten.herkunft === 'b-2026').length")
    pruefe(z == 1 and m == 1, "Ziel und Massnahme angelegt (%s, %s)" % (z, m))
    up = pg.evaluate("TEST.protokoll.filter(x => x.art === 'upload')")
    pruefe(len(up) == 1 and up[0]["typ"] == "application/pdf", "PDF hochgeladen")
    import base64
    b64 = pg.evaluate("async () => { const f = Object.values(TEST.dateien)[0]; const b = new Uint8Array(await f.arrayBuffer()); let s=''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }")
    open(BILD + "/qma-mb-bericht.pdf", "wb").write(base64.b64decode(b64))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.screenshot(path=BILD + "/qma-mb-reiter.png")
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    if pg.locator("#qma-bew-ansehen").count() == 0: pg.click("[data-qmabew='b-2026']"); pg.wait_for_timeout(300)
    pg.click("#qma-bew-ansehen"); pg.wait_for_selector("#qma-mb"); pg.wait_for_timeout(900)
    breit = pg.evaluate("document.querySelector('#qma-mb').scrollWidth <= document.querySelector('#qma-mb').clientWidth + 1 && document.documentElement.scrollWidth <= 391")
    pruefe(breit, "Handy: kein seitliches Rollen")
    pg.screenshot(path=BILD + "/qma-mb-handy.png")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
