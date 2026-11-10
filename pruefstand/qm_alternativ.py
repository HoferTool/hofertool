# QM alternativ (1.463.0, Wunsch Patrick 10. November 2026): schlankes
# QM-System nach ISO 9001 mit Cockpit, Handbuch, Listen, Kompetenzmatrix
# und Managementbewertung; nur mit qmSehen, nie für Externe.
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
  { schluessel: 'politik', gruppe: 'handbuch', titel: 'Qualitätspolitik', norm: '5.2', inhalt: 'Teile nach Zeichnung.', sort: 60 },
  { schluessel: 'prozess:fertigung', gruppe: 'kern', titel: 'Fertigung', norm: '8.5', felder: { verantwortlich: 'Einrichter', nr: '02.04', zweck: 'Teile in der geforderten Qualität termingerecht fertigen.', eingaben: 'Planwand, Fabrikationsauftrag mit Zeichnung, Produktionsfreigabe der QS (Erststück, Serie)', ergebnisse: 'Fertige Teile, abgeschlossener FA', kennzahl: 'Ausschussquote', ablauf: 'Vorbereiten: Angaben der Planwand prüfen, Rohmaterial bereitlegen, Werkzeuge rüsten, Prüfmittel bereitlegen.\\nStarten: Programm laden (Nr. und Index), einrichten, einfahren, Erststück-Kontrolle durch den Einrichter.\\nAbarbeiten: laufende Stichproben durch Produktion und/oder QS.\\nAbschliessen: Endkontrolle und Freigabe durch die QS. Änderungen und Verzögerungen sofort an AVOR melden.' }, sort: 50 },
  { schluessel: 'prozess:strategie', gruppe: 'fuehrung', titel: 'Strategie', norm: '6.2 · 9.3', felder: { nr: '01.04' }, sort: 10 },
];
TEST.daten.qma_eintraege = [];
"""
def dialog(pg):
    pg.wait_for_function("document.querySelectorAll('.dialog-huelle').length >= 1")
    return pg.locator(".dialog-huelle").last
def feld(d, name):
    return d.locator(f"[id^='d'][id$='-{name}']").first
def speichern(pg, d):
    d.locator(".knopf--haupt").last.click(); pg.wait_for_timeout(800)

def laden(pg, zusatz, hash=""):
    pg.unroute("**/cdn.jsdelivr.net/**")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + zusatz))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html{hash}", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    laden(pg, "")
    pruefe(pg.locator("[data-nav='qmalt']").count() == 0, "ohne Vermerk kein QM alternativ")
    laden(pg, VERMERK)
    pg.evaluate("location.hash='#/qmalt'")
    pruefe(pg.locator("[data-nav='qmalt']").count() > 0, "QMS im Menü mit Vermerk")
    pruefe(pg.locator("[data-nav='qm']").count() == 0, "kein Reiter QM mehr (seit 1.474.0)")
    pg.wait_for_selector("#qma-norm", timeout=8000)
    pruefe(pg.locator("h1.seitentitel").first.inner_text().strip() == "QMS", "Seite heisst QMS")
    pg.evaluate("location.hash='#/qm'")
    pg.wait_for_function("location.hash==='#/qmalt'", timeout=5000)
    pg.wait_for_selector("#qma-norm", timeout=8000)
    pruefe(True, "#/qm führt zu QMS")
    pruefe(pg.locator("[data-qmanorm='5.2'][data-stand='ok']").count() == 1, "Politik vorhanden = erfüllt")
    pruefe(pg.locator("[data-qmanorm='4.3'][data-stand='fehlt']").count() == 1, "Geltungsbereich leer = fehlt")
    pruefe(pg.locator("[data-qmanorm='8.3'][data-stand='na']").count() == 1, "8.3 nicht anwendbar")
    pruefe(pg.locator("#qma-nichts").count() == 1, "Cockpit: nichts fällig")
    pruefe(pg.locator("[data-qmanorm='8.5.1'] .qma-norm-prozesse").count() == 1, "Cockpit-Zeile nennt den Prozess")
    pg.screenshot(path=BILD + "/qma-cockpit.png", full_page=True)

    # Abweichung erfassen, überfällig → Cockpit
    pg.click("[data-qmareiter='abweichung']"); pg.wait_for_selector("#qma-abweichung")
    pg.click("[data-qmaneu='abweichung']"); d = dialog(pg)
    feld(d, "quelle").select_option("kunde")
    feld(d, "titel").fill("Durchmesser 4.02 statt 4.00")
    feld(d, "massnahme").fill("Werkzeugverschleiss enger überwachen")
    feld(d, "wer").fill("SH")
    feld(d, "termin").fill("2020-01-15")
    speichern(pg, d)
    pruefe(pg.locator("[data-qmaeintrag]").count() == 1, "Abweichung in der Liste")
    pruefe(pg.locator("[data-qmaeintrag] .qm-spaet").count() == 1, "überfälliger Termin rot")
    nr = pg.evaluate("TEST.daten.qma_eintraege[0].nr")
    pruefe(nr == 1, "Nummer 1 vergeben")
    pg.click("[data-qmareiter='cockpit']"); pg.wait_for_selector("#qma-faellig")
    pruefe(pg.locator("[data-qmafaellig]").count() == 1, "Cockpit zeigt die überfällige Abweichung")
    pruefe(pg.locator("[data-qmanorm='10.2'][data-stand='warn']").count() == 1, "10.2 wird gelb bei Überfälligem")

    # Prüfmittel: neu ohne letzte Prüfung = heute fällig, „Heute geprüft“ rechnet 12 Monate
    pg.click("[data-qmareiter='pruefmittel']"); pg.wait_for_selector("#qma-pruefmittel")
    pg.click("[data-qmaneu='pruefmittel']"); d = dialog(pg)
    feld(d, "titel").fill("Bügelmessschraube 0–25"); feld(d, "inventar").fill("PM-001")
    speichern(pg, d)
    pg.click("[data-qmaschnell]"); pg.wait_for_timeout(800)
    pm = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.art === 'pruefmittel')")
    pruefe(pm and pm["daten"]["letzte"] and pm["faellig"] and pm["faellig"][:4] == str(int(pm["daten"]["letzte"][:4]) + 1), "Heute geprüft: nächste in 12 Monaten (%s)" % (pm and pm["faellig"]))

    # Risiko: W × A
    pg.click("[data-qmareiter='risiko']"); pg.wait_for_selector("#qma-risiko")
    pg.click("[data-qmaneu='risiko']"); d = dialog(pg)
    pruefe(feld(d, "partei").locator("option[value='Kunden']").count() == 1, "Anspruchsgruppen aus der Landkarte")
    feld(d, "partei").select_option("Kunden")
    feld(d, "titel").fill("Lieferbereitschaft"); feld(d, "w").select_option("3"); feld(d, "a").select_option("4")
    feld(d, "neu_w").select_option("2"); feld(d, "neu_a").select_option("3")
    speichern(pg, d)
    txt = pg.locator("#qma-risiko").inner_text()
    pruefe("3 × 4 = 12" in txt and "2 × 3 = 6" in txt, "Erst- und Neubeurteilung E × A")
    pruefe(pg.locator(".qma-gruppenzeile", has_text="Kunden").count() == 1, "Gruppenzeile Kunden")

    # Lieferant: Note
    pg.click("[data-qmareiter='lieferant']"); pg.wait_for_selector("#qma-lieferant")
    pg.click("[data-qmaneu='lieferant']"); d = dialog(pg)
    feld(d, "titel").fill("Stahl AG"); feld(d, "t").select_option("1")
    speichern(pg, d)
    pruefe(pg.locator("#qma-lieferant .qma-ton--rot", has_text="C").count() == 1, "Lieferant mit einer 1 = C")

    # Audit mit Feststellungen → Abweichungen
    pg.click("[data-qmareiter='audit']"); pg.wait_for_selector("#qma-audit")
    pg.click("[data-qmaneu='audit']"); d = dialog(pg)
    feld(d, "titel").fill("Fertigung"); feld(d, "datum").fill("2026-11-01")
    feld(d, "feststellungen").fill("- Einrichtblatt nicht aktuell\n- Prüfmittel ohne Nummer")
    feld(d, "_status").select_option("durchgefuehrt")
    speichern(pg, d)
    pg.click("[data-qmaueber]"); d = dialog(pg); speichern(pg, d)
    n = pg.evaluate("TEST.daten.qma_eintraege.filter(e => e.art === 'abweichung' && e.daten.quelle === 'audit').length")
    pruefe(n == 2, "zwei Feststellungen als Abweichungen (%s)" % n)
    pruefe(pg.locator("[data-qmaueber]").count() == 0, "danach kein zweites Übertragen")

    # Auditplan (1.467.0): Raster, leeres Feld sieht ein Audit vor, Kärtchen öffnet es
    pruefe(pg.locator("#qma-auditplan").count() == 1, "Auditplan über der Liste")
    j = pg.evaluate("new Date().getFullYear()")
    zelle = f"[data-qmaap='Produktion|{j}-Q4']"
    pruefe(pg.locator(zelle).count() == 1, "Feld Produktion Q4 im Plan")
    pg.click(zelle); d = dialog(pg)
    pruefe(feld(d, "_status").input_value() == "vorgesehen", "neues Audit aus dem Plan ist vorgesehen")
    speichern(pg, d)
    a = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.art === 'audit' && e.daten.quartal)")
    pruefe(a and a["daten"].get("bereich") == "Produktion" and a["daten"].get("quartal") == f"{j}-Q4", "Bereich und Quartal gespeichert")
    pruefe(pg.locator(zelle + " [data-qmaapkarte]").count() == 1, "Kärtchen steht im Feld")
    pg.click(zelle + " [data-qmaapkarte]"); d = dialog(pg)
    pruefe(feld(d, "titel").input_value() == "Produktion", "Kärtchen öffnet das Audit")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.click("#qma-ap-spaeter"); pg.wait_for_timeout(300)
    pruefe(pg.locator(f"[data-qmaap='Produktion|{j}-Q4']").count() == 0 or pg.locator(f"[data-qmaap='Produktion|{j+4}-Q1']").count() == 1, "Später blättert weiter")
    pg.screenshot(path=BILD + "/qma-auditplan.png", full_page=True)
    pg.click("#qma-ap-heute"); pg.wait_for_timeout(300)

    # 1.468.0: Kärtchen mit Bericht öffnet den Bericht, ⓘ die Angaben
    pg.evaluate("""() => { const a = TEST.daten.qma_eintraege.find(e => e.art === 'audit' && e.daten.quartal);
      a.daten = { ...a.daten, bericht_url: 'https://x.invalid/bericht.pdf', bericht_name: 'beispiel.pdf' }; }""")
    pg.click("[data-qmareiter='handbuch']"); pg.wait_for_selector("#qma-abschnitte")
    pg.click("[data-qmareiter='audit']"); pg.wait_for_selector("#qma-auditplan")
    pruefe(pg.locator(zelle + " [data-qmaapbericht]").count() == 1, "Kärtchen mit Bericht")
    pg.locator(zelle).screenshot(path=BILD + "/qma-auditplan-bericht.png")
    pg.click(zelle + " [data-qmaapbericht]"); pg.wait_for_timeout(800)
    pruefe(pg.locator(".betrachter").count() == 1, "Tipp aufs Kärtchen öffnet den Bericht")
    pruefe(pg.locator(".dialog-huelle .dialog").count() == 0, "dabei kein Audit-Fenster")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe(pg.locator(".betrachter").count() == 0, "Escape schliesst den Bericht")
    pg.click(zelle + " [data-qmaapinfo]"); d = dialog(pg)
    pruefe(feld(d, "titel").input_value() == "Produktion", "ⓘ öffnet die Angaben zum Audit")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe(pg.locator("#qma-ap-berichte").count() == 1, "Knopf Berichte zuordnen")

    # Handbuch: Abschnitt bearbeiten
    pg.click("[data-qmareiter='handbuch']"); pg.wait_for_selector("#qma-abschnitte")
    pruefe(pg.locator("[data-qmaprozess='prozess:fertigung']").count() == 1, "Prozess in der Landkarte")
    pruefe(pg.locator("#qma-landkarte [data-qmapartei]").count() == 8, "Ebene 04 mit acht Parteien")
    pruefe("02.04" in pg.locator("[data-qmaprozess='prozess:fertigung']").inner_text(), "Prozess mit Nummer")
    pruefe("1" in pg.locator("#qma-landkarte [data-qmapartei='Kunden'] .qma-partei__zahl").inner_text(), "Kunden mit Zahl der Themen")
    pg.click("#qma-landkarte [data-qmapartei='Kunden']"); pg.wait_for_selector("#qma-risiko")
    pruefe(pg.locator("[data-qmapartei-filter='Kunden'].knopf--haupt").count() == 1, "Partei öffnet ihre Themen")
    pg.click("[data-qmapartei-filter='alle']")
    pg.click("[data-qmareiter='handbuch']"); pg.wait_for_selector("#qma-abschnitte")
    z = pg.locator("[data-qmamatrix='8.5.1'] .qma-zelle-punkt")
    pruefe(z.count() == 2 and "●" in z.nth(1).inner_text() and "●" not in z.nth(0).inner_text(), "Matrix: 8.5.1 bei Fertigung, nicht bei Strategie")
    pg.click("[data-qmaprozess='prozess:fertigung']"); pg.wait_for_selector("#qma-pa")
    pruefe(pg.locator("#qma-pa .qma-pa__schritt").count() == 4, "Prozess antippen zeigt vier Schritte")
    pruefe(pg.locator("#qma-pa-ein .qma-pa__chip").count() == 3, "Eingaben als drei Kärtchen")
    pruefe(pg.locator("#qma-pa .qma-pa__glied").count() == 8, "Aufzählungen als Kette")
    pg.wait_for_timeout(900); pg.screenshot(path=BILD + "/qma-prozessgrafik.png")
    pg.click("#qma-pa-weiter"); pg.wait_for_timeout(300)
    pruefe(pg.locator("#qma-pa[data-qmapa='prozess:strategie']").count() == 1, "Weiter blättert zum nächsten Prozess")
    pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(300)
    pruefe(pg.locator("#qma-pa[data-qmapa='prozess:fertigung']").count() == 1, "Pfeiltaste blättert zurück")
    pg.click("#qma-pa-bearbeiten"); d = dialog(pg)
    pruefe(feld(d, "nr").input_value() == "02.04", "Prozessblatt mit Nr.")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.click("[data-qmaabschnitt='geltungsbereich']"); d = dialog(pg)
    feld(d, "inhalt").fill("Ganzer Betrieb. 8.3 nicht anwendbar.")
    speichern(pg, d)
    pruefe("Ganzer Betrieb" in pg.locator("[data-qmaabschnitt='geltungsbereich']").inner_text(), "Abschnitt gespeichert")
    pg.screenshot(path=BILD + "/qma-handbuch.png", full_page=True)
    pg.click("[data-qmateil='audit']"); pg.wait_for_selector("#qma-audit")
    pruefe(True, "Ebene 03 führt zum Reiter Audits")
    pg.click("[data-qmareiter='handbuch']"); pg.wait_for_selector("#qma-abschnitte")

    # Kompetenz: Person und Fähigkeit, Zelle antippen
    pg.click("[data-qmareiter='kompetenz']"); pg.wait_for_selector("#qma-matrix")
    pg.click("#qma-neu-person"); d = dialog(pg); feld(d, "name").fill("SH"); speichern(pg, d)
    pg.click("#qma-neu-faehigkeit"); d = dialog(pg); feld(d, "name").fill("Star einrichten"); speichern(pg, d)
    z = pg.locator("[data-qmazelle]").first
    z.click(); pg.wait_for_timeout(600); pg.locator("[data-qmazelle]").first.click(); pg.wait_for_timeout(600)
    pruefe("qma-stufe--2" in pg.locator("[data-qmazelle]").first.get_attribute("class"), "zweimal antippen = selbständig")
    pruefe(pg.locator("#qma-schulung").count() == 1, "Schulungen unter der Matrix")

    # Managementbewertung
    pg.click("[data-qmareiter='bewertung']"); pg.wait_for_selector("#qma-bewertung")
    pg.click("#qma-neu-bewertung"); d = dialog(pg); feld(d, "jahr").fill("2026"); speichern(pg, d)
    pg.wait_for_selector("[data-qmabewblatt='2026']")
    pruefe("Abweichungen" in pg.locator("#qma-bew-zahlen").inner_text(), "Zahlen kommen von selbst")
    t = pg.locator("[data-qmabewfeld='fazit'] textarea"); t.fill("Wirksam."); pg.locator("[data-qmabewfeld='kunden'] textarea").click(); pg.wait_for_timeout(800)
    pruefe(pg.evaluate("TEST.daten.qma_eintraege.find(e => e.art === 'bewertung').daten.fazit") == "Wirksam.", "Fazit gespeichert")
    pg.click("#qma-bew-freigeben"); d = dialog(pg); speichern(pg, d)
    b = pg.evaluate("TEST.daten.qma_eintraege.find(e => e.art === 'bewertung')")
    pruefe(b["status"] == "freigegeben" and b["daten"].get("schnapp"), "freigegeben mit eingefrorenen Zahlen")
    pruefe(pg.locator("[data-qmabewfeld='fazit'] textarea").get_attribute("readonly") is not None, "freigegeben nur zum Lesen")
    pg.screenshot(path=BILD + "/qma-bewertung.png", full_page=True)

    laden(pg, VERMERK + "(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = 'extern';\n")
    pruefe(pg.locator("[data-nav='qmalt']").count() == 0, "Externe sehen QM alternativ nicht")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
