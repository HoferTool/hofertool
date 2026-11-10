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
    { id: 'q2', norm: '8.5.2', thema: 'Rückverfolgbarkeit', frage: 'Sind die Behälter gekennzeichnet?', nachweis: 'Stichprobe',
      varianten: [{ frage: 'Fassung 2: Behälter bis zum Material?', nachweis: 'Probe' }, { frage: 'Fassung 3: Restmaterial?', nachweis: '' }] },
    { id: 'q3', norm: '8.7', thema: 'Fehlerhafte Teile', frage: 'Werden Teile gesperrt?', nachweis: '' } ] } },
];
TEST.daten.qma_eintraege = [
  { id: 'a-alt', art: 'audit', nr: 1, titel: 'Produktion alt', status: 'durchgefuehrt', daten: { art: 'intern', bereich: 'Produktion', datum: '2024-11-11',
    feststellungen: 'Prozesse überprüfen und anpassen\\nBehälter anschreiben' } },
  { id: 'w-1', art: 'abweichung', nr: 1, titel: 'Behälter anschreiben', status: 'umgesetzt', daten: { quelle: 'audit', titel: 'Behälter anschreiben', herkunft: 'a-alt' } },
  { id: 'w-2', art: 'abweichung', nr: 2, titel: 'Schon erledigt', status: 'wirksam', daten: { quelle: 'audit', titel: 'Schon erledigt', herkunft: 'a-alt' } },
  { id: 'a-neu', art: 'audit', nr: 2, titel: 'Produktion', status: 'vorgesehen', faellig: '2026-06-30', daten: { art: 'intern', bereich: 'Produktion', quartal: '2026-Q2', auditor: 'Daniel Müller' } },
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
    pg.click("[data-qmareiter='audit']"); pg.wait_for_selector("#qma-auditplan")
    pruefe(pg.locator("[data-qmacknaechste='a-neu']").count() == 1, "nächstes Audit Produktion mit Knopf")
    pruefe(pg.locator("[data-qmackliste='a-alt']").count() == 0, "altes durchgeführtes Audit ohne Checkliste-Knopf")
    pruefe(pg.locator("[data-qmackliste='a-neu']").count() == 1, "Checkliste-Knopf in der Liste")
    pg.click("[data-qmackstart='a-neu']"); pg.wait_for_selector("#qma-ck")
    pruefe(pg.locator("[data-qmackfrage]").count() == 3, "drei Fragen")
    txt = pg.inner_text("#qma-ck")
    pruefe("Fassung 2: Behälter bis zum Material?" in txt and "Sind die Behälter gekennzeichnet?" not in txt, "zweites Audit des Bereichs: zweite Fassung der Frage")
    pruefe("Sind die Prüfmittel kalibriert?" in txt, "Frage ohne Fassungen bleibt")
    pruefe("Fragen Fassung 2 von 3" in txt, "Kopf nennt die Fassung")
    vor = pg.evaluate("[...document.querySelectorAll('[data-qmackvor]')].map(x => x.dataset.qmackvor)")
    pruefe(vor == ["w-1", "a-alt#0"], "offene Punkte: offene Abweichung und nicht übertragene Feststellung, ohne erledigte: %s" % vor)
    pg.click("[data-qmackvor='w-1'] [data-qmackvorb='erledigt']")
    pg.fill("[data-qmackvortext='w-1']", "alle Behälter angeschrieben")
    pg.click("[data-qmackvor='a-alt#0'] [data-qmackvorb='offen']")
    pg.wait_for_timeout(300); pg.screenshot(path=BILD + "/qma-checkliste-vor.png")
    pruefe(pg.input_value("[data-qmackkopf='auditor']") == "Daniel Müller", "Auditor vom Audit übernommen")
    pg.fill("[data-qmackkopf='auditiert']", "SH, ET")
    pg.click("[data-qmackfrage='q1'] [data-qmackb='ok']")
    pg.click("[data-qmackfrage='q2'] [data-qmackb='a']")
    pg.fill("[data-qmacktext='q2']", "Behälter an K-2002 ohne FA Nr.")
    pg.click("[data-qmackfrage='q3'] [data-qmackb='v']")
    pg.fill("[data-qmackstaerken]", "Ordnung an den Maschinen")
    pg.wait_for_timeout(1300)
    ck = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.id === 'a-neu').daten.checkliste")
    pruefe(ck and ck["antworten"]["q2"]["b"] == "a" and ck["kopf"]["auditiert"] == "SH, ET", "speichert von selbst")
    pruefe("3 / 3" in pg.inner_text("#qma-ck-stand"), "3 von 3 beantwortet")
    pg.screenshot(path=BILD + "/qma-checkliste.png")
    # Schliessen und wieder öffnen: alles noch da
    pg.click("#qma-ck [data-zu]"); pg.wait_for_timeout(600)
    pruefe(pg.locator("#qma-ck").count() == 0, "Fenster zu")
    pruefe("weiterführen" in pg.inner_text("[data-qmackstart='a-neu']"), "Knopf heisst jetzt weiterführen")
    pg.click("[data-qmackstart='a-neu']"); pg.wait_for_selector("#qma-ck")
    pruefe(pg.input_value("[data-qmacktext='q2']") == "Behälter an K-2002 ohne FA Nr.", "Bemerkung wieder da")
    pg.click("#qma-ck-ab"); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle").last.locator(".knopf--haupt").last.click()
    pg.wait_for_function("!document.querySelector('#qma-ck')", timeout=20000)
    pg.wait_for_timeout(1200)
    a = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.id === 'a-neu')")
    pruefe(a["status"] == "durchgefuehrt", "Audit durchgeführt")
    pruefe(bool(a["daten"].get("bericht_url")) and a["daten"]["bericht_name"].endswith("_Internes_Audit_Produktion.pdf"), "Bericht angehängt: %s" % a["daten"].get("bericht_name"))
    pruefe(a["daten"]["checkliste"].get("abgeschlossen_am") and len(a["daten"]["checkliste"]["fragen"]) == 3, "Fragen eingefroren")
    f2 = a["daten"]["checkliste"]["fragen"][1]
    pruefe(f2["frage"].startswith("Fassung 2") and "varianten" not in f2 and a["daten"]["checkliste"].get("runde") == 1, "gewählte Fassung eingefroren: %s" % f2)
    pruefe("8.5.2" in (a["daten"].get("norm") or ""), "Normkapitel eingetragen")
    pruefe(a["daten"].get("auditiert") == "SH, ET" and a["daten"].get("uebertragen"), "Kopf und übertragen gesetzt")
    w1 = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.id === 'w-1')")
    pruefe(w1["status"] == "wirksam" and "Geprüft im Audit" in w1["daten"]["wirksamkeit"] and "angeschrieben" in w1["daten"]["wirksamkeit"], "erledigter Punkt wird wirksam: %s" % w1["daten"].get("wirksamkeit"))
    neu_vor = pg.evaluate("TEST.daten.qma_eintraege.filter(e => e.art === 'abweichung' && (e.titel || '').startsWith('Offen aus Audit 11.11.2024'))")
    pruefe(len(neu_vor) == 1 and neu_vor[0]["daten"]["herkunft"] == "a-neu", "noch offene Feststellung als neuer Eintrag")
    pruefe(len(a["daten"]["checkliste"].get("vorliste") or []) == 2, "Punkte eingefroren")
    abw = pg.evaluate("TEST.daten.qma_eintraege.filter(e => e.art === 'abweichung' && e.daten.herkunft === 'a-neu' && !e.titel.startsWith('Offen aus'))")
    pruefe(len(abw) == 2 and abw[0]["titel"].startswith("Abweichung 8.5.2"), "zwei Abweichungen, Abweichung zuerst: %s" % [x["titel"] for x in abw])
    up = pg.evaluate("TEST.protokoll.filter(x => x.art === 'upload')")
    pruefe(len(up) == 1 and up[0]["typ"] == "application/pdf" and up[0]["groesse"] > 5000, "PDF hochgeladen %s" % up)
    import base64
    b64 = pg.evaluate("async () => { const f = Object.values(TEST.dateien)[0]; const b = new Uint8Array(await f.arrayBuffer()); let s=''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }")
    open(BILD + "/qma-bericht.pdf", "wb").write(base64.b64decode(b64))
    pruefe(pg.locator(".betrachter").count() == 1, "Bericht geht im Betrachter auf")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    if pg.locator("#qma-auditplan").count() == 0: pg.click("[data-qmareiter='audit']"); pg.wait_for_selector("#qma-auditplan")
    pruefe(pg.locator("[data-qmacknaechste]").count() == 0, "kein offenes Audit Produktion mehr")
    pg.click("[data-qmafilter='alle']"); pg.wait_for_timeout(300)
    # Wieder öffnen: gesperrt, „Wieder bearbeiten“
    pg.click("[data-qmackliste='a-neu']"); pg.wait_for_selector("#qma-ck")
    pruefe(pg.locator("#qma-ck-fertig").count() == 1 and pg.locator("#qma-ck-ab").count() == 0, "abgeschlossen = nur ansehen")
    pg.click("#qma-ck-wieder"); pg.wait_for_timeout(300)
    pruefe(pg.locator("#qma-ck-ab").count() == 1, "wieder bearbeiten möglich")
    pg.click("#qma-ck [data-zu]"); pg.wait_for_timeout(500)
    # Handy: Fenster ohne seitliches Rollen
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    pg.click("[data-qmackliste='a-neu']"); pg.wait_for_selector("#qma-ck")
    pg.wait_for_timeout(900)
    breit = pg.evaluate("document.querySelector('#qma-ck').scrollWidth <= document.querySelector('#qma-ck').clientWidth + 1 && document.documentElement.scrollWidth <= 391")
    pruefe(breit, "Handy: kein seitliches Rollen")
    pg.screenshot(path=BILD + "/qma-checkliste-handy.png")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
