# Pausenraum (1.284.0, Wunsch Patrick 30. Oktober 2026): Bildschirm quer
# 1920 × 1080 mit Touch, Kopf wie das Infoboard mit Band (Geburtstage,
# Termine), eigene Zeile „pausenraum“, antippbare Kacheln öffnen ihren
# Inhalt gross; Schliessen der Anzeige erst nach langem Druck auf den Kopf.
import time, os
from datetime import datetime, timedelta
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
       b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
       b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 842 595]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1400, "height": 1000})
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    heute = datetime.now()
    pg.clock.set_system_time(datetime(heute.year, heute.month, heute.day, 10, 0) + timedelta(days=(2 - heute.weekday()) % 7))
    t0 = datetime(heute.year, heute.month, heute.day) + timedelta(days=(2 - heute.weekday()) % 7)
    geb = lambda d: "1990-" + (t0 + timedelta(days=d)).strftime("%m-%d")
    tag = lambda d: (t0 + timedelta(days=d)).strftime("%Y-%m-%d")
    MIT = FAKE + ";\nTEST.daten.people = [{ id: 'p1', name: 'Anna Muster', geburtstag: '%s' }, { id: 'p2', name: 'Beat Beispiel', geburtstag: '%s' }];" % (geb(0), geb(5)) \
        + "\nTEST.daten.kalender = [{ id: 'k1', titel: 'Kehrichtabfuhr', datum: '%s', wiederholung: 'woche' }, { id: 'k2', titel: 'Papiersammlung', datum: '%s' }];\n" % (tag(1), tag(9))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pruefe(pg.locator("[data-nav='bildschirme']").count() > 0, "Bildschirme im Menü")
    pg.evaluate("""() => { TEST.daten.infoboard = [{ id: 'haupt', geaendert_am: '2026-10-20T10:00:00Z',
      aufbau: { frei: true, teile: [{ id: 'gang', art: 'text', html: 'Gang', x: 12, y: 700, w: 344, h: 486 }] } }]; }""")
    pg.evaluate("location.hash='#/pausenraum'"); pg.wait_for_selector(".ib-gestalten--pausenraum"); pg.wait_for_timeout(1500)
    b = pg.locator(".ib-gestalten .ib-blatt").evaluate("el => [el.offsetWidth, el.offsetHeight, el.dataset.ibtafel]")
    pruefe(b == [1920, 1080, "pausenraum"], "Tafel quer 1920 × 1080: %s" % b)
    pruefe(pg.locator(".ib-gestalten .ib-teil").count() == 0, "Teile des Infoboards nicht im Pausenraum")
    # Seit 1.286.0 hell: Kopf des Empfangs über die ganze Breite, Band flach darunter, Leiste für Radio
    ek = pg.locator(".ib-gestalten [data-ib='empfang-kopf']").evaluate("el => [el.offsetLeft, el.offsetWidth, el.scrollHeight <= el.clientHeight + 1]")
    pruefe(ek == [12, 1896, True], "heller Kopf über die ganze Breite, passt: %s" % ek)
    pruefe(pg.locator(".ib-gestalten .ib-blatt .kopfkarte").count() == 0, "nicht mehr der dunkle Kopf")
    pruefe(pg.locator(".ib-gestalten .ib-band--flach").count() == 1, "Band flach")
    pg.wait_for_timeout(800)
    bh = pg.locator(".ib-gestalten .ib-band--flach").evaluate("el => el.offsetHeight")
    pruefe(bh <= 80, "Band niedrig: %d" % bh)
    pruefe(pg.locator(".ib-gestalten .ib-band--flach .ib-band__zeile").count() == 4, "Geburtstage und Termine im Band: %d" % pg.locator(".ib-gestalten .ib-band--flach .ib-band__zeile").count())
    pruefe(pg.locator(".ib-gestalten [data-ib='pausenraum-leiste']").count() == 1, "Leiste für Radio und YouTube")
    # Hintergrundfarbe wählbar wie am Empfang
    pg.locator("[data-ib='farbe-grund']").evaluate("(el) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '#ffe8cc'); el.dispatchEvent(new Event('input', { bubbles: true })); }")
    pg.wait_for_timeout(1000)
    fb = pg.evaluate("() => (TEST.daten.infoboard.find(z => z.id === 'pausenraum') || { aufbau: {} }).aufbau.farben")
    pruefe(fb and fb.get("grund") == "#ffe8cc", "Hintergrundfarbe gespeichert: %s" % fb)
    pg.click("[data-ib='farben-vorgabe']"); pg.wait_for_timeout(800)

    # Kachel mit PDF
    pg.click("[data-ib='neu-kachel']"); pg.wait_for_selector(".dialog-huelle")
    pg.locator(".dialog-huelle input").first.fill("Menüplan")
    pg.locator(".dialog-huelle input").nth(1).fill("🍽️")
    with pg.expect_file_chooser() as fc:
        pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click()
    fc.value.set_files(files=[{"name": "Menu.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    pg.wait_for_timeout(1500)
    zeilen = pg.evaluate("() => TEST.daten.infoboard.map(z => [z.id, (z.aufbau.teile || []).length])")
    pruefe(sorted(zeilen) == [["haupt", 1], ["pausenraum", 1]], "eigene Zeile pausenraum: %s" % zeilen)
    t = pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'pausenraum').aufbau.teile[0]")
    pruefe(t["art"] == "kachel" and t["titel"] == "Menüplan" and t["inhalt"]["art"] == "datei" and t["inhalt"]["datei"]["typ"] == "pdf",
           "Kachel mit PDF gespeichert: %s" % {k: t.get(k) for k in ("art", "titel", "zeichen")})
    pruefe(t["y"] >= 478 and t["y"] + t["h"] <= 1080, "Kachel unter dem Kopf: %s" % {k: t[k] for k in "xywh"})
    pg.screenshot(path=BILD + "/pausenraum-gestalten.png")
    pruefe(pg.locator("[data-ib='kachel-inhalt']").inner_text().find("Menu.pdf") >= 0, "Inhalt der Kachel angezeigt")
    # In der Gestaltung öffnet Antippen nichts
    pg.locator(".ib-gestalten [data-ibkachel='Menüplan']").click(force=True); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-ib='gross']").count() == 0, "in der Gestaltung kein grosser Inhalt")

    # Anzeige
    pg.set_viewport_size({"width": 1920, "height": 1080})
    pg.click("[data-ib='anzeige']"); pg.wait_for_selector(".ib-voll--pausenraum .ib-kachel"); pg.wait_for_timeout(1500)
    pg.screenshot(path=BILD + "/pausenraum-anzeige.png")
    pg.locator(".ib-voll [data-ibkachel='Menüplan']").click(); pg.wait_for_timeout(1500)
    pruefe(pg.locator(".ib-voll [data-ib='gross']").count() == 1, "Antippen öffnet den Inhalt gross")
    pruefe(pg.locator(".ib-voll [data-ib='gross'] canvas").count() == 1, "PDF gross gezeichnet")
    pg.screenshot(path=BILD + "/pausenraum-gross.png")
    pg.click("[data-ib='gross-zu']"); pg.wait_for_timeout(300)
    pruefe(pg.locator(".ib-voll [data-ib='gross']").count() == 0, "Schliessen schliesst den Inhalt")
    # Nach zwei Minuten ohne Berührung von selbst zu
    pg.locator(".ib-voll [data-ibkachel='Menüplan']").click(); pg.wait_for_timeout(300)
    pg.clock.fast_forward(125000); pg.wait_for_timeout(300)
    pruefe(pg.locator(".ib-voll [data-ib='gross']").count() == 0, "nach zwei Minuten von selbst zu")
    # Kurzer Tipp auf den Kopf zeigt kein Schliessen, langer Druck schon
    pg.mouse.click(960, 60); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-ib='schliessen']").count() == 0, "kurzer Tipp auf den Kopf: kein Schliessen")
    pg.mouse.move(960, 60); pg.mouse.down(); pg.clock.fast_forward(3200); pg.wait_for_timeout(300); pg.mouse.up()
    pruefe(pg.locator("[data-ib='schliessen']").count() == 1, "langer Druck zeigt Schliessen")
    pg.click("[data-ib='schliessen']"); pg.wait_for_timeout(300)
    pruefe(pg.locator(".ib-voll").count() == 0, "Anzeige zu")

    # Gerät merken: ?bildschirm=pausenraum öffnet die Anzeige von selbst
    pg.goto(f"http://127.0.0.1:{PORT}/index.html?bildschirm=pausenraum", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2000)
    pruefe(pg.locator(".ib-voll--pausenraum").count() == 1, "Bildschirm-Gerät öffnet den Pausenraum von selbst")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()

print("Fehler:", "keine" if not fehler else fehler)
