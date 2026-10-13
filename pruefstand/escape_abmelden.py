# Wunsch Patrick 13. Oktober 2026: Escape ohne offenes Fenster, Suche
# oder Ebene zum Zurückgehen fragt, ob man sich abmelden will; Enter
# bestätigt und meldet ab. Offene Fenster und Suche schliesst Escape
# weiterhin nur, ohne zu fragen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    fenster = lambda: pg.locator(".dialog-huelle").count()
    titel = lambda: pg.evaluate("() => { const h = document.querySelector('.dialog-huelle h2'); return h ? h.textContent : ''; }")
    leer = lambda: pg.locator("body").click(position={"x": 700, "y": 5})

    # Fenster offen: Escape schliesst nur, fragt nicht
    pg.keyboard.press("Control+k"); pg.wait_for_timeout(700)
    pruefe("Suche über alles offen", fenster() >= 1)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
    pruefe("Fenster zu, keine Abmelde-Frage", fenster() == 0)

    # Nichts offen: Frage erscheint, Escape schliesst sie wieder
    leer(); pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
    pruefe(f"Frage Abmelden erscheint ({titel()!r})", fenster() == 1 and titel() == "Abmelden")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
    pruefe("Escape schliesst die Frage, angemeldet bleibt", fenster() == 0 and pg.locator("#inhalt").count() == 1)

    # Planwand mit laufender Suche: Escape beendet nur die Suche
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(400)
    pg.fill("#su-text", "Star SR3"); pg.locator("#su-ja").click(); pg.wait_for_timeout(1500)
    pruefe("Suche läuft mit Leiste", pg.locator(".su-leiste").count() == 1)
    pg.locator("#su-weiter").click(); pg.wait_for_timeout(800)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    pruefe("Suche beendet, keine Abmelde-Frage", pg.locator(".su-leiste").count() == 0 and fenster() == 0)

    # Nichts offen: Escape, dann Enter meldet ab
    leer(); pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
    pruefe("Frage erscheint auf der Planwand", titel() == "Abmelden")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(2000)
    pruefe("Enter meldet ab (Anmeldeseite)", pg.locator("#inhalt").count() == 0 and fenster() == 0)
    # Auf der Anmeldeseite fragt Escape nichts
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pruefe("Auf der Anmeldeseite keine Frage", fenster() == 0)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
