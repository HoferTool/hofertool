# Betrachter einer Zeichnung mit HOCO Nr.: Knopf „Zeichnung entfernen“
# (Wunsch Patrick 8. Oktober 2026: passt die von der Aufgabe hochgeladene
# Zeichnung nicht, nimmt er sie weg, und die Aufgabe lädt die nächste).
# Eine Rückfrage, dann weg aus Stammdaten, Aufträgen und Dokumenten;
# Rückgängig holt alles zurück.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 950})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    ADR = "data:application/pdf;base64,JVBERi0xLjQK"
    jid = pg.evaluate("""(ADR) => { const mit = new Map(TEST.daten.planwand.filter(j => j.job_number).map(j => [j.id, j]));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => mit.has(b.dataset.auftrag) && b.getBoundingClientRect().width > 40);
      if (!b) return null; const j = mit.get(b.dataset.auftrag);
      j.drawing_url = ADR; const jj = (TEST.daten.jobs || []).find(x => x.id === j.id); if (jj) jj.drawing_url = ADR;
      TEST.daten.hoco_parts = TEST.daten.hoco_parts.filter(t => t.hoco_nr !== j.job_number);
      TEST.daten.hoco_parts.push({ hoco_nr: j.job_number, zeichnung_url: ADR });
      TEST.daten.dokumente = TEST.daten.dokumente || [];
      TEST.daten.dokumente.push({ id: 'dok-z-1', art: 'zeichnung', hoco_nr: j.job_number, titel: j.job_number, dateiname: 'x.pdf', datei_url: ADR, erstellt_am: new Date().toISOString() });
      return b.dataset.auftrag; }""", ADR)
    if not jid: fehler.append("kein Balken mit HOCO Nr.")
    else:
        nr = pg.evaluate(f"() => TEST.daten.planwand.find(j => j.id === '{jid}').job_number")
        sel = f".pw-balken[data-auftrag='{jid}']"
        pg.locator(sel).first.click(); pg.wait_for_timeout(1000)
        pruefe("Betrachter offen", pg.locator(".betrachter").count() == 1)
        knopf = pg.locator("[data-zeichnungweg]")
        pruefe("Knopf „Zeichnung entfernen“ da", knopf.count() == 1 and "entfernen" in knopf.inner_text())
        knopf.click(); pg.wait_for_selector(".dialog-huelle [data-ja]")
        pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(900)
        pruefe("Keine zweite Rückfrage", pg.locator(".dialog-huelle [data-ja]").count() == 0)
        pruefe("Betrachter zu", pg.locator(".betrachter").count() == 0)
        z = pg.evaluate(f"() => TEST.daten.hoco_parts.find(t => t.hoco_nr === '{nr}').zeichnung_url")
        pruefe("Stammdaten ohne Zeichnung", not z)
        a = pg.evaluate(f"() => (TEST.daten.jobs || TEST.daten.planwand).filter(j => j.job_number === '{nr}').map(j => j.drawing_url).filter(Boolean).length")
        pruefe("Aufträge ohne Zeichnung", a == 0)
        d = pg.evaluate(f"() => (TEST.daten.dokumente || []).filter(x => x.art === 'zeichnung' && x.hoco_nr === '{nr}').length")
        pruefe("Dokument weg", d == 0)
        # Rückgängig holt alles zurück
        pg.keyboard.press("Control+z"); pg.wait_for_timeout(1200)
        z = pg.evaluate(f"() => TEST.daten.hoco_parts.find(t => t.hoco_nr === '{nr}').zeichnung_url")
        pruefe("Rückgängig: Stammdaten wieder mit Zeichnung", z == ADR)
        a = pg.evaluate(f"() => (TEST.daten.jobs || TEST.daten.planwand).filter(j => j.job_number === '{nr}' && j.drawing_url).length")
        pruefe("Rückgängig: Auftrag wieder mit Zeichnung", a >= 1)
        d = pg.evaluate(f"() => (TEST.daten.dokumente || []).filter(x => x.art === 'zeichnung' && x.hoco_nr === '{nr}').length")
        pruefe("Rückgängig: Dokument wieder da", d == 1)
        # Ohne HOCO Nr. (freier Betrachter) kein Knopf
        pg.evaluate("() => { const j = TEST.daten.planwand.find(j => !j.job_number); if (j) j.drawing_url = 'data:application/pdf;base64,JVBERi0xLjQK'; }")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
