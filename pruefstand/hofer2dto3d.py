# HOFER2DTO3D (1.604.0, Wunsch Patrick 17. November 2026): Zeichnung (PDF)
# links, 3D-Modell (STEP) rechts mit Ansicht und Download. Patrick lädt
# nur das PDF hoch, das STEP legt Claude über die Datenbank dazu
# (zeichnung_3d_step, gzip + Base64). Externe sehen den Reiter nicht.
import time, os, gzip, base64, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("H3D_BILDER", "/tmp")
HIER = os.path.dirname(os.path.abspath(__file__))
STEP = open(os.path.join(HIER, "kontur-test.step"), "rb").read()
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

# Kleinstes gültiges PDF mit einer Seite und etwas Text
def mini_pdf():
    teile = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
             "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
             None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    inhalt = b"BT /F1 40 Tf 80 700 Td (Zeichnung Test) Tj ET"
    aus = b"%PDF-1.4\n"; lage = []
    for i, t in enumerate(teile, 1):
        lage.append(len(aus))
        if t is None:
            aus += b"%d 0 obj << /Length %d >> stream\n" % (i, len(inhalt)) + inhalt + b"\nendstream endobj\n"
        else:
            aus += ("%d 0 obj %s endobj\n" % (i, t)).encode()
    x = len(aus)
    aus += b"xref\n0 %d\n0000000000 65535 f \n" % (len(teile) + 1) + b"".join(b"%010d 00000 n \n" % l for l in lage)
    aus += b"trailer << /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(teile) + 1, x)
    return aus
PDF = mini_pdf()

EINTRAEGE = [
  {"id": "e1", "hoco": "10053-1190", "titel": "Statorhülse Pluto", "notiz": None, "status": "fertig",
   "pdf_url": "https://ablage.test/a.pdf", "pdf_name": "E06 Hofer.pdf", "step_url": None,
   "step_name": "10053-1190_Statorhuelse.step", "step_groesse": len(STEP), "erstellt_am": "2026-11-17T09:00:00Z"},
  {"id": "e2", "hoco": "10007-0589", "titel": "Ritzel", "notiz": None, "status": "offen",
   "pdf_url": "https://ablage.test/b.pdf", "pdf_name": "Ritzel.pdf", "step_url": None,
   "erstellt_am": "2026-11-16T09:00:00Z"},
]
STEPS = [{"id": "e1", "name": "10053-1190_Statorhuelse.step", "groesse": len(STEP),
          "inhalt_gz": base64.b64encode(gzip.compress(STEP)).decode()}]

def start(p, rolle, breite=1440, hoehe=900):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = br.new_context(viewport={"width": breite, "height": hoehe}, accept_downloads=True)
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    body = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = '%s';\nTEST.daten.zeichnung_3d = %s;\nTEST.daten.zeichnung_3d_step = %s;\n" % (
        rolle, json.dumps(EINTRAEGE), json.dumps(STEPS))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    pg.route("https://ablage.test/**", lambda r: r.fulfill(status=200, content_type="application/pdf", body=PDF))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    return br, pg, pf

