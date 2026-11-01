# Hallensprint (1.327.0, Wunsch Patrick 1. November 2026): Endlos-Läufer
# auf drei Spuren, Wischen und Tippen steuern.
# Vorlage: Spiele im Pausenraum (1.292.0, Wunsch Patrick 30. Oktober 2026): Kachel
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
    # Nachts und sonntags zeigt der Pausenraum Hühner statt Kacheln: Uhr auf einen Montagvormittag
    pg.add_init_script("""(() => { const O = Date, d = new O(2026, 10, 2, 10, 0).getTime() - O.now();
      class D extends O { constructor(...a) { a.length ? super(...a) : super(O.now() + d); } static now() { return O.now() + d; } }
      window.Date = D; })();""")
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
    pruefe(pg.locator("[data-sp='liste'] .sp-karte").count() >= 7, "Liste mit allen Spielen")
    pg.screenshot(path=BILD + "/spiele-liste.png")

    pg.click("[data-sp='wahl-hallensprint']"); pg.wait_for_timeout(400)
    pg.screenshot(path=BILD + "/hallensprint-start.png")
    pg.click("[data-sp='hs-start']"); pg.wait_for_timeout(300)
    cvl = pg.locator("[data-sp='hallensprint'] canvas"); box = cvl.bounding_box()
    mx, my = box["x"] + box["width"] / 2, box["y"] + box["height"] * 0.6
    def spur(): return pg.evaluate("() => null")
    # Wischen nach links (Finger: Pointer-Ereignisse wie am Touchscreen)
    def wisch(dx, dy):
        cvl.dispatch_event("pointerdown", {"clientX": mx, "clientY": my, "pointerId": 1, "pointerType": "touch"})
        cvl.dispatch_event("pointermove", {"clientX": mx + dx, "clientY": my + dy, "pointerId": 1, "pointerType": "touch"})
        cvl.dispatch_event("pointerup", {"clientX": mx + dx, "clientY": my + dy, "pointerId": 1, "pointerType": "touch"})
    wisch(-120, 0); pg.wait_for_timeout(250)
    pg.screenshot(path=BILD + "/hallensprint-links.png")
    wisch(0, -120); pg.wait_for_timeout(200)
    pg.screenshot(path=BILD + "/hallensprint-sprung.png")
    pg.wait_for_timeout(600)
    wisch(0, 120); pg.wait_for_timeout(150)
    pg.screenshot(path=BILD + "/hallensprint-ducken.png")
    # Tippen rechts aussen wechselt die Spur
    cvl.dispatch_event("pointerdown", {"clientX": box["x"] + box["width"] * 0.9, "clientY": my, "pointerId": 2})
    cvl.dispatch_event("pointerup", {"clientX": box["x"] + box["width"] * 0.9, "clientY": my, "pointerId": 2})
    pg.wait_for_timeout(1500)
    m = int(pg.locator("[data-sp='hs-meter']").inner_text().replace("’", "").replace("'", ""))
    pruefe(m > 20, "Läufer rennt: %d Meter" % m)
    pg.screenshot(path=BILD + "/hallensprint-lauf.png")
    # ohne Ausweichen kracht es irgendwann
    pg.wait_for_selector("[data-sp='hs-start']", timeout=60000)
    pruefe("Feierabend" in pg.locator(".sp-ueber").inner_text(), "Spielende mit Grund: %s" % pg.locator(".sp-ueber").inner_text()[:120])
    pg.screenshot(path=BILD + "/hallensprint-ende.png")
    rek = pg.evaluate("() => localStorage.getItem('hofer.pausenraum.rekord.hallensprint')")
    pruefe(rek and int(rek) > 0, "Rekord gemerkt: %s" % rek)
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()

print("Fehler:", "keine" if not fehler else fehler)
