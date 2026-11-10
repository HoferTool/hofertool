# Audit im Pad Mode und Diktat (1.470.0); Grundlage wie qm_checkliste.py
# Auditcheckliste (1.469.0, Wunsch Patrick 10. November 2026): beim nächsten
# Audit Produktion die Checkliste durchführen, beim Abschluss Bericht als PDF,
# Audit durchgeführt, Feststellungen in die Liste Abweichungen.
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
  { schluessel: 'checkliste:Produktion', gruppe: 'checkliste', titel: 'Auditcheckliste Produktion', norm: '9.2', felder: { bereich: 'Produktion', fragen: [
    { id: 'q1', norm: '7.1.5', thema: 'Prüfmittel', frage: 'Sind die Prüfmittel kalibriert?', nachweis: 'Prüfmittelliste' },
    { id: 'q2', norm: '8.5.2', thema: 'Rückverfolgbarkeit', frage: 'Sind die Behälter gekennzeichnet?', nachweis: 'Stichprobe' },
    { id: 'q3', norm: '8.7', thema: 'Fehlerhafte Teile', frage: 'Werden Teile gesperrt?', nachweis: '' } ] } },
];
TEST.daten.qma_eintraege = [
  { id: 'a-alt', art: 'audit', nr: 1, titel: 'Produktion alt', status: 'durchgefuehrt', daten: { art: 'intern', bereich: 'Produktion', datum: '2024-11-11' } },
  { id: 'a-neu', art: 'audit', nr: 2, titel: 'Produktion', status: 'vorgesehen', faellig: '2026-06-30', daten: { art: 'intern', bereich: 'Produktion', quartal: '2026-Q2', auditor: 'Daniel Müller' } },
];
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    def laden(zusatz):
        pg.unroute("**/cdn.jsdelivr.net/**")
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + zusatz))
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    # ohne Vermerk keine Kachel Audit
    laden("")
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='qs']")
    pruefe(pg.locator("#pad [data-padwo='audit']").count() == 0, "ohne qmSehen keine Kachel Audit")
    pg.evaluate("sessionStorage.clear()")
    laden(VERMERK + "; TEST.diktat = true;")
    if pg.locator("#pad").count() == 0: pg.locator("button:has-text('Pad Mode')").first.click()
    pg.wait_for_selector("#pad [data-padwo='audit']")
    pg.screenshot(path=BILD + "/pad-start-audit.png")
    pg.click("#pad [data-padwo='audit']"); pg.wait_for_selector("#pad-audit")
    pruefe(pg.locator("[data-padaudit='a-neu']").count() == 1, "offenes Audit Produktion als Karte")
    pruefe(pg.locator("[data-padaudit='a-alt']").count() == 0, "altes Audit nicht als offen")
    pg.wait_for_timeout(500)
    pg.screenshot(path=BILD + "/pad-audit.png")
    pg.click("[data-padaudit='a-neu']"); pg.wait_for_selector("#qma-ck"); pg.wait_for_timeout(600)
    pruefe(pg.locator("#qma-ck [data-diktat]").count() == 5, "Diktat-Knopf bei jedem Textfeld (3 Fragen + 2)")
    pg.click("[data-qmackfrage='q2'] [data-qmackb='a']")
    pg.fill("[data-qmacktext='q2']", "Behälter ohne FA Nr.")
    pg.click("[data-qmackfrage='q2'] [data-diktat]")
    pruefe(pg.locator("[data-qmackfrage='q2'] [data-diktat='an']").count() == 1, "Diktat an (rot)")
    pg.evaluate("TEST.diktatSagen('an der K-2002 gesehen')")
    pg.wait_for_timeout(200)
    v = pg.input_value("[data-qmacktext='q2']")
    pruefe(v == "Behälter ohne FA Nr. an der K-2002 gesehen", "Gesprochenes angehängt: %r" % v)
    # ein anderes Feld starten beendet das erste
    pg.click("[data-qmackstaerken] ~ [data-diktat]")
    pruefe(pg.locator("[data-qmackfrage='q2'] [data-diktat='an']").count() == 0, "nur ein Feld hört zu")
    pg.evaluate("TEST.diktatSagen('Sauber und aufgeräumt')")
    pg.wait_for_timeout(1300)
    pg.click("[data-qmackstaerken] ~ [data-diktat]")
    pruefe(pg.locator("[data-diktat='an']").count() == 0, "Diktat aus")
    ck = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.id === 'a-neu').daten.checkliste")
    pruefe(ck["staerken"] == "Sauber und aufgeräumt" and "K-2002" in ck["antworten"]["q2"]["text"], "Diktat gespeichert")
    pg.screenshot(path=BILD + "/pad-audit-ck.png")
    pg.click("#qma-ck [data-zu]"); pg.wait_for_timeout(800)
    pruefe(pg.locator("#pad-audit").count() == 1, "zurück in der Audit-Seite des Pads")
    pruefe("1 von 3" in pg.inner_text("[data-padaudit='a-neu']"), "Fortschritt auf der Karte")
    pg.click("#pad [data-padzurueck]"); pg.wait_for_selector("#pad [data-padwo='audit']")
    pruefe(True, "Zurück führt zum Startbild")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
