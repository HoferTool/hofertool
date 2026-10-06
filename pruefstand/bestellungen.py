# Bestellungen mit React-Hülle: alle Reiter zeigen etwas, ein
# Statuswechsel frischt den Reiter auf (über seiteBestellungen(b) aus
# dem alten Programm) und Escape springt auf „Offen“.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(300)
    if "MTEC-452410" not in pg.inner_text("#best-inhalt"): fehler.append("Position fehlt in Offen")

    for r in ["bestellt", "historie", "artikel", "bezeichnungen", "lieferanten", "offen"]:
        pg.click(f"[data-best='{r}']"); pg.wait_for_timeout(500)
        if pg.locator(f"[data-best='{r}'].aktiv").count() != 1: fehler.append("Reiter nicht aktiv: " + r)
        if pg.locator("#best-inhalt").count() != 1: fehler.append("best-inhalt nicht genau einmal: " + r)
        if "Wird geladen" in pg.inner_text("#best-inhalt"): fehler.append("lädt ewig: " + r)
    if "Vischer" not in pg.inner_text("#best-inhalt"): fehler.append("Lieferant fehlt")

    # Status auf bestellt: die Position verschwindet aus Offen
    pg.click("[data-bstatus='o1']"); pg.click(".dialog-huelle [data-neu='bestellt']")
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.click(".dialog-huelle [data-ja]")
    pg.wait_for_timeout(800)
    if "MTEC-452410" in pg.inner_text("#best-inhalt"): fehler.append("Nach Statuswechsel noch in Offen")
    if pg.locator("h1.seitentitel").count() != 1: fehler.append("Titel doppelt nach Auffrischen")
    pg.click("[data-best='bestellt']"); pg.wait_for_timeout(500)
    if "MTEC-452410" not in pg.inner_text("#best-inhalt"): fehler.append("Nicht in Bestellt")

    # Suche filtert sofort und behält den Fokus
    pg.fill("#bo-suche", "gibtsnicht"); pg.wait_for_timeout(200)
    if "Nichts gefunden" not in pg.inner_text("#best-inhalt"): fehler.append("Suche filtert nicht")
    if pg.evaluate("document.activeElement.id") != "bo-suche": fehler.append("Suchfeld verliert Fokus")
    pg.fill("#bo-suche", "mtec"); pg.wait_for_timeout(200)
    if "MTEC-452410" not in pg.inner_text("#best-inhalt"): fehler.append("Suche findet nichts")
    pg.fill("#bo-suche", "")
    if not pg.locator("[data-bestellpdf]").count(): fehler.append("PDF-Knopf fehlt")

    # Status für alle: zurück auf offen
    pg.click("[data-sammelstatus]"); pg.click(".dialog-huelle [data-w='offen']")
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    if "MTEC-452410" in pg.inner_text("#best-inhalt"): fehler.append("Status für alle wirkt nicht")
    pg.click("[data-best='offen']"); pg.wait_for_timeout(500)

    # Löschen mit genau einer Rückfrage, dann Rückgängig
    pg.click("[data-bweg='o1']")
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.locator(".dialog-huelle [data-ja]").last.click()
    pg.wait_for_timeout(900)
    if pg.locator(".dialog-huelle [data-ja]").count(): fehler.append("Nach dem Löschen kommt noch eine Rückfrage")
    if pg.locator("[data-bweg='o1']").count(): fehler.append("Löschen wirkt nicht")
    pg.click("#rueck-knopf"); pg.wait_for_timeout(800)
    if not pg.locator("[data-bweg='o1']").count(): fehler.append("Rückgängig nach Löschen wirkt nicht")

    # Geliefert setzen: steht dann in der Historie
    pg.click("[data-bstatus='o1']"); pg.click(".dialog-huelle [data-neu='geliefert']")
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    pg.click("[data-best='historie']"); pg.wait_for_timeout(600)
    if not pg.locator("[data-hstatus='o1']").count(): fehler.append("Nicht in der Historie")
    pg.fill("#bh-suche", "zzz"); pg.wait_for_timeout(200)
    if "Nichts gefunden" not in pg.inner_text("#best-inhalt"): fehler.append("Historie-Suche")
    pg.fill("#bh-suche", "")

    # Artikel: Suche mit Verzögerung, Filter nach Bezeichnung
    pg.click("[data-best='artikel']"); pg.wait_for_timeout(600)
    if not pg.locator("[data-arbearb='a1']").count(): fehler.append("Artikel fehlt")
    pg.fill("#ar-suche", "MTEC"); pg.wait_for_timeout(700)
    if not pg.locator("[data-arbearb='a1']").count(): fehler.append("Artikelsuche findet nichts")

    # Lieferanten filtern
    pg.click("[data-best='lieferanten']"); pg.wait_for_timeout(500)
    if pg.locator("[data-lf]").count() != 2: fehler.append("Lieferanten: %d" % pg.locator("[data-lf]").count())
    pg.fill("#lf-suche", "brütsch"); pg.wait_for_timeout(200)
    if pg.locator("[data-lf]").count() != 1: fehler.append("Lieferantensuche")
    pg.fill("#lf-suche", "")

    # Bezeichnung anlegen
    pg.click("[data-best='bezeichnungen']"); pg.wait_for_timeout(500)
    pg.click("#bz-neu"); pg.wait_for_selector(".dialog-huelle input")
    pg.fill(".dialog-huelle input", "Bohrer"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(600)
    if "Bohrer" not in pg.inner_text("#bz-liste"): fehler.append("Bezeichnung nicht angelegt")

    # Escape: vom Unterreiter auf Offen
    pg.click("[data-best='lieferanten']"); pg.wait_for_timeout(400)
    pg.locator("h1").click(); pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    if not pg.locator("[data-best='offen'].aktiv").count(): fehler.append("Escape springt nicht auf Offen")

    # Wechsel weg und wieder her
    pg.evaluate("location.hash='#rechner'"); pg.wait_for_timeout(400)
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_timeout(600)
    if pg.locator("#best-inhalt").count() != 1: fehler.append("nach Rückkehr kaputt")
    pg.screenshot(path="bestellungen.png")
    br.close()
print("Bestellungen | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