with sync_playwright() as p:
    br, pg, pf = start(p, "extern")
    pruefe(pg.locator("a[href='#/hofer2dto3d']").count() == 0, "Extern: kein Menüpunkt HOFER2DTO3D")
    br.close()

    br, pg, pf = start(p, "admin")
    links = pg.evaluate("() => [...document.querySelectorAll('nav a[href^=\"#/\"]')].map(a => a.getAttribute('href'))")
    pruefe("#/hofer2dto3d" in links and "#/einlagen" in links and links.index("#/hofer2dto3d") + 1 == links.index("#/einlagen"),
           "Menüpunkt direkt vor Einlagen Generator: %s" % links)
    pg.evaluate("location.hash='#/hofer2dto3d'"); pg.wait_for_selector("[data-h3d-eintrag='e1']")
    pruefe(pg.locator("[data-h3d-eintrag]").count() == 2, "zwei Einträge in der Liste")
    pruefe("Wartet auf 3D" in pg.inner_text("[data-h3d-eintrag='e2']"), "offener Eintrag mit Schild „Wartet auf 3D“")
    pg.wait_for_selector(".h3d-pdf canvas", timeout=20000)
    pruefe(True, "Zeichnung (PDF) gezeichnet")
    pg.wait_for_selector("[data-h3d-fertig]", timeout=60000)
    pruefe("Grösse" in pg.inner_text("[data-h3d-fertig]"), "3D-Modell aus der Datenbank gelesen: " + pg.inner_text("[data-h3d-fertig]"))
    pg.wait_for_timeout(800)
    hell = pg.evaluate("""() => { const c = document.querySelector('[data-h3d-flaeche] canvas');
      const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
      const x = g.getContext('2d'); x.drawImage(c, 0, 0);
      const d = x.getImageData(0, 0, g.width, g.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) n++; return n; }""")
    pruefe(hell > 2000, "Modell sichtbar gezeichnet (%d Punkte)" % hell)
    pg.screenshot(path=BILD + "/h3d-pc.png")
    # Freies Drehen mit der Maus (Trackball) und SpaceMouse über TEST.spaceMaus
    bild = lambda: pg.evaluate("() => document.querySelector('[data-h3d-flaeche] canvas').toDataURL()")
    vor = bild(); box = pg.locator("[data-h3d-flaeche] canvas").bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); pg.mouse.down()
    pg.mouse.move(box["x"] + box["width"] / 2 + 120, box["y"] + box["height"] / 2 + 60, steps=8); pg.mouse.up()
    pg.wait_for_timeout(300)
    pruefe(bild() != vor, "Ziehen mit der Maus dreht das Modell")
    vor = bild()
    pg.evaluate("() => window.TEST.spaceMaus && window.TEST.spaceMaus({ rz: 300, rx: 150 })"); pg.wait_for_timeout(400)
    pg.evaluate("() => window.TEST.spaceMaus && window.TEST.spaceMaus({ rz: 0, rx: 0 })"); pg.wait_for_timeout(200)
    pruefe(bild() != vor, "SpaceMouse dreht das Modell")
    pg.click("[data-h3d-ansicht='iso']")
    pg.click("[data-h3d-ansicht='vorne']"); pg.click("[data-h3d-schnitt]"); pg.wait_for_timeout(500)
    pg.screenshot(path=BILD + "/h3d-schnitt.png")
    with pg.expect_download() as d:
        pg.click("[data-h3d-laden='step']")
    dl = d.value; pfad = dl.path()
    pruefe(dl.suggested_filename == "10053-1190_Statorhuelse.step" and open(pfad, "rb").read() == STEP,
           "STEP herunterladen: Originalname und gleicher Inhalt")

    pg.click("[data-h3d-eintrag='e2']"); pg.wait_for_selector("[data-h3d-offen]")
    pruefe(pg.locator("[data-h3d-laden='step']").is_disabled(), "offen: Herunterladen STEP gesperrt")
    pg.screenshot(path=BILD + "/h3d-offen.png")

    # Nur PDF hochladen: Eintrag „offen“
    pg.evaluate("""() => { const alt = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () { if (this.type !== 'file') return alt.call(this);
        const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([37,80,68,70])], '10099-0001 Hofer.pdf', { type: 'application/pdf' }));
        this.files = dt.files; this.onchange(); }; }""")
    pg.click("#h3d-neu"); pg.wait_for_selector(".dialog-huelle input")
    pruefe(pg.locator(".dialog-huelle input").nth(0).input_value() == "10099-0001", "HOCO Nr. aus dem Dateinamen")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(1000)
    neu = [e for e in pg.evaluate("() => TEST.daten.zeichnung_3d") if e.get("hoco") == "10099-0001"]
    pruefe(len(neu) == 1 and neu[0]["status"] == "offen" and not neu[0].get("step_url") and neu[0]["pdf_name"] == "10099-0001 Hofer.pdf",
           "nur PDF: Eintrag offen gespeichert")
    up = [x for x in pg.evaluate("() => TEST.protokoll") if x.get("art") == "upload"]
    pruefe(len(up) == 1 and up[0]["pfad"].startswith("2dto3d/"), "PDF in die Ablage unter 2dto3d/")
    # Poolordner: „Jetzt umwandeln“ übernimmt die PDFs und schiebt sie nach _Übernommen
    pg.evaluate("""() => {
      const datei = (n) => ({ kind: 'file', name: n, getFile: async () => new File([new Uint8Array([37,80,68,70])], n, { type: 'application/pdf' }) });
      const unter = { name: '_Übernommen', dateien: {}, getFileHandle: async function (n, o) {
          if (!o || !o.create) { if (!this.dateien[n]) throw new Error('fehlt'); return this.dateien[n]; }
          return (this.dateien[n] = { createWritable: async () => ({ write: async () => {}, close: async () => {} }) }); } };
      const h = { name: 'Pool 2D', liste: { '10088-0002 Kunde.pdf': datei('10088-0002 Kunde.pdf'), 'notiz.txt': datei('notiz.txt'), 'Welle.pdf': datei('Welle.pdf') },
        entries: async function* () { for (const [n, e] of Object.entries(this.liste)) yield [n, e]; },
        getDirectoryHandle: async () => unter, removeEntry: async function (n) { delete this.liste[n]; },
        queryPermission: async () => 'granted', requestPermission: async () => 'granted' };
      window.__pool = h; window.__unter = unter;
      window.showDirectoryPicker = async () => h; }""")
    if pg.locator("#h3d-umwandeln").count():
        pg.click("#h3d-umwandeln"); pg.wait_for_timeout(1500)
        z = pg.evaluate("() => TEST.daten.zeichnung_3d")
        aus_pool = [e for e in z if e.get("notiz") == "aus dem Poolordner"]
        pruefe(len(aus_pool) == 2 and all(e["status"] == "offen" for e in aus_pool) and any(e.get("hoco") == "10088-0002" for e in aus_pool),
               "Poolordner: zwei PDFs als offen übernommen")
        rest = pg.evaluate("() => [Object.keys(window.__pool.liste), Object.keys(window.__unter.dateien)]")
        pruefe(rest[0] == ["notiz.txt"] and sorted(rest[1]) == ["10088-0002 Kunde.pdf", "Welle.pdf"], "PDFs nach _Übernommen verschoben: %s" % rest)
        pruefe("Poolordner: Pool 2D" in pg.inner_text("#h3d-pool"), "Name des Poolordners am Knopf")
    else:
        pruefe(False, "Knopf „Jetzt umwandeln“ fehlt (kein showDirectoryPicker?)")
    pg.screenshot(path=BILD + "/h3d-pool.png")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()

    br, pg, pf = start(p, "admin", 390, 844)
    pg.evaluate("location.hash='#/hofer2dto3d'"); pg.wait_for_selector("[data-h3d-fertig]", timeout=60000)
    breit = pg.evaluate("() => document.documentElement.scrollWidth")
    pruefe(breit <= 390, "Handy: kein seitliches Rollen (%d)" % breit)
    pg.screenshot(path=BILD + "/h3d-handy.png", full_page=True)
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
