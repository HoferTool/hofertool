# Dokumenten-Pool (111.37.0): WBG mit FA Nr. an den nächsten offenen
# Auftrag ohne FA Nr., Excel = Einrichtblatt (Typ notfalls von der
# Maschine des nächsten Auftrags), Fläche zum Hineinziehen, Pool-Ordner
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.dokumente = []; daten.dokumente_verlauf = [];
daten.jobs.push(
  { id: 'p1', job_number: '10007-0381', fa_nr: '20260001', machine_id: 'm-k1', planned_from: '2026-10-01', wbg_url: null, ended_at: null },
  { id: 'p2', job_number: '10007-0381', fa_nr: null, machine_id: 'm-k1', planned_from: '2026-10-20', wbg_url: null, ended_at: null },
  { id: 'p3', job_number: '10007-0381', fa_nr: '', machine_id: 'm-k1', planned_from: '2026-10-12', wbg_url: 'https://x/alt-wbg.pdf', ended_at: null },
  { id: 'p4', job_number: '10007-0381', fa_nr: null, machine_id: 'm-k1', planned_from: '2026-10-05', wbg_url: null, ended_at: '2026-10-04T10:00:00Z' },
  { id: 'p5', job_number: '77777-0001', fa_nr: null, machine_id: 'm-k2', planned_from: '2026-10-15', wbg_url: null, ended_at: null });
daten.app_config.push({ schluessel: 'dok_pool_status', wert: JSON.stringify({ zeit: new Date().toISOString(), rechner: 'BUERO1', neu: 4, wartet: ['20269999 55555-0001.pdf'], ohne: ['Quatsch.pdf'] }) });
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
PDF = b"%PDF-1.4"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(1200)

    # Probe
    def probe(n):
        pg.fill("#dokprobe", n); pg.wait_for_timeout(150); return pg.inner_text("#dokprobe-ergebnis")
    t = probe("20268566 10007-0381.pdf"); print(t)
    pruefe("FA Nr. erkannt", t.startswith("WBG mit FA 20268566") and "10007-0381" in t)
    t = probe("10844-0049 Star SR-32J.xlsx"); print(t)
    pruefe("Excel = Einrichtblatt", t.startswith("Einrichtblatt der HOCO Nr. 10844-0049 auf dem Typ Star SR-32J"))
    t = probe("Star SR-32J.xlsx"); print(t)
    pruefe("Excel nur Typ = Vorlage", t.startswith("Einrichtblatt-Vorlage"))
    pruefe("Excel ohne HOCO und Typ bleibt unzugeordnet", "keine HOCO" in probe("Liste.xlsx"))
    t = probe("10844-0049_EB.pdf"); print(t)
    pruefe("PDF als Einrichtblatt abgelehnt", t.startswith("nicht zuzuordnen: Einrichtblätter nur als Excel"))
    pruefe("Zeichnung bleibt Zeichnung", probe("10844-0049.pdf").startswith("Zeichnung"))
    pruefe("Beispiele zeigen FA und Excel", "WBG mit FA 20268566" in pg.inner_text("#dokbeispiele"))

    # Pool-Ordner
    pruefe("Pool-Ordner mit Stand", "BUERO1" in pg.inner_text("#dokpool-stand") and "1 warten" in pg.inner_text("#dokpool-stand"))
    pg.fill("#dokpool", "D:\\\\Pool"); pg.click("#dokpool-speichern"); pg.wait_for_timeout(400)
    pruefe("Pool-Ordner gespeichert", pg.evaluate("(TEST.daten.app_config.findLast(x => x.schluessel === 'dok_pool_pfad') || {}).wert") == "D:\\\\Pool")

    # Hineinziehen
    pruefe("Ablagefläche da", pg.locator("#pool-ablage").count() == 1)
    pg.evaluate("""() => { const dt = new DataTransfer();
      dt.items.add(new File(['%PDF-1.4'], '20268566 10007-0381.pdf', { type: 'application/pdf' }));
      dt.items.add(new File(['%PDF-1.4'], '20260001 10007-0381.pdf', { type: 'application/pdf' }));
      dt.items.add(new File(['xl'], '10007-0381.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      dt.items.add(new File(['%PDF-1.4'], '20269999 77777-0001.pdf', { type: 'application/pdf' }));
      dt.items.add(new File(['%PDF-1.4'], '20268888 55555-0001.pdf', { type: 'application/pdf' }));
      dt.items.add(new File(['x'], 'notiz.txt', { type: 'text/plain' }));
      const el = document.querySelector('#pool-ablage');
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true })); }""")
    pg.wait_for_selector("#pool-los"); pg.wait_for_timeout(500)
    liste = pg.inner_text("#pool-liste"); print(liste)
    pruefe("5 gelesen, 4 zugeordnet", "5 Dateien gelesen · 4 zugeordnet" in liste)
    pruefe("Nächster Auftrag ohne FA (12.10.)", "FA 20268566 · geplant 12.10." in liste)
    pruefe("Schon vergebene FA geht an ihren Auftrag", "FA 20260001 · geplant 01.10." in liste)
    pruefe("Typ vom Auftrag", "Tornos (vom Auftrag)" in liste or "(vom Auftrag)" in liste)
    pruefe("Ohne Auftrag nicht zugeordnet", "kein offener Auftrag der HOCO Nr. 55555-0001" in liste)
    pg.screenshot(path="/tmp/claude-0/dokpool.png")
    pg.click("#pool-los"); pg.wait_for_timeout(1800)
    jobs = pg.evaluate("Object.fromEntries(TEST.daten.jobs.filter(j => j.id.startsWith('p')).map(j => [j.id, [j.fa_nr, !!j.wbg_url && j.wbg_url.indexOf('alt-wbg') < 0, j.wbg_url === 'https://x/alt-wbg.pdf']]))")
    print(jobs)
    pruefe("p3 bekommt FA und WBG", jobs["p3"][0] == "20268566" and jobs["p3"][1])
    pruefe("p1 bekommt neue WBG, FA bleibt", jobs["p1"][0] == "20260001" and jobs["p1"][1])
    pruefe("p2 unberührt", jobs["p2"][0] is None and not jobs["p2"][1])
    pruefe("Beendeter p4 unberührt", jobs["p4"][0] is None and not jobs["p4"][1])
    pruefe("p5 bekommt FA", jobs["p5"][0] == "20269999")
    htd = pg.evaluate("TEST.daten.hoco_type_data.filter(x => x.hoco_nr === '10007-0381').map(x => x.type_id)")
    pruefe("Einrichtblatt am Typ der Maschine", htd == ["t2"])
    docs = pg.evaluate("TEST.daten.dokumente.map(d => d.art + ':' + d.hoco_nr + ':' + d.titel)"); print(docs)
    pruefe("Zwei WBG-Einträge nebeneinander", sum(1 for d in docs if d.startswith("wbg:10007-0381")) == 2)
    pruefe("Verlauf geschrieben", pg.evaluate("TEST.daten.dokumente_verlauf.length") == 4)
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
