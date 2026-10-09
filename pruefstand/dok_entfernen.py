# WBG und Einrichtblatt lassen sich im Betrachter entfernen wie die
# Zeichnung (Wunsch Patrick 9. Oktober 2026: „kann jeder löschen; wenn man
# löscht, versucht die Aufgabe eine andere Datei; falls keine, steht dort
# nicht vorhanden“). Eine Rückfrage, dann weg aus Auftrag bzw.
# hoco_type_data und Dokumenten; Rückgängig holt es zurück. Ohne Datei
# steht im Fenster „Kein Einrichtblatt vorhanden“ statt einer Meldung.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
ADR = "data:application/pdf;base64,JVBERi0xLjQK"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    # 10000-0301 hat den Auftrag jfa1 mit WBG; dazu ein eigenes Einrichtblatt auf Typ t1
    pg.evaluate("""(ADR) => {
      TEST.daten.hoco_type_data.push({ hoco_nr: '10000-0301', type_id: 't1', blatt_url: ADR, stueckzeit_s: 12 });
      TEST.daten.dokumente = TEST.daten.dokumente || [];
      TEST.daten.dokumente.push({ id: 'dok-eb-1', art: 'einrichtblatt', hoco_nr: '10000-0301', type_id: 't1', titel: '10000-0301', dateiname: 'eb.xlsx', datei_url: ADR, erstellt_am: new Date().toISOString() });
      TEST.daten.dokumente.push({ id: 'dok-wbg-1', art: 'wbg', hoco_nr: '10000-0301', titel: '2026-9999', dateiname: 'w.pdf', datei_url: ADR, erstellt_am: new Date().toISOString() });
    }""", ADR)
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pruefe("Teil offen", "10000-0301" in pg.inner_text("#hoco-fensterinhalt"))

    # ---- Einrichtblatt ----
    k = pg.locator("[data-blatt-typ='t1']")
    pruefe("Einrichtblatt ansehen da", k.count() == 1)
    k.click(); pg.wait_for_selector(".betrachter"); pg.wait_for_timeout(600)
    knopf = pg.locator("[data-dokweg='einrichtblatt']")
    pruefe("Knopf „Einrichtblatt entfernen“", knopf.count() == 1 and "Einrichtblatt entfernen" in knopf.inner_text())
    knopf.click(); pg.wait_for_selector(".dialog-huelle [data-ja]")
    frage = pg.locator(".dialog-huelle").last.inner_text()
    pruefe("Rückfrage nennt die nächste Datei", "andere Excel-Datei" in frage)
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(900)
    pruefe("Keine zweite Rückfrage", pg.locator(".dialog-huelle [data-ja]").count() == 0)
    pruefe("Betrachter zu", pg.locator(".betrachter").count() == 0)
    b = pg.evaluate("() => TEST.daten.hoco_type_data.find(x => x.hoco_nr === '10000-0301' && x.type_id === 't1').blatt_url")
    pruefe("Blatt weg, Zeile bleibt", b is None)
    d = pg.evaluate("() => TEST.daten.dokumente.filter(x => x.art === 'einrichtblatt' && x.hoco_nr === '10000-0301').length")
    pruefe("Dokument weg", d == 0)
    # Das HOCO-Fenster ist offen, Strg + Z gilt dort nicht: der Knopf oben
    pg.evaluate("() => document.getElementById('rueck-knopf').click()"); pg.wait_for_timeout(1200)
    b = pg.evaluate("() => TEST.daten.hoco_type_data.find(x => x.hoco_nr === '10000-0301' && x.type_id === 't1').blatt_url")
    d = pg.evaluate("() => TEST.daten.dokumente.filter(x => x.art === 'einrichtblatt' && x.hoco_nr === '10000-0301').length")
    pruefe("Rückgängig: Blatt und Dokument wieder da", b == ADR and d == 1)
    # Ohne Blatt: „Kein Einrichtblatt vorhanden“ im Fenster
    pg.evaluate("() => { TEST.daten.hoco_type_data.find(x => x.hoco_nr === '10000-0301' && x.type_id === 't1').blatt_url = null; }")
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_timeout(800)
    pruefe("Kein Einrichtblatt vorhanden", pg.locator("[data-abruf='keines']").count() == 1 and "Kein Einrichtblatt vorhanden" in pg.inner_text(".betrachter"))
    pruefe("Kein Entfernen-Knopf ohne Datei", pg.locator("[data-dokweg]").count() == 0)
    pg.locator(".betrachter [data-zu]").click(); pg.wait_for_timeout(400)

    # ---- WBG ----
    w = pg.locator("tr:has-text('2026-9999') button[data-fadatei]").filter(has_text="WBG")
    pruefe("WBG-Knopf da", w.count() == 1 and w.get_attribute("data-fadatei") == ADR)
    w.click(); pg.wait_for_selector(".betrachter"); pg.wait_for_timeout(600)
    knopf = pg.locator("[data-dokweg='wbg']")
    pruefe("Knopf „WBG entfernen“", knopf.count() == 1 and "WBG entfernen" in knopf.inner_text())
    knopf.click(); pg.wait_for_selector(".dialog-huelle [data-ja]")
    frage = pg.locator(".dialog-huelle").last.inner_text()
    pruefe("Rückfrage nennt FA und Pool", "2026-9999" in frage and "Pool" in frage)
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(900)
    pruefe("Betrachter zu", pg.locator(".betrachter").count() == 0)
    j = pg.evaluate("() => { const j = TEST.daten.jobs.find(x => x.id === 'jfa1'); return [j.wbg_url, j.fa_nr]; }")
    pruefe("WBG weg, FA Nr. bleibt", j[0] is None and j[1] == "2026-9999")
    d = pg.evaluate("() => TEST.daten.dokumente.filter(x => x.id === 'dok-wbg-1').length")
    pruefe("WBG-Dokument weg", d == 0)
    # Das HOCO-Fenster ist offen, Strg + Z gilt dort nicht: der Knopf oben
    pg.evaluate("() => document.getElementById('rueck-knopf').click()"); pg.wait_for_timeout(1200)
    j = pg.evaluate("() => TEST.daten.jobs.find(x => x.id === 'jfa1').wbg_url")
    d = pg.evaluate("() => TEST.daten.dokumente.filter(x => x.id === 'dok-wbg-1').length")
    pruefe("Rückgängig: WBG und Dokument wieder da", j == ADR and d == 1)

    pg.screenshot(path="dok_entfernen.png")

    # ---- Nicht-Admin (Langdreher): Einrichtblatt ja, Zeichnung und WBG nein ----
    pg2 = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg2.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg2.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
            "daten.profiles[0].role = 'langdreher';\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg2.route(u, lambda r: r.abort())
    pg2.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg2.wait_for_selector(".pw-tafel"); pg2.wait_for_timeout(1200)
    pg2.evaluate("""(ADR) => {
      TEST.daten.hoco_type_data.push({ hoco_nr: '10000-0301', type_id: 't1', blatt_url: ADR, stueckzeit_s: 12 });
      const t = TEST.daten.hoco_parts.find(x => x.hoco_nr === '10000-0301'); if (t) t.zeichnung_url = ADR;
    }""", ADR)
    pg2.locator("#pw-hoco").click(); pg2.wait_for_timeout(1000)
    pg2.locator("[data-bereich='10000']").click(); pg2.wait_for_timeout(600)
    pg2.locator("[data-kunde='10000']").click(); pg2.wait_for_timeout(600)
    pg2.locator("[data-hoco-auf='10000-0301']").click(); pg2.wait_for_timeout(1200)
    pg2.locator("[data-blatt-typ='t1']").click(); pg2.wait_for_selector(".betrachter"); pg2.wait_for_timeout(600)
    pruefe("Langdreher: Einrichtblatt entfernen da", pg2.locator("[data-dokweg='einrichtblatt']").count() == 1)
    pg2.locator(".betrachter [data-zu]").click(); pg2.wait_for_timeout(400)
    w = pg2.locator("tr:has-text('2026-9999') button[data-fadatei]").filter(has_text="WBG")
    w.click(); pg2.wait_for_selector(".betrachter"); pg2.wait_for_timeout(600)
    pruefe("Langdreher: kein WBG entfernen", pg2.locator("[data-dokweg]").count() == 0)
    pg2.locator(".betrachter [data-zu]").click(); pg2.wait_for_timeout(400)
    z = pg2.locator("[data-zeichnung='" + ADR + "']")
    pruefe("Langdreher: Zeichnung ansehen da", z.count() == 1)
    z.click(); pg2.wait_for_selector(".betrachter"); pg2.wait_for_timeout(600)
    pruefe("Langdreher: kein Zeichnung entfernen", pg2.locator("[data-dokweg]").count() == 0)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
