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
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pruefe(pg.locator("[data-nav='pausenraum']").count() > 0, "Pausenraum im Menü")
    pg.evaluate("""() => { TEST.daten.infoboard = [{ id: 'haupt', geaendert_am: '2026-10-20T10:00:00Z',
      aufbau: { frei: true, teile: [{ id: 'gang', art: 'text', html: 'Gang', x: 12, y: 700, w: 344, h: 486 }] } }]; }""")
    pg.evaluate("location.hash='#/pausenraum'"); pg.wait_for_selector(".ib-gestalten--pausenraum"); pg.wait_for_timeout(1500)
    b = pg.locator(".ib-gestalten .ib-blatt").evaluate("el => [el.offsetWidth, el.offsetHeight, el.dataset.ibtafel]")
    pruefe(b == [1920, 1080, "pausenraum"], "Tafel quer 1920 × 1080: %s" % b)
    pruefe(pg.locator(".ib-gestalten .ib-teil").count() == 0, "Teile des Infoboards nicht im Pausenraum")
    pruefe(pg.locator(".ib-gestalten .ib-blatt .kopfkarte").count() == 1 and pg.locator(".ib-gestalten .ib-blatt .solar").count() >= 1,
           "Kopf wie Infoboard mit Solaranlage")
    pruefe(pg.locator(".ib-gestalten .ib-blatt .ib-band, .ib-gestalten .ib-blatt [class*='band']").count() >= 1, "Band mit Geburtstagen und Terminen")

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
    pruefe(t["y"] >= 450 and t["y"] + t["h"] <= 1080, "Kachel unter dem Kopf: %s" % {k: t[k] for k in "xywh"})
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
