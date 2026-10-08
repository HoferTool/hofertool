# Dokumente auf Abruf (111.98.0): WBG und Zeichnung öffnen lässt den
# Pool-Rechner im Ordner nachschauen. Vorhandenes sofort, Neueres wechselt
# die Anzeige, ohne Datei „Keine … vorhanden“. Der Rechner wird hier mit
# TEST.pc nachgespielt: er erledigt offene Anfragen in dok_abruf.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.dok_abruf = [];
// Der Rechner lauscht: antwort(zeile) gibt { ergebnis, adresse, meldung } zurück
TEST.pc = (antwort, ms) => {
  clearInterval(TEST.pcUhr);
  TEST.pcUhr = setInterval(() => {
    const s = daten.app_config.find((x) => x.schluessel === 'dok_abruf_status');
    const w = JSON.stringify({ gesehen: new Date().toISOString(), rechner: 'POOL1' });
    if (s) s.wert = w; else daten.app_config.push({ schluessel: 'dok_abruf_status', wert: w });
    daten.dok_abruf.filter((z) => !z.erledigt).forEach((z) => {
      z.angefangen = z.angefangen || new Date().toISOString();
      if (Date.now() - new Date(z.angefangen).getTime() < (ms || 800)) return;
      Object.assign(z, antwort(z), { erledigt: new Date().toISOString() });
    });
  }, 200);
};
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", "if (typeof window !== \"undefined\") window.TEST = TEST;\n" + K)
PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1180, "height": 830}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    pg.route("**://ablage.test/**", lambda r: r.fulfill(status=200, content_type="application/pdf", body=PDF))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)

    # Eine Maschine im Pad öffnen, deren Auftrag weder WBG noch Zeichnung hat
    pg.evaluate("""() => { const j = TEST.daten.jobs.find((x) => x.id === 'j1');
      j.drawing_url = null; j.wbg_url = null; j.plan_status = 'laeuft';
      TEST.daten.jobs.filter((x) => x.machine_id === j.machine_id && x.id !== 'j1').forEach((x) => { x.plan_status = 'geplant'; });
      (TEST.daten.hoco_parts || []).forEach((t) => { if (t.hoco_nr === j.job_number) t.zeichnung_url = null; }); }""")
    hoco = pg.evaluate("TEST.daten.jobs.find((x) => x.id === 'j1').job_number")
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    pg.locator("#pad .pad-kachel--maschine").first.click(); pg.wait_for_timeout(2000)
    print("Pad:", pg.inner_text("#pad")[:120].replace("\n", " | "))

    # 1. Rechner lauscht nicht: sofort „Keine WBG vorhanden“, keine Anfrage
    pg.click("[data-padreiter='wbg']"); pg.wait_for_timeout(1500)
    t = pg.inner_text(".betrachter")
    pruefe("Ohne Rechner: keine WBG, sofort", "Keine WBG vorhanden" in t and "antwortet gerade nicht" in t)
    pruefe("Ohne Rechner: keine Anfrage", pg.evaluate("TEST.daten.dok_abruf.length") == 0)
    pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(400)

    # 2. Rechner lauscht und findet eine WBG: erst „Schaue nach“, dann die Datei
    pg.evaluate("TEST.pc((z) => z.art === 'wbg' ? { ergebnis: 'neu', adresse: 'https://ablage.test/wbg-neu.pdf' } : { ergebnis: 'keines', adresse: null }, 1500)")
    pg.wait_for_timeout(25000)   # das gemerkte „lauscht nicht“ gilt 20 Sekunden
    pg.click("[data-padreiter='wbg']"); pg.wait_for_timeout(700)
    pruefe("Mit Rechner: schaut nach", pg.locator("[data-abruf='suche']").count() == 1 and "Schaue im Ordner nach der WBG" in pg.inner_text(".betrachter"))
    z = pg.evaluate("TEST.daten.dok_abruf[0]")
    print("Anfrage:", z)
    pruefe("Anfrage mit Auftrag und HOCO Nr.", z and z["art"] == "wbg" and z["auftrag_id"] == "j1" and z["hoco_nr"] == hoco)
    pg.wait_for_timeout(2500)
    pruefe("WBG erscheint", pg.locator(".betrachter .pdfansicht, .betrachter canvas, .betrachter iframe").count() > 0
           and pg.locator("[data-abruf]").count() == 0 and "WBG " + hoco in pg.inner_text(".betrachter__titel"))
    pg.screenshot(path="dok_abruf_wbg.png")
    pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(800)
    pruefe("Knopf WBG nicht mehr grau", "pad-knopf--leer" not in pg.get_attribute("[data-padreiter='wbg']", "class"))

    # 3. Zeichnung: nichts im Ordner → „Keine Zeichnung vorhanden“
    pg.click("[data-padreiter='zeichnung']"); pg.wait_for_timeout(700)
    pruefe("Zeichnung: schaut nach", "Schaue im Ordner nach der Zeichnung" in pg.inner_text(".betrachter"))
    pg.wait_for_timeout(2500)
    pruefe("Keine Zeichnung vorhanden", "Keine Zeichnung vorhanden" in pg.inner_text(".betrachter"))
    pg.screenshot(path="dok_abruf_keine.png")
    pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(400)

    # 4. WBG schon da: sofort zu sehen, Hinweis im Kopf; eine neuere ersetzt sie
    pg.evaluate("TEST.pc((z) => ({ ergebnis: 'neu', adresse: 'https://ablage.test/wbg-neuer.pdf' }), 1500)")
    pg.wait_for_timeout(31000)   # gleiche Anfrage innert 30 Sekunden geht nicht nochmals hinaus
    n = pg.evaluate("TEST.daten.dok_abruf.length")
    pg.click("[data-padreiter='wbg']"); pg.wait_for_timeout(600)
    pruefe("Vorhandene WBG sofort", pg.locator("[data-abruf]").count() == 0 and "Schaue im Ordner nach Neuerem" in pg.inner_text(".betrachter__kopf"))
    pg.screenshot(path="dok_abruf_neuerem.png")
    pg.wait_for_timeout(2500)
    pruefe("Neuere WBG ersetzt die Anzeige", "Neuere WBG aus dem Ordner" in pg.inner_text(".betrachter__kopf")
           and pg.get_attribute(".betrachter__knoepfe a", "href") == "https://ablage.test/wbg-neuer.pdf")
    pruefe("Eine neue Anfrage", pg.evaluate("TEST.daten.dok_abruf.length") == n + 1)
    pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(400)
    # Gleich nochmals öffnen: keine weitere Anfrage
    pg.click("[data-padreiter='wbg']"); pg.wait_for_timeout(2500)
    pruefe("Zweimal kurz nacheinander nur eine Anfrage", pg.evaluate("TEST.daten.dok_abruf.length") == n + 1)
    pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(400)
    pg.evaluate("document.querySelector('[data-padzu]').click()"); pg.wait_for_timeout(800)

    # 5. Planwand: Klick auf einen Balken ohne Zeichnung schaut nach
    pg.evaluate("TEST.pc((z) => ({ ergebnis: 'neu', adresse: 'https://ablage.test/zng-' + z.hoco_nr + '.pdf' }), 500)")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand"); pg.wait_for_timeout(2500)
    jid = pg.evaluate("""() => { const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find((el) => {
      const j = TEST.daten.jobs.find((x) => x.id === el.dataset.auftrag); return j && !j.drawing_url; });
      return b ? b.dataset.auftrag : null; }""")
    print("Balken ohne Zeichnung:", jid)
    if jid:
        pg.evaluate("TEST.pc((z) => ({ ergebnis: 'neu', adresse: 'https://ablage.test/zng-' + z.hoco_nr + '.pdf' }), 500)")
        pg.locator(f".pw-balken[data-auftrag='{jid}']").first.click(); pg.wait_for_timeout(5000)
        pruefe("Planwand: Zeichnung aus dem Ordner", pg.locator(".betrachter").count() == 1 and pg.locator("[data-abruf]").count() == 0
               and "zng-" in (pg.get_attribute(".betrachter__knoepfe a", "href") or ""))
    else:
        pruefe("Balken ohne Zeichnung gefunden", False)
    fehler += f
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
