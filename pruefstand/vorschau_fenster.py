# Vorschau beim Darüberfahren im eigenen Fenster (seit 1.380.0): Knopf
# oben auf der Planwand öffnet ein kleines Browserfenster, das den
# Auftrag unter der Maus zeigt und danach stehen bleibt; in der Planwand
# selbst geht keine Vorschau mehr auf. Fenster zu = wieder wie vorher.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILDER", "")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 950})
    ctx.on("page", lambda pg: pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160])))
    pg = ctx.new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    balken = pg.locator(".pw-balken[data-auftrag]").filter(has_not=pg.locator("xx"))
    sel = [b for b in pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].filter(b => b.getBoundingClientRect().width > 60).map(b => b.dataset.auftrag)")][:2]
    # vorher: Vorschau in der Planwand
    pg.hover(f".pw-balken[data-auftrag='{sel[0]}']"); pg.wait_for_timeout(300)
    if pg.locator(".pw-info").count() != 1: fehler.append("ohne Fenster keine Vorschau in der Planwand")
    pg.mouse.move(5, 5)
    with ctx.expect_page() as neu: pg.click("#pw-vorschaufenster")
    w = neu.value; w.wait_for_selector(".vf-leer")
    print("Fenster offen:", w.title(), "| Knopf an:", pg.get_attribute("#pw-vorschaufenster", "aria-pressed"))
    pg.hover(f".pw-balken[data-auftrag='{sel[0]}']"); pg.wait_for_timeout(400)
    nr1 = w.locator(".pw-info__nr").inner_text()
    print("im Fenster:", nr1, "| in der Planwand:", pg.locator(".pw-info").count())
    if pg.locator(".pw-info").count(): fehler.append("Vorschau trotzdem in der Planwand")
    pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    if not w.locator(".pw-info__nr").count(): fehler.append("Vorschau verschwindet nach dem Wegfahren")
    pg.hover(f".pw-balken[data-auftrag='{sel[1]}']"); pg.wait_for_timeout(400)
    nr2 = w.locator(".pw-info__nr").inner_text()
    print("zweiter Auftrag:", nr2)
    if nr1 == nr2: fehler.append("zweiter Auftrag nicht gezeigt")
    if w.locator(".pw-info").count() != 1: fehler.append("mehrere Vorschauen im Fenster")
    w.set_viewport_size({"width": 300, "height": 520})
    if BILD: w.screenshot(path=os.path.join(BILD, "vorschau-fenster.png"))
    # Neuladen: Fenster wird wieder übernommen
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1200)
    print("nach Neuladen Knopf an:", pg.get_attribute("#pw-vorschaufenster", "aria-pressed"), "| Seiten:", len(ctx.pages))
    if pg.get_attribute("#pw-vorschaufenster", "aria-pressed") != "true": fehler.append("nach Neuladen nicht wieder verbunden")
    pg.hover(f".pw-balken[data-auftrag='{sel[0]}']"); pg.wait_for_timeout(400)
    if pg.locator(".pw-info").count() or w.locator(".pw-info__nr").inner_text() != nr1: fehler.append("nach Neuladen nicht im Fenster")
    # Schliessen des Fensters schaltet aus
    w.close(); pg.wait_for_timeout(1500)
    print("nach Schliessen Knopf:", pg.get_attribute("#pw-vorschaufenster", "aria-pressed"))
    if pg.get_attribute("#pw-vorschaufenster", "aria-pressed") != "false": fehler.append("Knopf bleibt an")
    pg.mouse.move(5, 5); pg.hover(f".pw-balken[data-auftrag='{sel[0]}']"); pg.wait_for_timeout(300)
    if pg.locator(".pw-info").count() != 1: fehler.append("danach keine Vorschau in der Planwand")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
