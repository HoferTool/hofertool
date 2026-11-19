# Archiv erledigter Probleme (seit 1.634.0; seit 1.645.0 nur im Planer unter
# „Abgeschlossen“, kein Knopf mehr auf der Planwand),
# Liste mit Suche, Sprung zum Balken, Hinweis im Auftragsfenster,
# Admin löscht mit Rückgängig, Externe sehen den Knopf nicht
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
SP = "/tmp/claude-0/-home-user/bdf20526-2f4d-5670-9317-99440e53d666/scratchpad/"
DAZU = """
TEST.daten.problem_archiv = [
  { id: "pa1", job_id: "j1", machine_id: TEST.daten.jobs[0].machine_id, job_number: TEST.daten.jobs[0].job_number,
    fa_nr: "2026-1111", problem: "Stange klemmt im Lader", gemeldet_am: "2026-11-10T07:12:00Z", gemeldet_name: "Tristan Ecker",
    erledigt_am: "2026-11-10T09:40:00Z", erledigt_name: "Patrick Ruch", ersetzt: false },
  { id: "pa2", job_id: "j2", machine_id: TEST.daten.jobs[1].machine_id, job_number: TEST.daten.jobs[1].job_number,
    fa_nr: null, problem: "Zeichnung fehlt", gemeldet_am: "2026-11-01T07:00:00Z", gemeldet_name: "Max",
    erledigt_am: "2026-11-05T09:00:00Z", erledigt_name: "Patrick Ruch", ersetzt: true }];
"""
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def oeffnen(pg):
    # Im Planer-Tab: Abgeschlossen, dann „Erledigte Probleme“
    pg.evaluate("location.hash='#/planer'"); pg.wait_for_selector("#pad-planer #pl-abgeschlossen", timeout=15000); pg.wait_for_timeout(600)
    pg.click("#pad-planer #pl-abgeschlossen"); pg.wait_for_selector("#pl-abg-probleme")
    pg.click("#pl-abg-probleme"); pg.wait_for_selector("#problem-archiv")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for breite, hoehe, art in [(1600, 950, "pc"), (390, 844, "handy")]:
        pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + DAZU))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
        pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
        pruefe(art + ": kein Knopf auf der Planwand", pg.locator("#pw-problemarchiv").count() == 0)
        oeffnen(pg)
        pruefe(art + ": zwei Einträge", pg.locator("[data-problemarchiv]").count() == 2)
        pruefe(art + ": ersetzt vermerkt", pg.locator(".problemarchiv__ersetzt").count() == 1)
        pg.wait_for_timeout(700); pg.screenshot(path=SP + "problemarchiv_" + art + ".png")
        sw = pg.evaluate("document.documentElement.scrollWidth")
        pruefe(art + ": kein seitliches Rollen", sw <= breite)
        if art == "pc":
            pg.fill("#problem-archiv-suche", "lader")
            pruefe("Suche findet einen", pg.locator("[data-problemarchiv]").count() == 1)
            pg.fill("#problem-archiv-suche", "")
            pg.locator("[data-problemarchiv='pa2'] [data-problemarchiv-weg]").click()
            pg.wait_for_selector(".dialog-huelle button:has-text('Löschen')")
            pg.locator(".dialog-huelle button:has-text('Löschen')").last.click(); pg.wait_for_timeout(500)
            pruefe("gelöscht", pg.evaluate("TEST.daten.problem_archiv.length") == 1)
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            pg.keyboard.press("Control+z"); pg.wait_for_timeout(800)
            pruefe("Rückgängig holt ihn zurück", pg.evaluate("TEST.daten.problem_archiv.length") == 2)
            # Zum Balken springen
            oeffnen(pg)
            pg.locator("[data-problemarchiv='pa1'] [data-problemarchiv-zeigen]").click(); pg.wait_for_timeout(900)
            pruefe("Fenster zu nach Sprung", pg.locator("#problem-archiv").count() == 0)
            pg.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
            pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(1200)
            # Nur so oft Escape, wie Fenster offen sind; sonst geht es zurück bis „Abmelden?“
            for _ in range(4):
                if pg.locator(".dialog-huelle").count() == 0: break
                pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            if pg.evaluate("location.hash") != "#/planwand":
                pg.evaluate("location.hash='#/planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(600)
            # Hinweis im Auftragsfenster
            pg.locator(".pw-balken[data-auftrag='j1']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
            pg.wait_for_timeout(500)
            pruefe("Hinweis frühere Probleme", pg.locator("#pl-fruehere-probleme").count() == 1)
            pg.screenshot(path=SP + "problemarchiv_auftrag.png")
            pg.click("#pl-fruehere-probleme"); pg.wait_for_selector("#problem-archiv")
            pruefe("nur diese HOCO Nr.", pg.locator("[data-problemarchiv]").count() == 1)
            # Erledigt schreibt (in der echten Datenbank) der Auslöser; hier nur: kein Fehler
        pg.context.close()
    # Extern: kein Knopf
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE + DAZU + "TEST.daten.profiles[0].role = 'extern';"))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/extern", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_timeout(2000)
    pruefe("extern: kein Knopf", pg.locator("#pw-problemarchiv").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
