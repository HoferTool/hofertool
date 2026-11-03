# Art der Abwesenheit: Wahl im Ferienfenster, Farbe und Text auf der Planwand,
# alte Einträge gelten als Ferien
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
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)

    # Alter Eintrag ohne Art: Ferien vorgewählt
    pg.locator("[data-ferien='f2']").click(); pg.wait_for_timeout(500)
    pruefe("alter Eintrag = Ferien", pg.locator(".fd-art--an").inner_text() == "Ferien")
    pruefe("vier Arten", pg.locator(".fd-art").all_inner_texts() == ["Ferien", "Kompensieren", "Militär/Zivilschutz", "Feuerwehr"])
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    for art, name, kurz in [("feuerwehr", "Feuerwehr", "Feuerwehr"), ("militaer", "Militär/Zivilschutz", "Militär/ZS")]:
        pg.locator("[data-fzelle]").nth(3).click(); pg.wait_for_timeout(400)
        pg.locator(f".fd-art[data-art='{art}']").click()
        pruefe("Titel " + name, pg.inner_text(".dialog-huelle h2") == name + " eintragen")
        pg.fill("#fd-person", "Test " + art)
        if art == "feuerwehr": pg.screenshot(path="/tmp/claude-0/ferien-art-fenster.png")
        pg.locator("#fd-ja").click(); pg.wait_for_timeout(1200)
        neu = pg.evaluate(f"TEST.daten.vacations.find(v => v.person === 'Test {art}') || null")
        pruefe("gespeichert " + art, bool(neu) and neu.get("abwesenheit") == art)
        balken = pg.locator(f"[data-ferien='{neu['id']}']") if neu else None
        pruefe("Balken mit Klasse " + art, bool(neu) and balken.evaluate("e => e.classList.contains('pw-ferien--" + art + "')"))
        pruefe("Balken zeigt " + kurz, bool(neu) and kurz in balken.inner_text())

    # Ändern auf Kompensieren
    nid = pg.evaluate("TEST.daten.vacations.find(v => v.person === 'Test feuerwehr').id")
    pg.locator(f"[data-ferien='{nid}']").click(); pg.wait_for_timeout(500)
    pruefe("Feuerwehr vorgewählt", pg.locator(".fd-art--an").inner_text() == "Feuerwehr")
    pg.locator(".fd-art[data-art='kompensieren']").click()
    pg.locator("#fd-ja").click(); pg.wait_for_timeout(1200)
    pruefe("geändert auf kompensieren", pg.evaluate(f"TEST.daten.vacations.find(v => v.id === '{nid}').abwesenheit") == "kompensieren")
    # Hinweis beim Darüberfahren
    pg.locator(f"[data-ferien='{nid}']").hover(); pg.wait_for_timeout(600)
    pruefe("Hinweis nennt Art", pg.locator(".pw-info--ferien").count() == 1 and "Kompensieren" in pg.inner_text(".pw-info--ferien"))
    pg.screenshot(path="/tmp/claude-0/ferien-art-planwand.png")
    # Ferien-Balken ohne Zusatz
    pruefe("Ferien ohne Zusatz", "·" not in pg.locator("[data-ferien='f2']").inner_text())
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
