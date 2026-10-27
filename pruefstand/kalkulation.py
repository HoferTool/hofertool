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

    pg.locator("[data-kalk-reiter='ags']").click(); pg.wait_for_selector("#kalk-ags")
    agt = pg.locator("[data-ag='1']").inner_text()
    pruefe("2.07" in agt, "Drehen komplett 2.07 je Stk: %s" % agt.replace("\n", " ")[:160])
    pg.screenshot(path=BILD + "/kalk-ags.png", full_page=True)

    # Neue Staffel: eigene Lose
    pg.locator("[data-kalk-reiter='material']").click(); pg.click("#kalk-staffel-neu")
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
    pruefe(all(a["masch"] for a in neu["daten"]["ags"] if a["bez"] in ("Erstteilprüfung", "Endkontrolle", "Versand/Einlagern")), "Kontrolle und Spedition zugeordnet")
    if pg.locator("#kalk-zurueck").count(): pg.click("#kalk-zurueck")
    pg.wait_for_selector("#kalk-saetze")
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
