# HOFERCAM (seit 1.582.0): Platz 34, T3400 oder T3421–T3423 montiert;
# seit 1.591.0 Vorgabe T3400 und Erklärungsbild Abstecher; seit 1.584.0 zeigt das Maschinenbild nur die montierte Einheit
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
S = "/tmp/claude-0/-home-user/e193e6f8-e4d3-5775-9ccb-4db292d1b235/scratchpad/"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    pruefe("Vorgabe T3400", pg.input_value("[data-cam='t34']") == "3400")
    pruefe("Knopf Frontangetrieben bei T3400 weg", pg.locator("#cam-neu-quer").count() == 0)
    pg.select_option("[data-cam='t34']", "3421")
    pruefe("Knopf Frontangetrieben da", pg.locator("#cam-neu-quer").count() == 1)
    pg.click("#cam-neu-quer")
    pruefe("T342x-Block ok", pg.locator("[data-camblock-nichtmontiert]").count() == 0)
    pg.select_option("[data-cam='t34']", "3400")
    pruefe("Knopf Frontangetrieben weg", pg.locator("#cam-neu-quer").count() == 0)
    pruefe("T342x-Block nicht montiert", pg.locator("[data-camblock-nichtmontiert]").count() == 1)
    # neuer Querblock: bis T3400 möglich
    pg.click("#cam-neu-seite")
    pg.hover("[data-block='1'] [data-camblock-platzfeld]"); pg.wait_for_timeout(300)
    href = pg.get_attribute("#cam-bild image", "href") if pg.locator("#cam-bild image").count() else ""
    pruefe("Maschinenbild ohne T3421–T3423", "star-sb20rg-ohne34e.png" in (href or ""))
    pg.locator("#cam-bild").screenshot(path=S + "bild_t3400.png")
    pg.select_option("[data-cam='t34']", "3421")
    pg.hover("[data-block='1'] [data-camblock-platzfeld]"); pg.wait_for_timeout(300)
    href = pg.get_attribute("#cam-bild image", "href") if pg.locator("#cam-bild image").count() else ""
    pruefe("Maschinenbild mit T3421–T3423", (href or "").endswith("star-sb20rg.png"))
    pg.locator("#cam-bild").screenshot(path=S + "bild_t3421.png")
    # seit 1.654.2: Bild bei Maus über Platz 34
    pg.hover("[data-cam-t34feld]"); pg.wait_for_timeout(300)
    pruefe("Bild bei Platz 34 (T3421)", pg.locator("#cam-bild[data-gruppe='t34'][data-bereiche='6']").count() == 1)
    pg.select_option("[data-cam='t34']", "3400"); pg.hover("[data-cam-t34feld]"); pg.wait_for_timeout(300)
    pruefe("Bild bei Platz 34 (T3400)", pg.locator("#cam-bild[data-gruppe='t34'][data-bereiche='1']").count() == 1)
    pg.locator("#cam-bild").screenshot(path=S + "bild_platz34.png")
    # seit 1.654.3: Frontwerkzeuge zur Hauptspindel sichtbar, nicht gestrichelt
    pg.hover("#cam-neu-front"); pg.wait_for_timeout(300)
    pruefe("Frontwerkzeuge Hauptspindel sichtbar", pg.locator("#cam-bild .cam-bild__rahmen--verdeckt").count() == 0 and pg.locator("#cam-bild .cam-bild__rahmen").count() == 8)
    pg.locator("#cam-bild").screenshot(path=S + "bild_front3400.png")
    pg.select_option("[data-cam='t34']", "3421")
    pruefe("Nach Rückwechsel T342x wieder ok", pg.locator("[data-camblock-nichtmontiert]").count() == 0)
    # seit 1.591.0: Erklärungsbild zum Abstecher
    pruefe("Abstecherbild erst beim Darüberfahren", pg.locator("[data-cam-abbild-feld]").count() == 0)
    pg.hover("[data-cam='abArt']"); pg.wait_for_timeout(200)
    pruefe("Abstecherbild normal", pg.locator("[data-cam-abbild='normal']").count() == 1)
    pg.locator("[data-cam-abbild-feld]").screenshot(path=S + "ab_normal.png")
    pg.select_option("[data-cam='abArt']", "versetzt"); pg.hover("[data-cam='abArt']"); pg.wait_for_timeout(200)
    pruefe("Abstecherbild versetzt", pg.locator("[data-cam-abbild='versetzt']").count() == 1)
    pg.fill("[data-cam='B']", "2"); pg.click("[data-cam='abVersatz']"); pg.wait_for_timeout(200)
    pruefe("Bild bei Schreibmarke im Versatz", pg.locator("[data-cam-abbild='versetzt']").count() == 1)
    pruefe("Bild nennt Z-8. (Vorgabe 10 − B 2)", "Z-8" in pg.locator("[data-cam-abbild-feld]").inner_text())
    pg.locator("[data-cam-abbild-feld]").screenshot(path=S + "ab_versetzt.png")
    pg.mouse.move(5, 5); pg.click("#cam-kanaele", position={"x": 5, "y": 5}); pg.wait_for_timeout(200)
    pruefe("Bild wieder weg", pg.locator("[data-cam-abbild-feld]").count() == 0)
    pg.wait_for_timeout(800); print(pg.locator("#cam-kanaele").count(), pg.evaluate("document.querySelector('#rech-inhalt')?.innerText.slice(0,300)"))
    pg.screenshot(path=S + "t34.png")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
