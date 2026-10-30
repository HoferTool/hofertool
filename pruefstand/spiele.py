# Spiele im Pausenraum (1.292.0, Wunsch Patrick 30. Oktober 2026): Kachel
# mit Inhalt „Spiel“, Liste zur Auswahl, Tic Tac Toe, Klötzli, Hühnerhof,
# Flatterhuhn und Eierschleuder spielbar mit Tippen.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("IB_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1920, "height": 1080})
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/pausenraum'"); pg.wait_for_selector(".ib-gestalten--pausenraum"); pg.wait_for_timeout(1200)

    # Neue Kachel „Spiele“ mit allen Spielen zur Auswahl
    pg.click("[data-ib='neu-kachel']"); pg.wait_for_selector(".dialog-huelle")
    pg.locator(".dialog-huelle input").first.fill("Spiele")
    pg.locator(".dialog-huelle input").nth(1).fill("🎮")
    pg.locator(".dialog-huelle select").last.select_option("spiel")
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(500)
    pruefe(pg.locator(".dialog-huelle select").count() == 1, "Frage: welches Spiel")
    pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1000)
    t = pg.evaluate("() => (TEST.daten.infoboard.find(z => z.id === 'pausenraum') || { aufbau: { teile: [] } }).aufbau.teile[0]")
    pruefe(t and t["inhalt"] == {"art": "spiel", "spiel": "alle"}, "Kachel mit allen Spielen gespeichert: %s" % (t and t.get("inhalt")))
    pruefe("Alle Spiele" in pg.locator("[data-ib='kachel-inhalt']").inner_text(), "Inhalt der Kachel angezeigt")

    pg.click("[data-ib='anzeige']"); pg.wait_for_selector(".ib-voll--pausenraum .ib-kachel"); pg.wait_for_timeout(1000)
    pg.locator(".ib-voll [data-ibkachel='Spiele']").click(); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-sp='liste'] .sp-karte").count() == 5, "Liste mit fünf Spielen")
    pg.screenshot(path=BILD + "/spiele-liste.png")

    # Tic Tac Toe gegen den Computer
    pg.click("[data-sp='wahl-dreigewinnt']"); pg.click("[data-sp='ttt-computer']")
    pg.locator("[data-sp='ttt-4']").dispatch_event("pointerdown"); pg.wait_for_timeout(900)
    belegt = pg.locator(".sp-ttt__zelle--X").count(), pg.locator(".sp-ttt__zelle--O").count()
    pruefe(belegt == (1, 1), "Zug und Gegenzug des Computers: %s" % (belegt,))
    pg.screenshot(path=BILD + "/spiele-ttt.png")
    pg.click("[data-sp='zurueck']")

    # Klötzli
    pg.click("[data-sp='wahl-kloetzli']"); pg.click("[data-sp='kl-start']"); pg.wait_for_timeout(300)
    for k in ["kl-links", "kl-drehen", "kl-fallen", "kl-rechts", "kl-fallen", "kl-fallen"]:
        pg.locator("[data-sp='%s']" % k).dispatch_event("pointerdown"); pg.wait_for_timeout(120)
    pruefe(pg.locator(".sp-kl__z--voll").count() >= 3, "Steine liegen: %d" % pg.locator(".sp-kl__z--voll").count())
    pruefe(int(pg.locator("[data-sp='kl-punkte']").inner_text().replace("'", "").replace("’", "")) > 0, "Punkte fürs Fallenlassen")
    pg.screenshot(path=BILD + "/spiele-kloetzli.png")
    pg.click("[data-sp='zurueck']")

    # Hühnerhof: Huhn läuft und pickt
    pg.click("[data-sp='wahl-huehnerhof']"); pg.click("[data-sp='hof-start']"); pg.wait_for_timeout(2500)
    pruefe(int(pg.locator("[data-sp='hof-punkte']").inner_text()) > 0, "Huhn pickt Körner: %s" % pg.locator("[data-sp='hof-punkte']").inner_text())
    vor = pg.locator("[data-sp='huhn']").evaluate("el => el.style.top")
    pg.locator("[data-sp='hof-hoch']").dispatch_event("pointerdown"); pg.wait_for_timeout(800)
    pg.screenshot(path=BILD + "/spiele-hof.png")
    pg.click("[data-sp='zurueck']")

    # Ausschuss-Jagd: Teile auf den Bändern antippen, schlechte geben Punkte
    pg.click("[data-sp='wahl-flatterhuhn']")
    pruefe(pg.locator(".sp-muster").count() == 4, "Erklärung mit Gutteil, Riss, Rost, Grat")
    pg.screenshot(path=BILD + "/spiele-ausschuss-start.png")
    pg.click("[data-sp='fh-start']")
    getroffen = False
    for i in range(80):
        pg.wait_for_timeout(150)
        cvl = pg.locator("[data-sp='flatterhuhn'] canvas"); box = cvl.bounding_box()
        pt = cvl.evaluate("""c => { const g = c.getContext('2d');
          for (const f of [0.42, 0.64, 0.86]) { const y = Math.round(c.height * f), d = g.getImageData(0, y, c.width, 1).data;
            for (let x = 100; x < c.width - 100; x += 4) { const i = x * 4;
              if (Math.abs(d[i] - 51) < 12 && Math.abs(d[i+1] - 65) < 12 && Math.abs(d[i+2] - 85) < 12) return [x / c.width, y / c.height]; } }
          return null; }""")
        if pt:
            pg.mouse.click(box["x"] + pt[0] * box["width"], box["y"] + pt[1] * box["height"]); pg.wait_for_timeout(100)
            if int(pg.locator("[data-sp='fh-punkte']").inner_text()) > 0: getroffen = True; break
    pruefe(getroffen, "schlechtes Teil angetippt gibt Punkte")
    pg.screenshot(path=BILD + "/spiele-flatterhuhn.png")
    pg.click("[data-sp='zurueck']")

    # Eierschleuder: spannen und schiessen
    pg.click("[data-sp='wahl-eierschleuder']"); pg.click("[data-sp='es-start']"); pg.wait_for_timeout(500)
    eier = pg.locator("[data-sp='es-eier']").inner_text().count("🔩")
    box = pg.locator("[data-sp='eierschleuder'] canvas").bounding_box()
    sx = box["x"] + 230 * box["width"] / pg.locator("[data-sp='eierschleuder'] canvas").evaluate("c => c.width")
    sk = box["height"] / pg.locator("[data-sp='eierschleuder'] canvas").evaluate("c => c.height")
    sy = box["y"] + (pg.locator("[data-sp='eierschleuder'] canvas").evaluate("c => c.height") - 240) * sk
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(sx - 60, sy + 40, steps=5)
    pg.wait_for_timeout(200); pg.screenshot(path=BILD + "/spiele-schleuder.png")
    pg.mouse.move(sx - 140, sy + 90, steps=5); pg.mouse.up(); pg.wait_for_timeout(2500)
    nach = pg.locator("[data-sp='es-eier']").inner_text().count("🔩")
    pruefe(nach == eier - 1, "Drehteil geschossen: %d → %d" % (eier, nach))
    pg.click("[data-ib='gross-zu']"); pg.wait_for_timeout(300)
    pruefe(pg.locator(".ib-voll [data-ib='gross']").count() == 0, "Schliessen schliesst die Spiele")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()

print("Fehler:", "keine" if not fehler else fehler)
