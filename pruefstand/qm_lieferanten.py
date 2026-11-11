# Lieferantenbewertung je Jahr (1.483.0, Wunsch Patrick 11. November 2026):
# Seite 1 der Gewatec-Liste einlesen, Auswahl bis 80 % der Bestellungen,
# bewerten mit Smileys wie auf dem Gewatec-Blatt, Grafik und PDF.
# Die Testliste wird hier mit reportlab erzeugt (erfundene Lieferanten).
import time, os, tempfile
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
from reportlab.pdfgen import canvas
server_starten(); time.sleep(0.4)
BILD = os.environ.get("QM_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

LISTE = [("20001", "Alpha Stahl AG", "30.00%", "90"), ("20002", "Beta Galvanik", "25.50%", "77"), ("20003", "Gamma Härterei AG", "23.00%", "60"),
         ("20004", "Delta Werkzeuge GmbH", "7.00%", "30"), ("20005", "Epsilon AG", "8.00%", "24"), ("20006", "Zeta SA", "6.50%", "19")]
pdf = os.path.join(tempfile.gettempdir(), "lb-test.pdf")
c = canvas.Canvas(pdf); c.setFont("Helvetica", 10)
c.drawString(40, 800, "Auswahl Lieferanten zur periodischen Bewertung nach"); c.drawString(420, 800, "Druck: 10.03.2026")
c.drawString(40, 780, "im Zeitraum: 06.01.2025 bis 19.12.2025")
for i, (nr, n, p, b) in enumerate(LISTE):
    y = 740 - i * 20
    c.drawString(40, y, nr); c.drawString(90, y, n); c.drawString(400, y, p); c.drawString(480, y, b)
c.drawString(400, 580, "Total"); c.drawString(480, 580, "300")
c.save()

VERMERK = """;
(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { qmSehen: true };
TEST.daten.qma_texte = [];
TEST.daten.qma_eintraege = [
  { id: 'l-a', art: 'lieferant', nr: 1, titel: 'Alpha Stahl AG', status: 'freigegeben', daten: { titel: 'Alpha Stahl AG', nr: '20001',
    verlauf: { '2024': { punkte: 90, k: { t: 5, p: 3, b: 4, q: 5, r: 5 }, bemerkung: 'Preise beobachten', am: '2025-03-04' } } } },
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
    pg.click("[data-qmareiter='lieferant']"); pg.wait_for_selector("#qma-lb")
    pruefe(pg.locator("#qma-lb-grafik").count() == 1, "Grafik mit dem Vorjahr da")
    pg.set_input_files("#qma-lb-datei", pdf)
    pg.wait_for_selector("#qma-lb-auswahl", timeout=20000)
    pruefe(pg.locator("[data-qmalbwahl]").count() == 6, "sechs Lieferanten gelesen")
    gew = pg.evaluate("[...document.querySelectorAll('[data-qmalbwahl]')].filter(x => x.checked).map(x => x.dataset.qmalbwahl)")
    pruefe(gew == ["20001", "20002", "20003"], "Vorschlag bis 80 %%: %s" % gew)
    pruefe(pg.input_value("[data-qmalbfeld='jahr']") == "2025", "Jahr aus dem Zeitraum")
    pg.click("[data-qmalbwahl='20004']")
    pruefe("4 ausgewählt" in pg.inner_text("#qma-lb-summe"), "Häkchen dazu")
    pg.click("#qma-lb-uebernehmen")
    pg.wait_for_selector("#qma-lb-bew", timeout=20000); pg.wait_for_timeout(500)
    t = pg.evaluate("TEST.daten.qma_texte.find(x => x.schluessel === 'lieferanten:2025')")
    pruefe(t and t["felder"]["auswahl"] == ["20001", "20002", "20003", "20004"] and t["felder"]["total"] == 300, "Liste gespeichert")
    n = pg.evaluate("TEST.daten.qma_eintraege.filter(e => e.art === 'lieferant').length")
    pruefe(n == 4, "drei neue Lieferanten angelegt, Alpha wiederverwendet (%s)" % n)
    pruefe(pg.locator("[data-qmalbkarte]").count() == 4, "vier Karten zum Bewerten")
    for k in ["t5", "p4", "b4", "q5", "r5"]:
        pg.click("[data-qmalbkarte='20001'] [data-qmalbk='%s']" % k)
    pruefe("Vorschlag 92" in (pg.get_attribute("[data-qmalbpunkte='20001']", "placeholder") or ""), "Vorschlag aus den Smileys")
    pg.fill("[data-qmalbpunkte='20001']", "95")
    pg.fill("[data-qmalbbem='20001']", "Sehr gut")
    for k in ["t2", "p3", "b3", "q3", "r3"]:
        pg.click("[data-qmalbkarte='20002'] [data-qmalbk='%s']" % k)
    pg.wait_for_timeout(1400)
    a = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.id === 'l-a')")
    v = a["daten"]["verlauf"]["2025"]
    pruefe(v["punkte"] == 95 and v["k"]["p"] == 4 and v["bemerkung"] == "Sehr gut" and v["am"], "Alpha gespeichert: %s" % v)
    pruefe(a["daten"]["verlauf"]["2024"]["punkte"] == 90, "Vorjahr bleibt")
    pruefe(str(a["daten"]["punkte"]) == "95" and a["status"] == "freigegeben", "Stand und Status nachgeführt")
    b = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.daten.nr === '20002')")
    pruefe(b["daten"]["punkte"] == 56 and b["status"] == "gesperrt", "Beta aus Smileys 56 → sperren (%s, %s)" % (b["daten"]["punkte"], b["status"]))
    pg.screenshot(path=BILD + "/qma-lb-bewerten.png")
    pg.click("#qma-lb-bew [data-zu]"); pg.wait_for_timeout(1200)
    pruefe(pg.locator("[data-qmalbjahr]").count() == 2, "Jahre 2024 und 2025")
    pruefe(pg.locator("#qma-lb-tabelle tbody tr").count() == 4, "Tabelle 2025 mit vier Lieferanten")
    pruefe("+5" in pg.inner_text("[data-qmalbzeile='20001']"), "Veränderung zum Vorjahr")
    pg.screenshot(path=BILD + "/qma-lb.png", full_page=True)
    pg.click("#qma-lb-pdf"); pg.wait_for_selector(".betrachter", timeout=20000)
    pruefe(True, "PDF im Betrachter")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    pg.click("#qma-lb-bewerten"); pg.wait_for_selector("#qma-lb-bew"); pg.wait_for_timeout(600)
    breit = pg.evaluate("document.querySelector('#qma-lb-bew').scrollWidth <= document.querySelector('#qma-lb-bew').clientWidth + 1 && document.documentElement.scrollWidth <= 391")
    pruefe(breit, "Handy: kein seitliches Rollen")
    pg.screenshot(path=BILD + "/qma-lb-handy.png")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
