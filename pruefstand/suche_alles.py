# Suche über alles (Strg + K) und Suche auf der Planwand: öffnen, tippen,
# mit den Pfeiltasten wählen, springen, Leiste unten bedienen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)

    pg.keyboard.press("Control+k"); pg.wait_for_timeout(500)
    pruefe("Strg + K öffnet die Suche", pg.locator(".suche-alles").count() == 1)
    pruefe("Feld hat den Fokus", pg.evaluate("document.activeElement && document.activeElement.id") == "suche-alles-feld")
    pg.keyboard.type("1"); pg.wait_for_timeout(300)
    pruefe("ein Zeichen: Hinweis", "zwei Zeichen" in pg.inner_text("#suche-alles-liste"))
    pg.keyboard.type("0007"); pg.wait_for_timeout(400)
    n = pg.locator("[data-treffer]").count()
    pruefe("Treffer zu 10007 (" + str(n) + ")", n > 0)
    pruefe("Gruppe Aufträge", "aufträge" in pg.inner_text("#suche-alles-liste").lower())
    pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(150)
    pruefe("Pfeil runter markiert den zweiten", n < 2 or pg.get_attribute(".suche-alles__treffer.aktiv", "data-treffer") == "1")
    pg.keyboard.press("ArrowUp"); pg.wait_for_timeout(150)
    nr = pg.inner_text(".suche-alles__treffer.aktiv b")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(2500)
    pruefe("Enter schliesst die Suche", pg.locator(".suche-alles").count() == 0)
    pruefe("auf der Planwand", "planwand" in pg.evaluate("location.hash"))
    pruefe("Auftragsfenster zu " + nr, nr in pg.evaluate("[...document.querySelectorAll('.dialog-huelle')].map(d => d.innerText).join(' ')"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    pg.keyboard.press("Control+k"); pg.wait_for_timeout(400)
    pg.keyboard.type("xyzxyz"); pg.wait_for_timeout(300)
    pruefe("nichts gefunden", "Nichts gefunden" in pg.inner_text("#suche-alles-liste"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Escape schliesst", pg.locator(".suche-alles").count() == 0)

    # Suche auf der Planwand mit Zeitraum „Ab Datum“
    pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(400)
    pruefe("Planwand-Suche offen, Fokus im Feld", pg.evaluate("document.activeElement && document.activeElement.id") == "su-text")
    pg.locator("[data-suzeit='datum']").click(); pg.wait_for_timeout(150)
    pruefe("Datum erscheint mit heute", pg.is_visible("#su-datum") and pg.input_value("#su-datum") != "")
    pg.locator("[data-suzeit='alle']").click()
    pruefe("Datum wieder weg", not pg.is_visible("#su-datum"))
    pg.fill("#su-text", ""); pg.locator("#su-ja").click(); pg.wait_for_timeout(300)
    pruefe("leer: Fenster bleibt offen", pg.locator("#su-text").count() == 1)
    pg.fill("#su-text", "Tornos"); pg.press("#su-text", "Enter"); pg.wait_for_timeout(1200)
    text = pg.evaluate("(document.querySelector('.su-leiste__text')||{}).textContent || ''")
    pruefe("Leiste zeigt Treffer: " + text, "Treffer 1 von" in text)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
    pruefe("Enter: Treffer 2", "Treffer 2 von" in pg.inner_text(".su-leiste__text"))
    pg.keyboard.press("Shift+Enter"); pg.wait_for_timeout(800)
    pruefe("Umschalt + Enter: zurück", "Treffer 1 von" in pg.inner_text(".su-leiste__text"))
    pruefe("Treffer hervorgehoben", pg.locator(".pw-balken--treffer").count() >= 1)
    pg.locator("#su-ende").click(); pg.wait_for_timeout(400)
    pruefe("Suche beendet: Leiste weg", pg.locator("#su-leiste").count() == 0)
    pruefe("nichts mehr blass", pg.locator(".pw-balken--blass").count() == 0)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
