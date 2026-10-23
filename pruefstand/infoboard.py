# Infoboard (1.113.0, Wunsch Patrick 20. Oktober 2026): Seite zum
# Gestalten des 50-Zoll-Bildschirms hochkant. Kopf mit Logo und Solar-
# anlage, darauf seit 1.132.0 frei verschieb-, vergrösser- und drehbare
# Teile (vorher Reihen „3 × A4“ oder „A3 + A4“), mit
# PDF (blättert von selbst) oder Text wie in Word (1.122.0, vorher
# Zeichenfläche, alte bleiben); Anzeige über den ganzen
# Bildschirm, öffnet sich auf dem Bildschirm-Gerät nach dem Neuladen.
import time, os, io, zipfile
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def seite(n):
    return "%d 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n" % n
PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
       b"2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj\n"
       + seite(3).encode() + seite(4).encode() + b"trailer<</Root 1 0 R>>\n%%EOF")
PDF_URL = f"http://127.0.0.1:{PORT}/ib-probe.pdf"
XLSX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "einrichtblatt-beispiel.xlsx"), "rb").read()
XLSX_URL = f"http://127.0.0.1:{PORT}/ib-probe.xlsx"

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1400, "height": 1000})
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    pg.route("**/ib-probe.pdf", lambda r: r.fulfill(status=200, content_type="application/pdf", body=PDF))
    pg.route("**/ib-probe.xlsx", lambda r: r.fulfill(status=200, content_type="application/octet-stream", body=XLSX))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pruefe(pg.locator("[data-nav='infoboard']").count() > 0, "Infoboard im Menü für Admins")
    # Ein Aufbau von vorher mit Reihen: wird beim Laden zu freien Teilen
    pg.evaluate("""() => { TEST.daten.infoboard = [{ id: 'haupt', geaendert_am: '2026-10-20T10:00:00Z', aufbau: { reihen: [
      { format: 'a4', felder: [{ id: 'altpdf', art: 'datei', datei: { url: 'x', name: 'Alt.pdf', typ: 'pdf' }, sekunden: 20 }, { id: 'l1', art: 'leer' }, { id: 'l2', art: 'leer' }] },
      { format: 'a3l', felder: [{ id: 'l3', art: 'leer' }, { id: 'altskizze', art: 'skizze' }, { id: 'l4', art: 'leer' }] },
      { format: 'a4', felder: [{ id: 'l5', art: 'leer' }, { id: 'l6', art: 'leer' }, { id: 'l7', art: 'leer' }] } ] } }]; }""")
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector(".ib-gestalten"); pg.wait_for_timeout(800)
    teile = pg.locator(".ib-gestalten .ib-teil")
    pruefe(teile.count() == 2, "alte Reihen: zwei gefüllte Felder werden zwei Teile: %d" % teile.count())
    b = pg.locator("[data-ibteil='altpdf']").bounding_box()
    pruefe(abs(b["height"] / b["width"] - 2 ** 0.5) < 0.02, "altes Feld behält A4: %.3f" % (b["height"] / b["width"]))
    pruefe(pg.locator(".ib-gestalten .ib-feld--leer").count() == 0, "kein Raster mehr")
    kopf = pg.locator(".ib-gestalten .ib-kopf .kopfkarte .kopfkarte__logo")
    pruefe(kopf.count() == 1 and kopf.is_visible(), "Kopf wie auf der Startseite mit Logo")
    pruefe(pg.locator(".ib-gestalten .ib-kopf .solar").count() == 1, "Solaranlage oben in der Tafel")
    k = pg.evaluate("() => { const i = document.querySelector('.ib-gestalten .ib-kopf__innen'), o = i.parentElement;"
                    " return [i.getBoundingClientRect().height, o.getBoundingClientRect().height, i.style.transform]; }")
    pruefe(k[0] <= k[1] + 1, "Kopf passt in seinen Platz: %s" % k)
    aufbau = lambda: pg.evaluate("() => TEST.daten.infoboard[0].aufbau")
    teil = lambda f: next((t for t in aufbau()["teile"] if f(t)), None)

    # Datei hinzufügen: ein PDF, so hoch wie die Seite
    with pg.expect_file_chooser() as fc:
        pg.click("[data-ib='neu-datei']")
    fc.value.set_files(files=[{"name": "Sicherheit Halle 2.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    pg.wait_for_timeout(1500)
    a = aufbau()
    pruefe(a.get("frei") and len(a["teile"]) == 3, "als freier Aufbau gespeichert, drei Teile")
    pdf = teil(lambda t: t.get("datei", {}).get("name") == "Sicherheit Halle 2.pdf")
    pruefe(pdf and abs(pdf["h"] / pdf["w"] - 842 / 595) < 0.02, "neues PDF im Seitenverhältnis: %s" % pdf)
    up = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'upload').map(x => x.pfad)")
    pruefe(any(x.startswith("infoboard/") for x in up), "Datei in infoboard/: %s" % up)
    pruefe(pg.locator(f"[data-ibwahl='{pdf['id']}']").count() == 1, "neues Teil ist gewählt")
    # Mehrere Seiten: auch „Nicht selber blättern“ (Wunsch Patrick 21. Oktober 2026)
    pg.select_option("[data-ib='sekunden']", "0"); pg.wait_for_timeout(500)
    pruefe(teil(lambda t: t["id"] == pdf["id"]).get("sekunden") == 0, "nicht selber blättern gespeichert")
    pruefe(pg.locator("[data-ib='sekunden']").input_value() == "0", "Auswahl bleibt auf nicht blättern")

    # Verschieben: Teil anfassen und ziehen
    g = pg.locator(f"[data-ibteil='{pdf['id']}'] .ib-teil__griff").bounding_box()
    blatt = pg.locator(".ib-gestalten .ib-blatt").bounding_box()
    kk = blatt["width"] / 1080
    pg.mouse.move(g["x"] + g["width"] / 2, g["y"] + g["height"] / 2); pg.mouse.down()
    for i in range(1, 11): pg.mouse.move(g["x"] + g["width"] / 2 + i * 10 * kk * 10 / 10, g["y"] + g["height"] / 2 + i * 8 * kk)
    pg.mouse.up(); pg.wait_for_timeout(700)
    n = teil(lambda t: t["id"] == pdf["id"])
    pruefe(abs(n["x"] - pdf["x"] - 100) <= 3 and abs(n["y"] - pdf["y"] - 80) <= 3, "verschoben um 100/80 Punkte: %s → %s" % ((pdf["x"], pdf["y"]), (n["x"], n["y"])))
    # Grösse über die Ecke: Seitenverhältnis bleibt, Ecke oben links bleibt
    e = pg.locator(f"[data-ibteil='{pdf['id']}'] [data-ibecke]").bounding_box()
    pg.mouse.move(e["x"] + e["width"] / 2, e["y"] + e["height"] / 2); pg.mouse.down()
    for i in range(1, 11): pg.mouse.move(e["x"] + e["width"] / 2 + i * 10 * kk, e["y"] + e["height"] / 2 + i * 2 * kk)
    pg.mouse.up(); pg.wait_for_timeout(700)
    m = teil(lambda t: t["id"] == pdf["id"])
    pruefe(m["w"] > n["w"] + 80 and abs(m["h"] / m["w"] - n["h"] / n["w"]) < 0.01 and abs(m["x"] - n["x"]) <= 2 and abs(m["y"] - n["y"]) <= 2,
           "grösser über die Ecke, nicht verzerrt: %s → %s" % ((n["w"], n["h"]), (m["w"], m["h"])))
    # Drehen am runden Griff: Mitte, dann nach rechts ziehen = 90 Grad
    d = pg.locator(f"[data-ibteil='{pdf['id']}'] [data-ibdrehen]").bounding_box()
    mx, my = blatt["x"] + (m["x"] + m["w"] / 2) * kk, blatt["y"] + (m["y"] + m["h"] / 2) * kk
    pg.mouse.move(d["x"] + d["width"] / 2, d["y"] + d["height"] / 2); pg.mouse.down()
    pg.mouse.move(mx + 50, my - 120); pg.mouse.move(mx + 200, my + 2)
    pg.mouse.up(); pg.wait_for_timeout(700)
    r = teil(lambda t: t["id"] == pdf["id"])
    pruefe(r["drehung"] == 90, "gedreht, rastet bei 90 Grad ein: %s" % r["drehung"])
    pruefe("rotate(90deg)" in (pg.locator(f"[data-ibteil='{pdf['id']}']").get_attribute("style") or ""), "Tafel zeigt es gedreht")
    # Frei drehen mit dem Schieber (der Griff kann ausserhalb liegen)
    pg.locator("[data-ib='drehung']").fill("45"); pg.wait_for_timeout(900)
    r = teil(lambda t: t["id"] == pdf["id"])
    pruefe(40 <= r["drehung"] <= 50, "frei gedreht: %s" % r["drehung"])
    pg.screenshot(path=os.path.join(BILD, "infoboard-gedreht.png"))
    pg.click("[data-ib='gerade']"); pg.wait_for_timeout(500)
    pruefe(teil(lambda t: t["id"] == pdf["id"])["drehung"] == 0, "Gerade stellen")
    # Nach hinten: steht dann zuerst in der Liste
    pg.click("[data-ib='hinten']"); pg.wait_for_timeout(500)
    pruefe(aufbau()["teile"][0]["id"] == pdf["id"], "Nach hinten")
    pg.click("[data-ib='vorne']"); pg.wait_for_timeout(500)
    pruefe(aufbau()["teile"][-1]["id"] == pdf["id"], "Nach vorne")

    # Text hinzufügen, wie in Word
    pg.click("[data-ib='neu-text']"); pg.wait_for_selector(".ib-te .ib-text__blatt"); pg.wait_for_timeout(300)
    blatt_t = pg.locator(".ib-te .ib-text__blatt")
    blatt_t.click(); pg.keyboard.type("Willkommen bei Hofer")
    pg.keyboard.press("Control+A")
    pg.click("[data-ibte='bold']")
    pg.select_option("[data-ibte='groesse']", "36")
    pg.keyboard.press("End"); pg.keyboard.press("Enter")
    pg.keyboard.type("Zweite Zeile")
    pg.keyboard.press("Shift+Home")
    pg.select_option("[data-ibte='schrift']", label="Times New Roman")
    pg.keyboard.press("End"); pg.keyboard.press("Enter")
    with pg.expect_file_chooser() as fc:
        pg.click("[data-ibte='bild']")
    fc.value.set_files(files=[{"name": "Logo.png", "mimeType": "image/png", "buffer": bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c63f8cfc0f01f0005000201e221bc330000000049454e44ae426082")}])
    pg.wait_for_timeout(800)
    pg.locator(".ib-te .ib-text__blatt img").click()
    pg.click("[data-ibte='bild75']")
    pg.screenshot(path=os.path.join(BILD, "infoboard-text.png"))
    pg.click("[data-ibte='fertig']"); pg.wait_for_timeout(800)
    pruefe(pg.locator(".ib-te").count() == 0, "Speichern schliesst das Fenster")
    t = teil(lambda x: x["art"] == "text")
    pruefe(t and "Willkommen bei Hofer" in t["html"], "Text als neues Teil gespeichert")
    pruefe("<b>" in t["html"] or "font-weight" in t["html"], "fett gespeichert: %s" % t["html"][:160])
    pruefe("36pt" in t["html"], "Grösse 36 pt gespeichert")
    pruefe("Times New Roman" in t["html"], "Schriftart gespeichert")
    pruefe('<img src="' in t["html"] and 'width: 75%' in t["html"] and "outline" not in t["html"], "Bild mit 75 %% gespeichert")
    skid = t["id"]
    # Word-Datei einlesen: Doppelklick öffnet das Textfeld wieder
    W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    xml = ('<?xml version="1.0"?><w:document ' + W + '><w:body>'
           '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="C00000"/><w:sz w:val="56"/></w:rPr>'
           '<w:t>Achtung Stapler</w:t></w:r></w:p>'
           '<w:p><w:r><w:t xml:space="preserve">Bitte </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>langsam</w:t></w:r></w:p>'
           '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
           '</w:body></w:document>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>"); z.writestr("word/document.xml", xml)
    pg.locator(f"[data-ibteil='{skid}'] .ib-teil__griff").dblclick(); pg.wait_for_selector(".ib-te .ib-text__blatt")
    pruefe("Willkommen" in pg.locator(".ib-te .ib-text__blatt").inner_text(), "Doppelklick öffnet den Text")
    with pg.expect_file_chooser() as fc:
        pg.click("[data-ibte='word']")
    fc.value.set_files(files=[{"name": "Hinweis.docx", "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "buffer": buf.getvalue()}])
    pg.wait_for_timeout(800)
    pg.click("[data-ibte='fertig']"); pg.wait_for_timeout(800)
    t = teil(lambda x: x["id"] == skid)
    h = t["html"]
    pruefe("Achtung Stapler" in h and ("#c00000" in h.lower() or "rgb(192, 0, 0)" in h) and "28pt" in h and "text-align: center" in h
           and "<i>langsam</i>" in h and "<td>" in h, "Word übernommen: %s" % h[:200])
    # Im dunklen Modus bleibt die Schrift schwarz oder in ihrer Farbe (1.122.1)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(200)
    f = pg.evaluate("""(id) => { const b = document.querySelector(".ib-gestalten [data-ibteil='" + id + "'] .ib-text__blatt");
      const rot = [...b.querySelectorAll('span')].find(x => x.textContent.includes('Stapler'));
      const p = [...b.querySelectorAll('p')].find(x => x.textContent.includes('langsam'));
      return [getComputedStyle(p).color, getComputedStyle(rot).color]; }""", skid)
    pruefe(f == ["rgb(17, 17, 17)", "rgb(192, 0, 0)"], "dunkler Modus: Schrift schwarz und rot: %s" % f)
    pg.evaluate("document.body.classList.remove('dunkel')")

    # Datei vom Computer an eine Stelle der Tafel ziehen
    ziel_x, ziel_y = blatt["x"] + 300 * kk, blatt["y"] + 1500 * kk
    pg.evaluate("""([x, y]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([37,80,68,70])], 'Plan unten.pdf', { type: 'application/pdf' }));
      const el = document.querySelector(".ib-gestalten .ib-blatt");
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }""", [ziel_x, ziel_y])
    pg.wait_for_timeout(1500)
    pl = teil(lambda t: t.get("datei", {}).get("name") == "Plan unten.pdf")
    pruefe(pl and abs(pl["x"] + pl["w"] / 2 - 300) < 30 and abs(pl["y"] + pl["h"] / 2 - 1500) < 30,
           "Datei dort abgelegt, wo sie hingezogen wurde: %s" % pl)
    # Excel und Word hinzufügen (1.122.0)
    with pg.expect_file_chooser() as fc:
        pg.click("[data-ib='neu-datei']")
    fc.value.set_files(files=[{"name": "Einrichtblatt.xlsx", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "buffer": XLSX}])
    pg.wait_for_timeout(1200)
    xl = teil(lambda t: t.get("datei", {}).get("typ") == "excel")
    pruefe(xl is not None, "Excel als Teil gespeichert")
    with pg.expect_file_chooser() as fc:
        pg.click("[data-ib='neu-datei']")
    fc.value.set_files(files=[{"name": "Regeln.docx", "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "buffer": buf.getvalue()}])
    pg.wait_for_timeout(1200)
    pruefe(len([t for t in aufbau()["teile"] if t["art"] == "text"]) == 2, "Word-Datei wird zu Text")
    # Entfernen: eine Rückfrage
    pg.locator(f"[data-ibteil='{pl['id']}'] .ib-teil__griff").click()
    pg.click("[data-ib='leeren']"); pg.wait_for_timeout(300)
    pg.locator(".dialog-huelle .dialog__knoepfe button").last.click(); pg.wait_for_timeout(700)
    pruefe(teil(lambda t: t["id"] == pl["id"]) is None, "Entfernen nimmt das Teil weg")
    # Für die Anzeige: Adressen, die der Prüfstand ausliefert; das PDF gedreht
    pg.evaluate("""([p, x, id, xid]) => { const a = TEST.daten.infoboard[0].aufbau;
      a.teile.find(t => t.id === id).datei.url = p; a.teile.find(t => t.id === id).drehung = 8;
      a.teile.find(t => t.id === xid).datei.url = x;
      const sk = a.teile.find(t => t.id === 'altskizze'); a.teile = a.teile.filter(t => t !== sk).concat([sk]);
      TEST.daten.infoboard[0].geaendert_am = new Date().toISOString(); }""", [PDF_URL, XLSX_URL, pdf["id"], xl["id"]])
    pg.screenshot(path=os.path.join(BILD, "infoboard-gestalten.png"))

    # Anzeige über den ganzen Bildschirm
    pg.set_viewport_size({"width": 540, "height": 960})
    pg.click("[data-ib='anzeige']"); pg.wait_for_selector("#infoboard .ib-blatt"); pg.wait_for_timeout(2500)
    pruefe(pg.locator("#infoboard .ib-teil").count() == 6, "Anzeige mit sechs Teilen: %d" % pg.locator("#infoboard .ib-teil").count())
    pruefe(pg.locator("#infoboard .ib-teil__griff").count() == 0, "keine Griffe in der Anzeige")
    pruefe("rotate(8deg)" in (pg.locator(f"#infoboard [data-ibteil='{pdf['id']}']").get_attribute("style") or ""), "gedreht auch in der Anzeige")
    nr = pg.locator(f"#infoboard [data-ibteil='{pdf['id']}'] .ib-pdf__nr")
    pruefe(nr.count() == 1 and nr.inner_text().strip() == "1 / 2", "PDF zeigt Seite 1 / 2")
    pg.wait_for_timeout(3500)
    pruefe(nr.inner_text().strip() == "1 / 2", "blättert nicht von selbst")
    w = pg.evaluate("(id) => document.querySelector(\"#infoboard [data-ibteil='\" + id + \"'] .ib-pdf__seite\").width", pdf["id"])
    pruefe(w > 100, "PDF-Seite gezeichnet: %d" % w)
    pg.evaluate("(id) => document.querySelector(\"#infoboard [data-ibteil='\" + id + \"'] .ib-pdf\").click()", pdf["id"]); pg.wait_for_timeout(300)
    pruefe(nr.inner_text().strip() == "2 / 2", "antippen zeigt die nächste Seite")
    # Zeichnen auf der alten Fläche
    cv = pg.locator("#infoboard .pad-skizze__leinwand").bounding_box()
    pruefe(cv is not None and cv["width"] > 50, "alte Zeichenfläche in der Anzeige")
    if cv:
        x, y = cv["x"] + cv["width"] * 0.7, cv["y"] + cv["height"] * 0.15
        pg.mouse.move(x, y); pg.mouse.down()
        for i in range(10): pg.mouse.move(x + i * 6, y + i * 2)
        pg.mouse.up(); pg.wait_for_timeout(1200)
    pg.wait_for_selector("#infoboard .ib-excel .excelansicht__papier", timeout=8000)
    eb = pg.locator("#infoboard .ib-excel__seite").bounding_box()
    fb1 = pg.locator(f"#infoboard [data-ibteil='{xl['id']}']").bounding_box()
    pruefe(eb["width"] > fb1["width"] * 0.95 or eb["height"] > fb1["height"] * 0.95,
           "Excel-Blatt füllt das Teil: %.0f×%.0f in %.0f×%.0f" % (eb["width"], eb["height"], fb1["width"], fb1["height"]))
    tx = pg.locator(f"#infoboard [data-ibteil='{skid}'] .ib-text__blatt")
    pruefe(tx.count() == 1 and "Achtung Stapler" in tx.inner_text(), "Text in der Anzeige")
    pruefe(tx.get_attribute("contenteditable") is None, "Anzeige ist nicht bearbeitbar")
    sk = pg.evaluate("() => (TEST.daten.infoboard_skizzen || []).find(x => x.bereich === 'altskizze')")
    pruefe(sk and len(sk["striche"]) == 1, "Strich gespeichert je Bereich")
    pg.screenshot(path=os.path.join(BILD, "infoboard-anzeige.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe(pg.locator("#infoboard").count() == 0, "Escape schliesst die Anzeige")

    # Bildschirm-Gerät: nach dem Neuladen von selbst offen
    pg.set_viewport_size({"width": 1400, "height": 1000})
    pg.click("[data-ib='geraet']")
    pruefe(pg.evaluate("() => localStorage.getItem('hofer.infoboard.geraet')") == "1", "Gerät gemerkt")
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(3000)
    pruefe(pg.locator("#infoboard .ib-blatt").count() == 1, "nach dem Neuladen von selbst offen")
    # Tipp oben zeigt Schliessen
    pg.mouse.click(700, 40); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-ib='schliessen']").count() == 1, "Tipp oben zeigt Schliessen")
    pg.click("[data-ib='schliessen']"); pg.wait_for_timeout(300)
    pruefe(pg.locator("#infoboard").count() == 0, "Schliessen schliesst")

    # Konto „Infoboard“ (1.129.0): ohne Häkchen am Gerät, nur mit dem Vermerk
    # am Konto, geht die Anzeige nach dem Laden von selbst auf
    pg.evaluate("() => localStorage.removeItem('hofer.infoboard.geraet')")
    pg.unroute("**/cdn.jsdelivr.net/**")
    PATCH = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { infoboardBildschirm: true };\n"
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=PATCH))
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(3000)
    pruefe(pg.locator("#infoboard .ib-blatt").count() == 1, "Konto Infoboard: Anzeige von selbst offen")

    br.close()

pruefe(not pf, "keine Seitenfehler: %s" % pf)
print("Fehler:", "keine" if not fehler else fehler)
