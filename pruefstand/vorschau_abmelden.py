# Vorschau weg beim Abmelden (1.158.1, Wunsch Patrick 23. Oktober 2026:
# „Vorschaufenster nach auslogen immer wegmachen“): Die schwebende
# Vorschau eines Balkens hängt am Seitenende und blieb über der
# Anmeldung stehen. Abmelden räumt sie weg, und danach geht keine mehr auf.
import time, os
from pruefstand import server_starten, FAKE, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=os.environ.get("CHROME_PFAD") or None)
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)

    b = pg.locator(".pw-balken[data-auftrag]").first
    b.scroll_into_view_if_needed(); b.hover(); pg.wait_for_timeout(300)
    pruefe("Vorschau geht beim Darüberfahren auf", pg.locator(".pw-info").count() == 1)

    # Abmelden, während die Maus auf dem Balken bleibt (Escape, dann Enter)
    pg.evaluate("setTimeout(() => window.abmeldenFragen(), 0)"); pg.wait_for_timeout(400)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    pruefe("abgemeldet", pg.locator(".login").count() > 0)
    pruefe("Vorschau nach dem Abmelden weg", pg.locator(".pw-info, .pw-symbolinfo").count() == 0)
    pg.mouse.move(400, 400); pg.mouse.move(800, 300); pg.wait_for_timeout(300)
    pruefe("auch nach Mausbewegung keine Vorschau", pg.locator(".pw-info, .pw-symbolinfo").count() == 0)
    pg.screenshot(path="/tmp/vorschau_abmelden.png")

    # Auch die Leiste der Planwand-Suche bleibt nicht über der Anmeldung
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)
    pg.keyboard.press("Control+f"); pg.wait_for_timeout(500)
    pg.keyboard.type("1"); pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
    pruefe("Suche: Leiste unten offen", pg.locator("#su-leiste").count() == 1)
    pg.evaluate("setTimeout(() => window.abmeldenFragen(), 0)"); pg.wait_for_timeout(400)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
    pruefe("Suche: abgemeldet", pg.locator(".login").count() > 0)
    pruefe("Suche: Leiste weg", pg.locator("#su-leiste").count() == 0)

    # Abmeldung nach einer Minute ohne Bedienung, Maus ruht auf dem Balken
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.clock.install()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = false;")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)
    b = pg.locator(".pw-balken[data-auftrag]").first
    b.scroll_into_view_if_needed(); b.hover(); pg.wait_for_timeout(300)
    pruefe("Leerlauf: Vorschau offen", pg.locator(".pw-info").count() == 1)
    pg.clock.fast_forward(75 * 1000); pg.wait_for_timeout(1500)
    pruefe("Leerlauf: abgemeldet", pg.locator(".login").count() > 0)
    pruefe("Leerlauf: Vorschau weg", pg.locator(".pw-info, .pw-symbolinfo").count() == 0)
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
