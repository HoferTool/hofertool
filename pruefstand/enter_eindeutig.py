# Wunsch 5. Oktober 2026: Enter öffnet eindeutige Treffer (Suche über alles,
# HOCO Nummern, Planwand-Suche), Zeichnungs Nr. ist aus der Oberfläche weg,
# die Kopfzeile ist beim Scrollen deckend.
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
    for breite, hoehe in [(1440, 900), (390, 800)]:
        pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
        for dunkel in [False, True]:
            pg.evaluate("(d) => document.body.classList.toggle('dunkel', d)", dunkel)
            pg.evaluate("window.scrollTo(0, 400)"); pg.wait_for_timeout(200)
            s = pg.evaluate("""() => { const c = getComputedStyle(document.querySelector('.kopf'));
              return [c.backgroundColor, c.backdropFilter || c.webkitBackdropFilter || 'none']; }""")
            deckend = not s[0].startswith("rgba") and s[0] != "transparent" and s[1] in ("none", "")
            pruefe(f"{breite}px {'dunkel' if dunkel else 'hell'}: Kopfzeile deckend {s}", deckend)
        pg.evaluate("document.body.classList.remove('dunkel'); window.scrollTo(0, 0)")
        pruefe("Logo ist der Neuladen-Knopf", pg.evaluate("""() => { const b = document.querySelector('.kopf__logolink');
          return !!b && b.tagName === 'BUTTON' && b.id === 'kopf-neuladen' && !b.closest('a'); }"""))
        pg.evaluate("window.__vorNeuladen = 1")
        pg.click(".kopf__logolink"); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
        pruefe("Klick aufs Logo lädt neu", pg.evaluate("window.__vorNeuladen === undefined") and len(pg.context.pages) == 1)
        if breite < 800:
            pg.close(); continue

        # Suche über alles: ganze HOCO Nr. + Enter öffnet das Teil
        pg.keyboard.press("Control+k"); pg.wait_for_timeout(400)
        pg.keyboard.type("10000-0301"); pg.wait_for_timeout(400)
        pruefe("HOCO-Treffer ist markiert", "▣" in pg.inner_text(".suche-alles__treffer.aktiv"))
        pg.keyboard.press("Enter"); pg.wait_for_timeout(2500)
        txt = pg.evaluate("[...document.querySelectorAll('.dialog-huelle')].map(d => d.innerText).join(' ')")
        pruefe("HOCO-Teil offen", "Produktionsanlage" in txt and "10000-0301" in txt)
        pruefe("keine Zeichnungs Nr. im Teil", "Zeichnungs Nr" not in txt and "416.4638.01" not in txt)
        # Bearbeiten-Fenster ohne Zeichnungs Nr.
        pg.click("#hoco-bearb"); pg.wait_for_timeout(500)
        txt = pg.evaluate("[...document.querySelectorAll('.dialog-huelle')].map(d => d.innerText).join(' ')")
        pruefe("Bearbeiten ohne Zeichnungs Nr.", "HOCO Nr. bearbeiten" in txt and "Zeichnungs Nr" not in txt)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

        # HOCO Nummern: zurück zur Übersicht, Nummer eintippen, Enter
        if pg.locator("#hoco-zurueck").count() == 0:
            pg.keyboard.press("Control+k"); pg.wait_for_timeout(400)
            pg.keyboard.type("10000-0301"); pg.wait_for_timeout(300)
            pg.keyboard.press("Enter"); pg.wait_for_timeout(2000)
        pg.click("#hoco-zurueck"); pg.wait_for_timeout(500)
        pg.fill("#hoco-such", "10000-0301"); pg.wait_for_timeout(300)
        pg.press("#hoco-such", "Enter"); pg.wait_for_timeout(600)
        pruefe("HOCO-Suche: Enter öffnet das Teil", pg.locator("#hoco-bearb").count() == 1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
        while pg.locator(".dialog-huelle").count():
            pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

        # Planwand-Suche: ein einziger Treffer öffnet das Auftragsfenster
        jid = pg.evaluate("""() => { const j = TEST.daten.planwand.find(j => j.planned_from);
          j.plan_note = 'Einzigartig4711'; return j.id; }""")
        pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(400)
        pg.fill("#su-text", "Einzigartig4711"); pg.press("#su-text", "Enter"); pg.wait_for_timeout(1500)
        pruefe("ein Treffer: Auftragsfenster offen", pg.locator(".dialog--auftrag").count() == 1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
        pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(400)
        pg.fill("#su-text", "Tornos"); pg.press("#su-text", "Enter"); pg.wait_for_timeout(1500)
        pruefe("mehrere Treffer: kein Fenster, Leiste", pg.locator(".dialog--auftrag").count() == 0
               and "Treffer 1 von" in pg.inner_text(".su-leiste__text"))
        pg.screenshot(path="/tmp/enter_planwand.png")
        pg.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
