# Planwand (Wunsch 4. Oktober 2026): Nach dem Ziehen an einem Schieber
# bleibt er nicht ausgewählt, die Taste H springt danach zu heute.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1000)

    def ziehen(sel, anteil_von, anteil_bis):
        box = pg.locator(sel).bounding_box()
        y = box["y"] + box["height"] / 2
        pg.mouse.move(box["x"] + box["width"] * anteil_von, y)
        pg.mouse.down()
        pg.mouse.move(box["x"] + box["width"] * anteil_bis, y, steps=8)
        pg.mouse.up()
        pg.wait_for_timeout(400)

    for sel in ["#pw-zeit", "#pw-regler", "#pw-hoehe"]:
        ziehen(sel, 0.5, 0.6)
        pruefe("nach Ziehen nicht mehr ausgewählt: " + sel,
               pg.evaluate("document.activeElement === null || document.activeElement.type !== 'range'"))

    # Zeitregler weit nach rechts, dann H: Regler muss zurück auf heute
    ziehen("#pw-zeit", 0.5, 0.95); pg.wait_for_timeout(500)
    weg = pg.evaluate("Number(document.getElementById('pw-zeit').value)")
    pg.keyboard.press("h"); pg.wait_for_timeout(900)
    zurueck = pg.evaluate("Number(document.getElementById('pw-zeit').value)")
    pruefe("H springt nach dem Ziehen zu heute (%s -> %s)" % (weg, zurueck), zurueck < weg - 20)

    # Auch wenn ein Schieber noch Fokus hat (z. B. per Tab), geht H
    ziehen("#pw-zeit", 0.5, 0.95); pg.wait_for_timeout(300)
    pg.focus("#pw-zeit"); weg = pg.evaluate("Number(document.getElementById('pw-zeit').value)")
    pg.keyboard.press("h"); pg.wait_for_timeout(900)
    zurueck = pg.evaluate("Number(document.getElementById('pw-zeit').value)")
    pruefe("H geht auch mit Fokus auf dem Schieber", zurueck < weg - 20)

    # Im Zahlfeld bleibt H ein Buchstabe, kein Sprung
    ziehen("#pw-zeit", 0.5, 0.95); weg = pg.evaluate("Number(document.getElementById('pw-zeit').value)")
    zahl = pg.locator(".pw-kopfleiste input[type=number]").first
    if zahl.count():
        zahl.focus(); pg.keyboard.press("h"); pg.wait_for_timeout(600)
        pruefe("H im Zahlfeld springt nicht", pg.evaluate("Number(document.getElementById('pw-zeit').value)") == weg)
    print("Fehler:", fehler if fehler else "keine")
    br.close()
