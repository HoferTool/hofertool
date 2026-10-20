# Infoboard (1.113.0, Wunsch Patrick 20. Oktober 2026): Seite zum
# Gestalten des 50-Zoll-Bildschirms hochkant. Kopf mit Logo und Solar-
# anlage, darunter drei Reihen „3 × A4“ oder „A3 + A4“ (1.118.0), Bereiche mit
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
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector(".ib-gestalten"); pg.wait_for_timeout(800)
    felder = pg.locator(".ib-gestalten .ib-feld")
    pruefe(felder.count() == 9, "drei Reihen mit je drei Bereichen: %d" % felder.count())
    b = felder.first.bounding_box()
    pruefe(abs(b["height"] / b["width"] - 2 ** 0.5) < 0.02, "Bereich genau A4 hochkant: %.3f" % (b["height"] / b["width"]))
    kopf = pg.locator(".ib-gestalten .ib-kopf .kopfkarte .kopfkarte__logo")
    pruefe(kopf.count() == 1 and kopf.is_visible(), "Kopf wie auf der Startseite mit Logo")
    pruefe(pg.locator(".ib-gestalten .ib-kopf .solar").count() == 1, "Solaranlage oben in der Tafel")
    k = pg.evaluate("() => { const i = document.querySelector('.ib-gestalten .ib-kopf__innen'), o = i.parentElement;"
                    " return [i.getBoundingClientRect().height, o.getBoundingClientRect().height, i.style.transform]; }")
    pruefe(k[0] <= k[1] + 1, "Kopf passt in seinen Platz: %s" % k)

    # Oben links ein PDF
    pg.locator("[data-ibfeld='0-0'] .ib-feld__wahl").click(); pg.wait_for_selector("[data-ibwahl='0-0']")
    with pg.expect_file_chooser() as fc:
        pg.click("[data-ib='datei']")
    fc.value.set_files(files=[{"name": "Sicherheit Halle 2.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    pg.wait_for_timeout(1000)
    a = pg.evaluate("() => (TEST.daten.infoboard || [])[0]")
    f00 = a and a["aufbau"]["reihen"][0]["felder"][0]
    pruefe(f00 and f00["art"] == "datei" and f00["datei"]["typ"] == "pdf", "PDF im Bereich oben links gespeichert")
    up = pg.evaluate("() => TEST.protokoll.filter(x => x.art === 'upload').map(x => x.pfad)")
    pruefe(any(x.startswith("infoboard/") for x in up), "Datei in infoboard/: %s" % up)

    # Reihe Mitte als A3 + A4, im A3 ein Text
    pg.click("[data-ibformat='1-a3l']"); pg.wait_for_timeout(600)
    pruefe(pg.locator(".ib-gestalten .ib-feld").count() == 8, "Mitte nur noch zwei Bereiche")
    b = pg.locator("[data-ibfeld='1-0']").bounding_box()
    pruefe(abs(b["width"] / b["height"] - 700 / 486) < 0.03, "Mitte links A3 quer: %.3f" % (b["width"] / b["height"]))
    b2 = pg.locator("[data-ibfeld='1-1']").bounding_box()
    pruefe(abs(b2["height"] / b2["width"] - 2 ** 0.5) < 0.02 and b2["x"] > b["x"] + b["width"], "daneben rechts ein A4")
    unten = pg.locator("[data-ibfeld='2-2']").bounding_box()
    blatt = pg.locator(".ib-gestalten .ib-blatt").bounding_box()
    pruefe(unten["y"] + unten["height"] <= blatt["y"] + blatt["height"] + 1, "unterste Reihe ganz auf dem Blatt")
    pg.locator("[data-ibfeld='1-0'] .ib-feld__wahl").click(); pg.wait_for_selector("[data-ibwahl='1-0']")
    pruefe(pg.locator("[data-ib='skizze']").count() == 0, "keine neue Zeichenfläche mehr")
    pg.click("[data-ib='text']"); pg.wait_for_selector(".ib-te .ib-text__blatt"); pg.wait_for_timeout(300)
    blatt = pg.locator(".ib-te .ib-text__blatt")
    blatt.click(); pg.keyboard.type("Willkommen bei Hofer")
    pg.keyboard.press("Control+A")
    pg.click("[data-ibte='bold']")
    pg.select_option("[data-ibte='groesse']", "36")
    pg.keyboard.press("End"); pg.keyboard.press("Enter")
    pg.keyboard.type("Zweite Zeile")
    pg.screenshot(path=os.path.join(BILD, "infoboard-text.png"))
    pg.click("[data-ibte='fertig']"); pg.wait_for_timeout(800)
    pruefe(pg.locator(".ib-te").count() == 0, "Speichern schliesst das Fenster")
    a = pg.evaluate("() => TEST.daten.infoboard[0].aufbau")
    t = a["reihen"][1]["felder"][0]
    pruefe(a["reihen"][1]["format"] == "a3l" and t["art"] == "text" and "Willkommen bei Hofer" in t["html"],
           "A3 mit Text gespeichert")
    pruefe("<b>" in t["html"] or "font-weight" in t["html"], "fett gespeichert: %s" % t["html"][:160])
    pruefe("36pt" in t["html"], "Grösse 36 pt gespeichert")
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
    pg.locator("[data-ibfeld='1-0'] .ib-feld__wahl").dblclick(); pg.wait_for_selector(".ib-te .ib-text__blatt")
    pruefe("Willkommen" in pg.locator(".ib-te .ib-text__blatt").inner_text(), "Doppelklick öffnet den Text")
    with pg.expect_file_chooser() as fc:
        pg.click("[data-ibte='word']")
    fc.value.set_files(files=[{"name": "Hinweis.docx", "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "buffer": buf.getvalue()}])
    pg.wait_for_timeout(800)
    pg.click("[data-ibte='fertig']"); pg.wait_for_timeout(800)
    t = pg.evaluate("() => TEST.daten.infoboard[0].aufbau.reihen[1].felder[0]")
    h = t["html"]
    pruefe("Achtung Stapler" in h and ("#c00000" in h.lower() or "rgb(192, 0, 0)" in h) and "28pt" in h and "text-align: center" in h
           and "<i>langsam</i>" in h and "<td>" in h, "Word übernommen: %s" % h[:200])
    pruefe(t["id"] == skid, "Text behält seine Kennung")
    # Im dunklen Modus bleibt die Schrift schwarz oder in ihrer Farbe (1.122.1)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(200)
    f = pg.evaluate("""() => { const b = document.querySelector(".ib-gestalten [data-ibfeld='1-0'] .ib-text__blatt");
      const rot = [...b.querySelectorAll('span')].find(x => x.textContent.includes('Stapler'));
      const p = [...b.querySelectorAll('p')].find(x => x.textContent.includes('langsam'));
      return [getComputedStyle(p).color, getComputedStyle(rot).color]; }""")
    pruefe(f == ["rgb(17, 17, 17)", "rgb(192, 0, 0)"], "dunkler Modus: Schrift schwarz und rot: %s" % f)
    pg.locator("[data-ibfeld='1-0'] .ib-feld__wahl").dblclick(); pg.wait_for_selector(".ib-te .ib-text__blatt")
    pg.locator(".ib-te .ib-text__blatt").click(); pg.keyboard.press("Control+End"); pg.keyboard.press("Enter")
    pg.keyboard.type("Neu im Dunkeln")
    f = pg.evaluate("""() => { const b = document.querySelector('.ib-te .ib-text__blatt');
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n, z = null;
      while ((n = w.nextNode())) if (n.nodeValue.includes('Neu im Dunkeln')) z = n.parentElement;
      return getComputedStyle(z).color; }""")
    pruefe(f != "rgb(255, 255, 255)", "dunkler Modus: Schreiben nicht weiss: %s" % f)
    pg.click(".ib-te .knopf--still >> text=Abbrechen"); pg.wait_for_timeout(300)
    pg.evaluate("document.body.classList.remove('dunkel')")

    # Ziehen und Ablegen (1.120.0): Datei vom Computer auf unten links
    pg.evaluate("""() => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([37,80,68,70])], 'Plan unten.pdf', { type: 'application/pdf' }));
      const el = document.querySelector("[data-ibfeld='2-0'] .ib-feld__wahl");
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }""")
    pg.wait_for_timeout(1000)
    a = pg.evaluate("() => TEST.daten.infoboard[0].aufbau")
    f20 = a["reihen"][2]["felder"][0]
    pruefe(f20["art"] == "datei" and f20["datei"]["name"] == "Plan unten.pdf", "Datei auf ein Feld gezogen")
    # Feld auf ein anderes ziehen: die beiden tauschen
    pg.drag_and_drop("[data-ibfeld='2-0'] .ib-feld__wahl", "[data-ibfeld='2-2'] .ib-feld__wahl"); pg.wait_for_timeout(800)
    a = pg.evaluate("() => TEST.daten.infoboard[0].aufbau")
    r2 = a["reihen"][2]["felder"]
    pruefe(r2[2]["art"] == "datei" and r2[2]["datei"]["name"] == "Plan unten.pdf" and r2[0]["art"] == "leer",
           "Feld auf ein anderes gezogen: getauscht")
    pruefe(a["reihen"][1]["felder"][0]["id"] == skid, "Text bleibt, wo er war")
    # Excel und Word in ein Feld legen (1.122.0)
    pg.locator("[data-ibfeld='0-1'] .ib-feld__wahl").click(); pg.wait_for_selector("[data-ibwahl='0-1']")
    with pg.expect_file_chooser() as fc:
        pg.click("[data-ib='datei']")
    fc.value.set_files(files=[{"name": "Einrichtblatt.xlsx", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "buffer": XLSX}])
    pg.wait_for_timeout(1000)
    f01 = pg.evaluate("() => TEST.daten.infoboard[0].aufbau.reihen[0].felder[1]")
    pruefe(f01["art"] == "datei" and f01["datei"]["typ"] == "excel", "Excel im Feld gespeichert")
    pg.locator("[data-ibfeld='0-2'] .ib-feld__wahl").click(); pg.wait_for_selector("[data-ibwahl='0-2']")
    with pg.expect_file_chooser() as fc:
        pg.click("[data-ib='datei']")
    fc.value.set_files(files=[{"name": "Regeln.docx", "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "buffer": buf.getvalue()}])
    pg.wait_for_timeout(1000)
    f02 = pg.evaluate("() => TEST.daten.infoboard[0].aufbau.reihen[0].felder[2]")
    pruefe(f02["art"] == "text" and "Achtung Stapler" in f02["html"], "Word-Datei wird zu Text")
    pg.evaluate("(u) => { TEST.daten.infoboard[0].aufbau.reihen[0].felder[1].datei.url = u; }", XLSX_URL)
    # Eine alte Zeichenfläche (von vor 1.122.0) zeigt die Anzeige weiter
    pg.evaluate("() => { TEST.daten.infoboard[0].aufbau.reihen[2].felder[1] = { id: 'altskizze', art: 'skizze' }; }")
    # Das PDF auf eine Adresse, die der Prüfstand ausliefert
    pg.evaluate("(u) => { TEST.daten.infoboard[0].aufbau.reihen[0].felder[0].datei.url = u; "
                "TEST.daten.infoboard[0].geaendert_am = new Date().toISOString(); }", PDF_URL)
    pg.screenshot(path=os.path.join(BILD, "infoboard-gestalten.png"))

    # Anzeige über den ganzen Bildschirm
    pg.set_viewport_size({"width": 540, "height": 960})
    pg.click("[data-ib='anzeige']"); pg.wait_for_selector("#infoboard .ib-blatt"); pg.wait_for_timeout(2000)
    pruefe(pg.locator("#infoboard .ib-feld").count() == 8, "Anzeige mit acht Bereichen")
    nr = pg.locator("#infoboard [data-ibfeld='0-0'] .ib-pdf__nr")
    pruefe(nr.count() == 1 and nr.inner_text().strip() == "1 / 2", "PDF zeigt Seite 1 / 2")
    w = pg.evaluate("() => document.querySelector('#infoboard .ib-pdf__seite').width")
    pruefe(w > 100, "PDF-Seite gezeichnet: %d" % w)
    sb = pg.locator("#infoboard .ib-pdf__seite").first.bounding_box()
    fb = pg.locator("#infoboard [data-ibfeld='0-0']").bounding_box()
    pruefe(sb["width"] > fb["width"] * 0.95 or sb["height"] > fb["height"] * 0.95,
           "PDF füllt das Feld: %.0f×%.0f in %.0f×%.0f" % (sb["width"], sb["height"], fb["width"], fb["height"]))
    pg.locator("#infoboard .ib-pdf").first.click(); pg.wait_for_timeout(300)
    pruefe(nr.inner_text().strip() == "2 / 2", "antippen zeigt die nächste Seite")
    # Zeichnen auf der Fläche
    cv = pg.locator("#infoboard .pad-skizze__leinwand").bounding_box()
    pruefe(cv is not None and cv["width"] > 100, "Zeichenfläche in der Anzeige")
    if cv:
        x, y = cv["x"] + cv["width"] * 0.3, cv["y"] + cv["height"] * 0.5
        pg.mouse.move(x, y); pg.mouse.down()
        for i in range(10): pg.mouse.move(x + i * 12, y + i * 4)
        pg.mouse.up(); pg.wait_for_timeout(1200)
    pg.wait_for_selector("#infoboard .ib-excel .excelansicht__papier", timeout=8000)
    eb = pg.locator("#infoboard .ib-excel__seite").bounding_box()
    fb1 = pg.locator("#infoboard [data-ibfeld='0-1']").bounding_box()
    pruefe(eb["width"] > fb1["width"] * 0.95 or eb["height"] > fb1["height"] * 0.95,
           "Excel-Blatt füllt das Feld: %.0f×%.0f in %.0f×%.0f" % (eb["width"], eb["height"], fb1["width"], fb1["height"]))
    tx = pg.locator("#infoboard [data-ibfeld='1-0'] .ib-text__blatt")
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

    br.close()

pruefe(not pf, "keine Seitenfehler: %s" % pf)
print("Fehler:", "keine" if not fehler else fehler)
