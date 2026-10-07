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

    # Erkennen am Namen (seit 111.61.0 fest im Code, ohne Ausprobieren-Feld):
    # Dateien auf die Fläche ziehen, die Zuordnung lesen, nichts hochladen
    def ziehen(namen):
        pg.evaluate("""(namen) => { const dt = new DataTransfer();
          namen.forEach((n) => dt.items.add(new File(['x'], n, { type: n.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.ms-excel' })));
          const el = document.querySelector('#pool-ablage');
          el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true })); }""", namen)
        # Frage nach dem Typ (Excel ohne Typ im Namen) mit dem ersten Typ beantworten
        pg.wait_for_selector("#pool-los, .dialog-huelle [data-w]")
        if pg.locator(".dialog-huelle [data-w]").count(): pg.locator(".dialog-huelle [data-w]").first.click()
        pg.wait_for_selector("#pool-los"); pg.wait_for_timeout(400)
        zeilen = pg.evaluate("[...document.querySelectorAll('#pool-liste tbody tr')].map(tr => [...tr.cells].slice(1).map(td => td.innerText.trim()).join(' | ') + (tr.classList.contains('pool-zeile--offen') ? ' | OFFEN' : ''))")
        for z in zeilen: print("  ", z)
        return zeilen
    z = ziehen(["10844-0049 Star SR-32J.xlsx", "Star SR-32J.xlsx", "Liste.xlsx", "10844-0049_EB.pdf",
                "10844-0049.pdf", "10844-0049 Werkzeugprotokoll.xlsx", "10844-0049 Messbericht.pdf", "10844-0049 Zeichnung Rev B.pdf"])
    pruefe("Excel = Einrichtblatt mit Typ", "Einrichtblatt | 10844-0049 | Star SR-32J" in z[0] and "OFFEN" not in z[0])
    pruefe("Excel nur Typ = Vorlage", "Einrichtblatt | — | Star SR-32J" in z[1] and "OFFEN" not in z[1])
    pruefe("Excel ohne HOCO und Typ bleibt unzugeordnet", "OFFEN" in z[2])
    pruefe("PDF als Einrichtblatt abgelehnt", "OFFEN" in z[3])
    pruefe("Nur Nummer = Zeichnung", "Zeichnung | 10844-0049" in z[4] and "OFFEN" not in z[4])
    pruefe("Werkzeugprotokoll = Einrichtblatt", "Einrichtblatt | 10844-0049" in z[5])
    pruefe("Ohne Stichwort: kein Allgemein mehr, bleibt offen", "OFFEN" in z[6])
    pruefe("Stichwort Zeichnung", "Zeichnung | 10844-0049" in z[7] and "OFFEN" not in z[7])
    pg.evaluate("document.querySelectorAll('#pool-liste input[type=checkbox]').forEach(c => { if (c.checked) c.click(); })")
    pruefe("Nichts hochgeladen", pg.evaluate("TEST.daten.dokumente.length") == 0)
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(1200)

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
    # Excel ohne Typ im Namen: Die App fragt nach dem Maschinentyp (111.79.0)
    pg.wait_for_selector(".dialog-huelle [data-w]"); pg.wait_for_timeout(300)
    frage = pg.locator(".dialog-huelle .dialog").last.inner_text(); print(frage)
    pruefe("Frage nach dem Typ", "Für welchen Maschinentyp?" in frage and "10007-0381.xlsx" in frage)
    pg.screenshot(path="/tmp/claude-0/dok-typfrage.png")
    pg.locator(".dialog-huelle [data-w='t2']").click()
    pg.wait_for_selector("#pool-los"); pg.wait_for_timeout(500)
    liste = pg.inner_text("#pool-liste"); print(liste)
    pruefe("5 gelesen, 4 zugeordnet", "5 Dateien gelesen · 4 zugeordnet" in liste)
    pruefe("Nächster Auftrag ohne FA (12.10.)", "FA 20268566 · geplant 12.10." in liste)
    pruefe("Schon vergebene FA geht an ihren Auftrag", "FA 20260001 · geplant 01.10." in liste)
    pruefe("Gewählter Typ in der Liste", pg.evaluate("document.querySelector('[data-pooltyp]').value") == "t2")
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
    pruefe("Einrichtblatt am gewählten Typ", htd == ["t2"])
    docs = pg.evaluate("TEST.daten.dokumente.map(d => d.art + ':' + d.hoco_nr + ':' + d.titel)"); print(docs)
    pruefe("Zwei WBG-Einträge nebeneinander", sum(1 for d in docs if d.startswith("wbg:10007-0381")) == 2)
    pruefe("Verlauf geschrieben", pg.evaluate("TEST.daten.dokumente_verlauf.length") == 4)

    # Ganzer Ordner, der wie ein Typ heisst: keine Frage, Typ vom Ordner.
    # Ein anderer Ordner ohne Typnamen: Frage, Abbrechen lässt die Datei grau.
    def ordner_ziehen(ordner):
        pg.evaluate("""(ordner) => {
          const datei = (n) => ({ isFile: true, isDirectory: false, name: n,
            file: (ok) => ok(new File(['xl'], n, { type: 'application/vnd.ms-excel' })) });
          const mappe = (name, namen) => ({ isFile: false, isDirectory: true, name,
            createReader: () => { let mal = 0; return { readEntries: (ok) => ok(mal++ ? [] : namen.map(datei)) }; } });
          const items = Object.entries(ordner).map(([name, namen]) => ({ kind: 'file', webkitGetAsEntry: () => mappe(name, namen) }));
          const ev = new Event('drop', { bubbles: true, cancelable: true });
          Object.defineProperty(ev, 'dataTransfer', { value: { items, files: [] } });
          document.querySelector('#pool-ablage').dispatchEvent(ev); }""", ordner)
    typname = pg.evaluate("TEST.daten.machine_types.find(t => t.id === 't1').name")
    ordner_ziehen({typname: ["10844-0049.xlsx", "10844-0050 Werkzeugprotokoll.xlsx"]})
    pg.wait_for_selector("#pool-los"); pg.wait_for_timeout(400)
    pruefe("Ordner mit Typnamen: keine Frage", pg.locator(".dialog-huelle [data-w]").count() == 0)
    liste = pg.inner_text("#pool-liste"); print(liste)
    pruefe("Typ vom Ordner", liste.count(typname + " (vom Ordner)") == 2 and "2 zugeordnet" in liste)
    pg.evaluate("document.querySelectorAll('#pool-liste input[type=checkbox]').forEach(c => { if (c.checked) c.click(); })")
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(400)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(1000)
    ordner_ziehen({"Neue Blätter": ["10844-0049.xlsx"]})
    pg.wait_for_selector(".dialog-huelle [data-w]"); pg.wait_for_timeout(300)
    pg.locator(".dialog-huelle [data-nein]").last.click()
    pg.wait_for_selector("#pool-los"); pg.wait_for_timeout(400)
    pruefe("Abgebrochen: grau und nicht wählbar", pg.locator(".pool-zeile--offen").count() == 1
           and pg.locator("[data-pool='0']").is_disabled())
    pg.select_option("[data-pooltyp='0']", "t1"); pg.wait_for_timeout(200)
    pruefe("Typ in der Liste nachgewählt", pg.locator(".pool-zeile--offen").count() == 0 and pg.inner_text("#pool-los") == "1 hochladen")
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
