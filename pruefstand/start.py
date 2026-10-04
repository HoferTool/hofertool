# Startseite in React: Karten stehen, Notiz anlegen, abhaken mit
# Rückfrage und Rückgängig, Karte führt in ihren Bereich, und Pad Mode
# öffnen und schliessen lässt keine Fehler zurück (das Pad leert den
# Bereich unter sich, in dem React zeichnet).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1300,"height":900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#db-notizen .karte"); pg.wait_for_timeout(1200)
    for teil in ["uhr", "wetter", "db-solar", "db-probleme", "db-einkauf", "db-status", "db-geburtstage"]:
        if not pg.locator("#" + teil).count(): fehler.append("fehlt: " + teil)
    # Reihenfolge (Wunsch 4. Oktober 2026): Probleme, Bestellungen, Notizen, Einkauf, Geburtstage
    folge = pg.evaluate("""() => ['db-probleme','db-status','db-notizen','db-einkauf','db-geburtstage']
        .map(id => document.getElementById(id)).every((el, i, a) => !i || (a[i-1].compareDocumentPosition(el) & 4))""")
    if not folge: fehler.append("Reihenfolge der Karten falsch")
    # Die Vorbereitung gibt es nicht mehr, an ihrer Stelle stehen die Probleme
    if pg.locator("#db-vorbereitung").count(): fehler.append("Vorbereitung noch da")
    if "Material fehlt" not in pg.inner_text("#db-probleme"): fehler.append("Problem fehlt")
    pg.screenshot(path="start_problem.png")
    pg.locator("[data-probweg]").first.click(); pg.click(".dialog-huelle [data-ja]")
    pg.wait_for_timeout(400); pg.click(".dialog-huelle [data-ja]")
    pg.wait_for_selector("#db-probleme .problemleer", timeout=5000)
    if "Keine Probleme" not in pg.inner_text("#db-probleme"): fehler.append("Leere Problemkarte ohne Text")
    if pg.locator("#db-vorbereitung").count(): fehler.append("Vorbereitung nach Erledigt da")
    if ":" not in pg.inner_text("#uhr"): fehler.append("Uhr leer")
    if "nicht verfügbar" not in pg.inner_text("#wetter"): fehler.append("Wetter ohne Ersatztext")

    # Notiz anlegen, abhaken, zurücknehmen
    pg.click("#notiz-neu"); pg.wait_for_selector(".dialog-huelle textarea")
    pg.fill(".dialog-huelle textarea", "Späne leeren <i>"); pg.click(".dialog-huelle [data-ja]")
    pg.wait_for_timeout(600)
    if "Späne leeren <i>" not in pg.inner_text("#db-notizen"): fehler.append("Notiz fehlt")
    n = pg.locator("[data-erledigt]").count()
    pg.locator("[data-erledigt]").last.click(); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(600)
    if pg.locator("[data-erledigt]").count() != n - 1: fehler.append("Abhaken wirkt nicht")
    pg.click("#rueck-knopf"); pg.wait_for_timeout(700)
    if pg.locator("[data-erledigt]").count() != n: fehler.append("Rückgängig wirkt nicht")
    pg.screenshot(path="start.png", full_page=True)

    # Karte führt in den Bereich
    pg.click("#db-status h2"); pg.wait_for_timeout(600)
    if "bestellungen" not in pg.evaluate("location.hash"): fehler.append("Karte führt nicht zu Bestellungen")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_selector("#db-notizen .karte")

    # Pad Mode öffnen und schliessen
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1300)
    pg.locator("#pad [data-padzu]").click(); pg.wait_for_timeout(1300)
    if not pg.locator("#db-notizen .karte").count(): fehler.append("Startseite nach dem Pad nicht zurück")
    br.close()
print("Start | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
