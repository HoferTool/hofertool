# Pause für alle Spiele im Pausenraum (1.493.0, Wunsch Patrick 12. November 2026):
# Knopf „Pause“ und Taste P halten jedes Spiel an, „Weiter“ geht dort weiter.
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

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1920, "height": 1080})
    pg = ctx.new_page()
    # Werktag 10 Uhr, sonst zeigt die Anzeige nachts und sonntags die Hühner
    heute = datetime.now()
    pg.clock.set_system_time(datetime(heute.year, heute.month, heute.day, 10, 0) + timedelta(days=(2 - heute.weekday()) % 7))
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

    pg.click("[data-ib='anzeige']"); pg.wait_for_timeout(1200)
    # Sonntags und nachts ruht die Anzeige: ein Tipp zeigt die Kacheln
    if pg.locator(".ib-voll .ib-nacht").count(): pg.mouse.click(960, 800); pg.wait_for_timeout(800)
    pg.wait_for_selector(".ib-voll--pausenraum .ib-kachel"); pg.wait_for_timeout(600)
    pg.locator(".ib-voll [data-ibkachel='Spiele']").click(); pg.wait_for_timeout(800)
    def stand_kl():
        return pg.evaluate("() => [...document.querySelectorAll('.sp-kl__z')].map(e => e.className.includes('voll') ? 1 : 0).join('')")

    # Materiallager: in der Pause fällt nichts
    pg.click("[data-sp='wahl-kloetzli']"); pg.click("[data-sp='kl-start']"); pg.wait_for_timeout(400)
    pg.locator("[data-sp='pause']").dispatch_event("pointerdown"); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-sp='pause-schleier']").count() == 1, "Pause-Schleier über dem Spiel")
    a = stand_kl(); pg.wait_for_timeout(2000); b = stand_kl()
    pruefe(a == b, "Materiallager steht in der Pause")
    pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(200)
    pruefe(stand_kl() == b, "Pfeiltasten wirken in der Pause nicht")
    pg.screenshot(path=BILD + "/spiele-pause.png")
    pg.click("[data-sp='weiter']"); pg.wait_for_timeout(1800)
    pruefe(stand_kl() != b, "Nach Weiter fällt der Stein wieder")
    pg.keyboard.press("p"); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-sp='pause-schleier']").count() == 1, "Taste P pausiert")
    pg.keyboard.press("P"); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-sp='pause-schleier']").count() == 0, "Taste P geht weiter")
    pg.click("[data-sp='zurueck']")

    # Hallensprint: Meter bleiben stehen
    pg.click("[data-sp='wahl-hallensprint']"); pg.click("[data-sp='hs-start']"); pg.wait_for_timeout(800)
    pg.keyboard.press("p"); pg.wait_for_timeout(200)
    a = pg.evaluate("() => TEST.hallensprint.weg"); pg.wait_for_timeout(1500); b = pg.evaluate("() => TEST.hallensprint.weg")
    pruefe(a == b and a > 0, "Hallensprint steht in der Pause (%.1f / %.1f)" % (a, b))
    pg.keyboard.press("p"); pg.wait_for_timeout(600)
    pruefe(pg.evaluate("() => TEST.hallensprint.weg") > b, "Hallensprint läuft nach Weiter")
    pg.click("[data-sp='zurueck']")

    # Ausschuss-Jagd: die 90 Sekunden laufen in der Pause nicht ab
    pg.click("[data-sp='wahl-flatterhuhn']"); pg.click("[data-sp='fh-start']"); pg.wait_for_timeout(1200)
    pg.locator("[data-sp='pause']").dispatch_event("pointerdown")
    txt = lambda: pg.locator("[data-sp='flatterhuhn']").inner_text()
    pg.wait_for_timeout(300); a = txt(); pg.wait_for_timeout(2500)
    pg.locator("[data-sp='pause']").dispatch_event("pointerdown"); pg.wait_for_timeout(150)
    b = txt()
    import re
    za = re.findall(r"Zeit\s*(\d+)", a); zb = re.findall(r"Zeit\s*(\d+)", b)
    pruefe(za and zb and abs(int(za[0]) - int(zb[0])) <= 1, "Uhr der Ausschuss-Jagd steht in der Pause (%s / %s)" % (za, zb))
    pg.click("[data-sp='zurueck']")

    # Kugellager und Späneschleuder: Knopf da, Schleier geht
    for sp in ["kugellager", "eierschleuder", "palette", "dreigewinnt", "huehnerhof"]:
        pg.click("[data-sp='wahl-%s']" % sp); pg.wait_for_timeout(300)
        pg.locator("[data-sp='pause']").dispatch_event("pointerdown"); pg.wait_for_timeout(150)
        pruefe(pg.locator("[data-sp='pause-schleier']").count() == 1, "Pause bei %s" % sp)
        pg.click("[data-sp='zurueck']")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
