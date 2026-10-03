# Effekte: Markierung gleitet in Navigation und Reitern, Welle beim
# Antippen verschwindet wieder, Lichtstreifen und Eintritt beim
# Seitenwechsel, Licht unter der Maus, Ziffern der Uhr einzeln.
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
    pg = br.new_context(viewport={"width": 1300, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**",
              "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#db-notizen .karte"); pg.wait_for_timeout(900)

    # Navigation: Markierung liegt auf „Start“
    lage = lambda sel: pg.evaluate(f"""() => {{ const n = document.querySelector('{sel}');
        const a = n.querySelector('.aktiv'); const s = getComputedStyle(n, '::before');
        return {{ y: parseFloat(n.style.getPropertyValue('--fx-y')), ay: a.offsetTop,
                  x: parseFloat(n.style.getPropertyValue('--fx-x')), ax: a.offsetLeft,
                  sicht: s.opacity, bereit: n.classList.contains('fx-gleit--bereit') }}; }}""")
    l = lage(".nav")
    pruefe("Navigation: Markierung auf dem aktiven Punkt", l["y"] == l["ay"] and l["sicht"] == "1" and l["bereit"])
    pruefe("Uhr in einzelnen Ziffern", pg.locator("#uhr .fx-ziffer").count() == 5 and ":" in pg.inner_text("#uhr"))

    # Seitenwechsel: Lichtstreifen und Eintritt, Markierung gleitet
    pg.click(".nav__punkt[data-nav='produktion']")
    pg.wait_for_timeout(60)
    pruefe("Lichtstreifen läuft", pg.evaluate("document.querySelector('.kopf').classList.contains('fx-glanz')"))
    pruefe("Seite kommt herein", pg.evaluate("document.getElementById('inhalt').classList.contains('fx-seite')"))
    zwischen = pg.evaluate("getComputedStyle(document.querySelector('.nav'), '::before').transform")
    pg.wait_for_timeout(1100)
    l = lage(".nav")
    ende = pg.evaluate("getComputedStyle(document.querySelector('.nav'), '::before').transform")
    pruefe("Navigation: Markierung gleitet (Zwischenstand anders als Ende)", zwischen != ende)
    pruefe("Navigation: Markierung am neuen Punkt", l["y"] == l["ay"])
    pruefe("Klassen nach dem Wechsel wieder weg", pg.evaluate(
        "!document.querySelector('.kopf').classList.contains('fx-glanz') && !document.getElementById('inhalt').classList.contains('fx-seite')"))

    # Reiter
    pg.wait_for_selector(".reiter.fx-gleit")
    l = lage(".reiter")
    pruefe("Reiter: Markierung auf dem aktiven Reiter", l["x"] == l["ax"] and l["sicht"] == "1")
    pg.locator(".reiter__knopf").nth(1).click(); pg.wait_for_timeout(700)
    l = lage(".reiter")
    pruefe("Reiter: Markierung folgt dem Wechsel", l["x"] == l["ax"] and l["x"] > 0)

    # Welle beim Antippen, danach wieder weg
    k = pg.locator(".reiter__knopf").nth(0)
    b = k.bounding_box(); pg.mouse.move(b["x"] + 10, b["y"] + 10); pg.mouse.down()
    pruefe("Welle erscheint", pg.locator(".fx-welle").count() == 1)
    pg.mouse.up(); pg.wait_for_timeout(1000)
    pruefe("Welle wieder weg", pg.locator(".fx-welle").count() == 0)

    # Licht unter der Maus auf einer Karte der Startseite
    pg.click(".nav__punkt[data-nav='dashboard']"); pg.wait_for_selector(".karte--klickbar"); pg.wait_for_timeout(900)
    kk = pg.locator(".karte--klickbar").first; kk.scroll_into_view_if_needed()
    b = kk.bounding_box(); pg.mouse.move(b["x"] + 40, b["y"] + 20); pg.mouse.move(b["x"] + 50, b["y"] + 22)
    pg.wait_for_timeout(100)
    mx = kk.evaluate("e => e.style.getPropertyValue('--fx-mx')")
    pruefe("Licht folgt der Maus", mx == "50px")

    # Planwand: kein Lichtstreifen-Rest, Puls an der Heute-Linie
    pg.click(".nav__punkt[data-nav='planwand']"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1200)
    pruefe("Heute-Linie pulsiert", pg.evaluate(
        "(() => { const h = document.querySelector('.pw-heutelinie'); return !!h && getComputedStyle(h, '::after').animationName === 'fx-puls'; })()"))
    pruefe("Kopfzeile ohne Unschärfe auf der Planwand", pg.evaluate(
        "getComputedStyle(document.querySelector('.kopf')).backdropFilter") in ("none", ""))
    br.close()
print("Effekte | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
