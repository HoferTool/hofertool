# Infoboard (1.113.0, Wunsch Patrick 20. Oktober 2026): Seite zum
# Gestalten des 50-Zoll-Bildschirms hochkant. Kopf mit Logo und Solar-
# anlage, darunter drei Reihen „3 × A4“ oder „A3 + A4“ (1.118.0), Bereiche mit
# PDF (blättert von selbst) oder Zeichenfläche; Anzeige über den ganzen
# Bildschirm, öffnet sich auf dem Bildschirm-Gerät nach dem Neuladen.
import time, os
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

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1400, "height": 1000})
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    pg.route("**/ib-probe.pdf", lambda r: r.fulfill(status=200, content_type="application/pdf", body=PDF))
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
    kopf = pg.locator(".ib-gestalten .ib-kopf .ib-kopf__logo")
    pruefe(kopf.count() == 1, "Logo oben in der Tafel")
    pruefe(pg.locator(".ib-gestalten .ib-kopf .solar").count() == 1, "Solaranlage oben in der Tafel")
    k = pg.evaluate("() => { const i = document.querySelector('.ib-gestalten .ib-kopf__innen'); return [i.offsetHeight, i.style.transform]; }")
    pruefe(not k[1], "Kopf passt ohne Verkleinern: %s" % k)

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

    # Reihe Mitte als A3 + A4, im A3 die Zeichenfläche
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
    pg.click("[data-ib='skizze']"); pg.wait_for_timeout(800)
    a = pg.evaluate("() => TEST.daten.infoboard[0].aufbau")
    pruefe(a["reihen"][1]["format"] == "a3l" and a["reihen"][1]["felder"][0]["art"] == "skizze", "A3 mit Zeichenfläche gespeichert")
    skid = a["reihen"][1]["felder"][0]["id"]
    # Das PDF auf eine Adresse, die der Prüfstand ausliefert
    pg.evaluate("(u) => { TEST.daten.infoboard[0].aufbau.reihen[0].felder[0].datei.url = u; "
                "TEST.daten.infoboard[0].geaendert_am = new Date().toISOString(); }", PDF_URL)
    pg.screenshot(path=os.path.join(BILD, "infoboard-gestalten.png"))

    # Anzeige über den ganzen Bildschirm
    pg.set_viewport_size({"width": 540, "height": 960})
    pg.click("[data-ib='anzeige']"); pg.wait_for_selector("#infoboard .ib-blatt"); pg.wait_for_timeout(2000)
    pruefe(pg.locator("#infoboard .ib-feld").count() == 8, "Anzeige mit acht Bereichen")
    nr = pg.locator("#infoboard .ib-pdf__nr")
    pruefe(nr.count() == 1 and nr.inner_text().strip() == "1 / 2", "PDF zeigt Seite 1 / 2")
    w = pg.evaluate("() => document.querySelector('#infoboard .ib-pdf__seite').width")
    pruefe(w > 100, "PDF-Seite gezeichnet: %d" % w)
    pg.locator("#infoboard .ib-pdf").click(); pg.wait_for_timeout(300)
    pruefe(nr.inner_text().strip() == "2 / 2", "antippen zeigt die nächste Seite")
    # Zeichnen auf der Fläche
    cv = pg.locator("#infoboard .pad-skizze__leinwand").bounding_box()
    pruefe(cv is not None and cv["width"] > 100, "Zeichenfläche in der Anzeige")
    if cv:
        x, y = cv["x"] + cv["width"] * 0.3, cv["y"] + cv["height"] * 0.5
        pg.mouse.move(x, y); pg.mouse.down()
        for i in range(10): pg.mouse.move(x + i * 12, y + i * 4)
        pg.mouse.up(); pg.wait_for_timeout(1200)
    sk = pg.evaluate("(id) => (TEST.daten.infoboard_skizzen || []).find(x => x.bereich === id)", skid)
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
