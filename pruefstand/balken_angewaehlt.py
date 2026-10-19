# Der zuletzt angeklickte Balken bleibt markiert: nach Schliessen von
# Zeichnung und Auftragsfenster, nach Neuzeichnen und Neuladen; ein
# Klick auf einen anderen Balken verschiebt die Markierung.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 950})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    ids = pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].filter(b => b.getBoundingClientRect().width > 40).map(b => b.dataset.auftrag)")
    a, b2 = ids[0], ids[1]
    markiert = lambda: pg.evaluate("[...document.querySelectorAll('.pw-balken--angewaehlt')].map(b => b.dataset.auftrag)")
    def zu():
        for _ in range(3):
            if not pg.locator(".dialog-huelle, .betrachter").count(): break
            pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
        pg.wait_for_timeout(800)
    if markiert(): fehler.append("am Anfang schon markiert")
    pg.locator(f".pw-balken[data-auftrag='{a}']").first.click(); pg.wait_for_timeout(900); zu()
    if markiert() != [a]: fehler.append(f"nach Klick und Schliessen: {markiert()}")
    pg.locator(f".pw-balken[data-auftrag='{a}']").first.dblclick(); pg.wait_for_timeout(900)
    if not pg.locator(".dialog--auftrag").count(): fehler.append("Doppelklick öffnet kein Auftragsfenster")
    zu()
    if markiert() != [a]: fehler.append(f"nach Auftragsfenster: {markiert()}")
    # Bearbeiten und Speichern: bleibt markiert (1.100.1)
    pg.locator(f".pw-balken[data-auftrag='{a}']").first.dblclick(); pg.wait_for_timeout(900)
    if pg.locator("#pl-notiz").count(): pg.fill("#pl-notiz", "geändert")
    pg.locator(".dialog--auftrag button:has-text('Speichern')").first.click(); pg.wait_for_timeout(1800)
    if pg.locator(".dialog--auftrag").count(): fehler.append("Fenster nach Speichern noch offen")
    if markiert() != [a]: fehler.append(f"nach Speichern: {markiert()}")
    pg.screenshot(path="/tmp/claude-0/angewaehlt.png")
    pg.locator(".pw-balken[data-auftrag='%s']" % b2).first.click(); pg.wait_for_timeout(900); zu()
    if markiert() != [b2]: fehler.append(f"anderer Balken: {markiert()}")
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1200)
    if markiert() != [b2]: fehler.append(f"nach Neuladen: {markiert()}")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
