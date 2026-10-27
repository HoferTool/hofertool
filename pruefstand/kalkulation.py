# Kalkulation (1.214.0, Wunsch Patrick 27. Oktober 2026): wie im Gewatec,
# beliebig viele Staffeln, nur mit dem Vermerk kalkulationSehen. Das
# Beispiel 20225174 muss dieselben Zahlen wie das Gewatec ergeben.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("KALK_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pruefe(pg.locator("[data-nav='kalkulation']").count() == 0, "ohne Vermerk keine Kalkulation, auch für Admins")

    pg.unroute("**/cdn.jsdelivr.net/**")
    MIT = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { kalkulationSehen: true };\nTEST.daten.kalkulationen = []; TEST.daten.kalk_maschinen = [];\n"
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pruefe(pg.locator("[data-nav='kalkulation']").count() > 0, "Kalkulation im Menü mit Vermerk")
    pg.evaluate("location.hash='#/kalkulation'"); pg.wait_for_selector("#kalk-beispiel")
    pg.click("#kalk-beispiel"); pg.wait_for_selector("#kalk-band .kalk-band__staffel"); pg.wait_for_timeout(600)
    band = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(band == ["3.80", "3.92"], "Angebotspreise 8'000 und 2'500 Stk: %s" % band)
    pg.locator("[data-kalk-reiter='ergebnis']").click(); pg.wait_for_selector("#kalk-protokoll")
    t = pg.locator("#kalk-protokoll").inner_text()
    for wert, was in [("2.9185", "Herstellkosten"), ("0.5089", "Material"), ("2.1096", "intern"), ("0.8815", "DB je Stk"),
                      ("23.2", "DB %"), ("30'400.00", "Umsatz"), ("1.0816", "Grenzkosten"), ("905.76", "Rüsten"), ("422.2", "Laufzeit")]:
        pruefe(wert in t, "Ergebnis wie Gewatec: %s %s" % (was, wert))
    pg.screenshot(path=BILD + "/kalk-ergebnis.png", full_page=True)

    # Preisermittlung: Verzinsung, Angebotspreis von Hand, Marge VK
    pg.locator("[data-kalk-reiter='preis']").click(); pg.wait_for_selector("#kalk-preistab")
    t = pg.locator("#kalk-preistab").inner_text()
    pruefe("3.80" in t, "Preistabelle zeigt 3.80: %s" % t.replace("\n", " ")[:200])
    pg.fill("#kalk-ps0-zinsPct", "6"); pg.fill("#kalk-ps0-zinsMonate", "12"); pg.wait_for_timeout(300)
    t = pg.locator("#kalk-preistab").inner_text()
    pruefe("3.0936" in t, "Selbstkosten verzinst 2.9185 × 1.06 = 3.0936")
    pruefe(pg.input_value("#kalk-ps1-zinsPct") == "6", "erste Staffel füllt die zweite aus")
    pruefe(pg.input_value("#kalk-ps0-gewinn") == "30" and pg.input_value("#kalk-ps1-transport") == "0.0025", "Werte von oben in die Staffeln übernommen")
    pg.set_viewport_size({"width": 1440, "height": 900}); pg.wait_for_timeout(300)
    hoch = pg.evaluate("document.scrollingElement.scrollHeight")
    pg.screenshot(path=BILD + "/kalk-preis-ganz.png")
    pruefe(hoch <= 900, "Reiter Preis ohne Rollen bei 1440 × 900: %s" % hoch)
    pg.fill("#kalk-angebot-0", "4.10"); pg.wait_for_timeout(300)
    band = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(band[0] == "4.10", "Angebotspreis von Hand gilt: %s" % band)
    pg.fill("#kalk-ps0-zinsPct", ""); pg.fill("#kalk-ps0-zinsMonate", ""); pg.fill("#kalk-angebot-0", ""); pg.wait_for_timeout(300)
    band = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(band == ["3.80", "3.92"], "leer wieder wie Gewatec: %s" % band)
    # Enter springt ins nächste Feld, in der Tabelle nach rechts
    pg.focus("#kalk-ps0-gewinn"); pg.keyboard.press("Enter")
    pruefe(pg.evaluate("document.activeElement.id") == "kalk-ps1-gewinn", "Enter geht zur nächsten Staffel: %s" % pg.evaluate("document.activeElement.id"))
    # Kosten je Staffel: Gewinn nur für Staffel 2
    pg.fill("#kalk-ps1-gewinn", "20"); pg.wait_for_timeout(300)
    band = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(band[0] == "3.80" and band[1] != "3.92", "Gewinn je Staffel: %s" % band)
    pg.screenshot(path=BILD + "/kalk-preis.png", full_page=True)
    pg.fill("#kalk-ps1-gewinn", "30"); pg.wait_for_timeout(300)
    band = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(band == ["3.80", "3.92"], "Gewinn je Staffel leer wie vorher: %s" % band)
    # Währung EUR mit Kurs aus dem Netz (hier nachgebildet)
    pg.route("**/api.frankfurter.dev/**", lambda r: r.fulfill(status=200, content_type="application/json",
        headers={"Access-Control-Allow-Origin": "*"}, body='{"amount":1,"base":"CHF","date":"2026-10-27","rates":{"EUR":1.07}}'))
    pg.select_option("#kalk-waehrung", "EUR"); pg.wait_for_timeout(800)
    band = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(band[0] == "4.06 EUR", "Angebot in EUR mit Kurs 1.07: %s" % band)
    pruefe(pg.input_value("#kalk-kurs") == "1.07", "Kurs eingetragen")
    pg.screenshot(path=BILD + "/kalk-preis.png", full_page=True)
    with pg.expect_download() as dl:
        pg.locator("[data-kalk-reiter='angebot']").click(); pg.click("#kalk-pdf")
    pruefe("4.06 EUR" in pg.locator("#kalk-vorschau").inner_text(), "Vorschau in EUR")
    pg.locator("[data-kalk-reiter='preis']").click(); pg.select_option("#kalk-waehrung", "CHF"); pg.wait_for_timeout(300)
    band = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(band == ["3.80", "3.92"], "zurück auf CHF: %s" % band)

    pg.locator("[data-kalk-reiter='ags']").click(); pg.wait_for_selector("#kalk-ags")
    agt = pg.locator("[data-ag='1']").inner_text()
    pruefe("2.07" in agt, "Drehen komplett 2.07 je Stk: %s" % agt.replace("\n", " ")[:160])
    pg.click("[data-ag-auf='4']")
    ext = pg.locator("[data-ag='4']").inner_text()
    pruefe("0.3000" in ext and "547.20" in ext, "Polieren extern: %s" % ext.replace("\n", " ")[-120:])
    pg.fill("#kalk-ag-ruestp-4", "800"); pg.wait_for_timeout(300)
    b2 = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(b2[0] != "3.80", "Rüstkosten pauschal verrechnet: %s" % b2)
    pg.uncheck("#kalk-ag-ruestv-4"); pg.wait_for_timeout(300)
    b2 = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(b2[0] == "3.80", "ohne Verrechnen nicht im Preis: %s" % b2)
    pg.check("#kalk-ag-ruestv-4"); pg.fill("#kalk-ag-ruestp-4", ""); pg.wait_for_timeout(300)
    # Fertigungslose je Staffel über den Arbeitsgängen und in der Tabelle je Staffel
    lose = pg.locator("#kalk-lose").inner_text()
    pruefe("2 Lose" in lose and "1 Los" in lose, "Fertigungslose je Staffel: %s" % lose)
    pruefe("Fertigungslose" in pg.locator("[data-ag='4']").inner_text(), "Fertigungslose beim externen AG")
    # Externer Kostensatz je Staffel
    pg.fill("#kalk-ag-s1-extern-4", "0.44"); pg.wait_for_timeout(300)
    b4 = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(b4[0] == "3.80" and b4[1] != "3.92", "externer Satz je Staffel: %s" % b4)
    pruefe("0.4400" in pg.locator("[data-ag='4']").inner_text(), "Einzelkosten 0.44 bei Staffel 2")
    pg.fill("#kalk-ag-s1-extern-4", ""); pg.wait_for_timeout(300)
    # Multimaschinell: Staffel 2 mit halber Stückzeit, Staffel 1 bleibt
    pg.click("[data-ag-auf='1']"); pg.check("#kalk-ag-multi-1")
    pg.fill("#kalk-ag-s1-te-1", "95"); pg.wait_for_timeout(300)
    b3 = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(b3[0] == "3.80" and b3[1] != "3.92", "je Staffel eigene Stückzeit: %s" % b3)
    pg.screenshot(path=BILD + "/kalk-ags.png", full_page=True)
    pg.fill("#kalk-ag-s1-te-1", ""); pg.uncheck("#kalk-ag-multi-1"); pg.wait_for_timeout(300)
    b3 = pg.locator("#kalk-band .kalk-band__staffel b").all_inner_texts()
    pruefe(b3 == ["3.80", "3.92"], "ohne Multimaschinell wie vorher: %s" % b3)

    # Neue Staffel: eigene Lose
    pg.locator("[data-kalk-reiter='material']").click()
    pg.set_viewport_size({"width": 1440, "height": 900}); pg.wait_for_timeout(300)
    pg.screenshot(path=BILD + "/kalk-staffeln.png")
    hoch = pg.evaluate("document.scrollingElement.scrollHeight")
    pruefe(hoch <= 900, "Reiter Staffeln und Material ohne Rollen: %s" % hoch)
    pg.click("#kalk-staffel-neu")
    pruefe(pg.locator("#kalk-spez").input_value() == "Stahl", "Spez. Gewicht 7.85 = Stahl")
    pg.fill("#kalk-menge-2", "20000"); pg.fill("#kalk-lose-2", "4"); pg.wait_for_timeout(1800)
    band = pg.locator("#kalk-band .kalk-band__staffel").count()
    pruefe(band == 3, "dritte Staffel im Band: %d" % band)
    gesp = pg.evaluate("() => TEST.daten.kalkulationen[0].daten.staffeln")
    pruefe(len(gesp) == 3 and gesp[2]["lose"] == "4", "von selbst gespeichert mit eigenen Losen: %s" % gesp)

    with pg.expect_download() as dl:
        pg.locator("[data-kalk-reiter='angebot']").click(); pg.click("#kalk-pdf")
    pruefe(dl.value.suggested_filename == "Angebot 20225174.pdf", "Angebot als PDF: %s" % dl.value.suggested_filename)
    pg.screenshot(path=BILD + "/kalk-angebot.png", full_page=True)

    # Escape: zurück zur Liste
    pg.evaluate("document.activeElement && document.activeElement.blur()"); pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe(pg.locator(".kalk-liste").count() > 0, "Escape zurück zur Liste")
    # Neue Kalkulation startet mit dem Dummy-Arbeitsplan
    pg.click("#kalk-neu"); pg.wait_for_timeout(1200)
    neu = pg.evaluate("() => TEST.daten.kalkulationen.find(k => k.nr !== '20225174')")
    bez = [a["bez"] for a in neu["daten"]["ags"]] if neu else []
    pruefe(len(bez) == 8 and bez[0] == "Material bereitstellen" and bez[-1] == "Versand/Einlagern", "Start-Arbeitsplan: %s" % bez)
    pruefe(neu["daten"]["ags"][3]["fgk"] == "56", "Drehen komplett mit 56 % FGK")
    pruefe(all(a["masch"] for a in neu["daten"]["ags"] if a["bez"] in ("Erstteilprüfung", "Endkontrolle", "Versand/Einlagern")), "Kontrolle und Spedition zugeordnet")
    if pg.locator("#kalk-zurueck").count(): pg.click("#kalk-zurueck")
    pg.wait_for_selector("#kalk-saetze")
    # Suche in der Liste
    pg.fill("#kalk-suche", "genge 10789"); pg.wait_for_timeout(200)
    pruefe(pg.locator(".kalk-liste__zeile").count() == 1, "Suche findet Genge 10789")
    pg.fill("#kalk-suche", "gibtsnicht"); pg.wait_for_timeout(200)
    pruefe(pg.locator("#kalk-nichts").count() == 1, "Suche ohne Treffer")
    pg.fill("#kalk-suche", ""); pg.wait_for_timeout(200)
    pruefe(pg.locator(".kalk-liste__zeile").count() == 2, "ohne Suche alle zwei")
    pg.click("#kalk-saetze"); pg.wait_for_selector(".kalk-masch"); pg.click(".kalk-masch__kopf >> nth=0"); pg.wait_for_timeout(300)
    t = pg.locator(".kalk-masch >> nth=0").inner_text()
    pruefe("23.72" in t and "18.60" in t and "5.12" in t, "Stundensatz SW-20 23.72 = 18.60 + 5.12")
    lauf = pg.locator("[id^='kalk-mlauf-']").inner_text()
    pruefe("18.60" in lauf and "16.53" in lauf and "21.65" in lauf, "Laufzeiten-Tabelle: %s" % lauf.replace("\n", " ")[:120])
    pg.screenshot(path=BILD + "/kalk-saetze.png", full_page=True)

    pg.set_viewport_size({"width": 390, "height": 844})
    pg.click("#kalk-zurueck"); pg.click(".kalk-liste__zeile >> nth=0"); pg.wait_for_selector("#kalk-band")
    breite = pg.evaluate("() => document.documentElement.scrollWidth")
    pruefe(breite <= 391, "Handy ohne seitliches Rollen: %d" % breite)
    pg.screenshot(path=BILD + "/kalk-handy.png", full_page=True)
    pruefe(not pf, "keine Skriptfehler: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
