# Empfang (1.201.0, Wunsch Patrick 26. Oktober 2026): zweiter Bildschirm
# wie das Infoboard, aber quer und genau 1920 × 1080 Punkte, eigene Zeile
# „empfang“ in der Tabelle infoboard. Das App-Paket für Samsung öffnet die
# App mit ?bildschirm=empfang, dann geht die Anzeige von selbst auf.
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
    pruefe(pg.locator("[data-nav='empfang']").count() > 0, "Empfang im Menü für Admins")
    pg.evaluate("""() => { TEST.daten.infoboard = [{ id: 'haupt', geaendert_am: '2026-10-20T10:00:00Z',
      aufbau: { frei: true, teile: [{ id: 'gang', art: 'text', html: 'Gang', x: 12, y: 500, w: 344, h: 486 }] } }]; }""")
    pg.evaluate("location.hash='#/empfang'"); pg.wait_for_selector(".ib-gestalten--empfang"); pg.wait_for_timeout(800)
    b = pg.locator(".ib-gestalten .ib-blatt").evaluate("el => [el.offsetWidth, el.offsetHeight, el.dataset.ibtafel]")
    pruefe(b == [1920, 1080, "empfang"], "Tafel quer 1920 × 1080: %s" % b)
    pruefe(pg.locator(".ib-gestalten .ib-teil").count() == 0, "Teile des Infoboards nicht am Empfang")
    # Eigener ruhiger Kopf: hell, Uhr, Logo, Wetter, Solaranlage als Zahlen,
    # keine Wellen, kein Jetski, nichts bewegt sich
    pruefe(pg.locator(".ib-gestalten [data-ib='empfang-kopf']").count() == 1, "eigener Kopf am Empfang")
    pruefe(pg.locator(".ib-gestalten .ib-blatt .kopfkarte, .ib-gestalten .ib-blatt .solar").count() == 0, "ohne Kopf der Startseite")
    pg.wait_for_timeout(1500)
    pruefe(pg.locator(".ib-gestalten .ek-kachel").count() == 4, "Solaranlage mit vier Zahlen: %d" % pg.locator(".ib-gestalten .ek-kachel").count())
    an = pg.evaluate("() => document.querySelector('.ib-gestalten .ib-blatt').getAnimations({ subtree: true }).length")
    pruefe(an == 0, "keine laufenden Animationen: %d" % an)
    k = pg.evaluate("() => { const i = document.querySelector('.ib-gestalten .ek'); return [i.scrollHeight, i.clientHeight]; }")
    pruefe(k[0] <= k[1] + 1, "Kopf passt in seinen Platz: %s" % k)

    with pg.expect_file_chooser() as fc:
        pg.click("[data-ib='neu-datei']")
    fc.value.set_files(files=[{"name": "Willkommen.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    pg.wait_for_timeout(1500)
    zeilen = pg.evaluate("() => TEST.daten.infoboard.map(z => [z.id, (z.aufbau.teile || []).length])")
    pruefe(sorted(zeilen) == [["empfang", 1], ["haupt", 1]], "eigene Zeile empfang, Infoboard unverändert: %s" % zeilen)
    t = pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'empfang').aufbau.teile[0]")
    pruefe(t["x"] >= 0 and t["x"] + t["w"] <= 1920 and t["y"] >= 330 and t["y"] + t["h"] <= 1080,
           "neues Teil liegt unter dem Kopf auf der Tafel: %s" % {k2: t[k2] for k2 in "xywh"})
    pg.screenshot(path=os.path.join(BILD, "empfang-gestalten.png"))

    pg.click("[data-ib='anzeige']"); pg.wait_for_timeout(1500)
    pruefe(pg.locator("#infoboard [data-ibtafel='empfang']").count() == 1, "Anzeige zeigt den Empfang")
    pg.set_viewport_size({"width": 1920, "height": 1080}); pg.wait_for_timeout(800)
    sk = pg.locator("#infoboard .ib-blatt").bounding_box()
    pruefe(abs(sk["width"] - 1920) < 2 and abs(sk["height"] - 1080) < 2, "bei Full HD genau 1:1: %.0f × %.0f" % (sk["width"], sk["height"]))
    pg.screenshot(path=os.path.join(BILD, "empfang-anzeige.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe(pg.locator("#infoboard").count() == 0, "Escape schliesst die Anzeige")
    # Nachts keine Hühner am Empfang, die Dokumente bleiben
    pg.clock.set_system_time(datetime(heute.year, heute.month, heute.day, 23, 30))
    pg.click("[data-ib='anzeige']"); pg.wait_for_timeout(1500)
    pruefe(pg.locator("#infoboard [data-ib='nacht']").count() == 0 and pg.locator("#infoboard .ib-teil").count() == 1,
           "nachts keine Hühner, Dokumente bleiben")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # App-Paket: ?bildschirm=empfang merkt das Gerät und öffnet die Anzeige,
    # auch mit dem Konto „Infoboard“ (Vermerk am Konto)
    pg.unroute("**/cdn.jsdelivr.net/**")
    PATCH = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { infoboardBildschirm: true };\n"
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=PATCH))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html?bildschirm=empfang", wait_until="domcontentloaded"); pg.wait_for_timeout(3000)
    pruefe(pg.evaluate("() => localStorage.getItem('hofer.empfang.geraet')") == "1", "Gerät als Empfang gemerkt")
    pruefe(pg.locator("#infoboard [data-ibtafel='empfang']").count() == 1, "Empfang geht von selbst auf, nicht das Infoboard")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html?bildschirm=infoboard", wait_until="domcontentloaded"); pg.wait_for_timeout(3000)
    pruefe(pg.evaluate("() => [localStorage.getItem('hofer.empfang.geraet'), localStorage.getItem('hofer.infoboard.geraet')]") == [None, "1"],
           "umgestellt auf Infoboard")
    pruefe(pg.locator("#infoboard [data-ibtafel='haupt']").count() == 1, "dann geht das Infoboard auf")

    # Das App-Paket liegt beim Bau neben der App
    r = pg.request.get(f"http://127.0.0.1:{PORT}/samsung/sssp_config.xml")
    w = pg.request.get(f"http://127.0.0.1:{PORT}/samsung/hoferempfang.wgt")
    pruefe(r.ok and w.ok and ("<size>%d</size>" % len(w.body())) in r.text(), "App-Paket mit richtiger Grösse")
    br.close()

pruefe(not pf, "keine Seitenfehler: %s" % pf)
print("Fehler:", "keine" if not fehler else fehler)
