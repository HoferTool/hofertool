# Probleme erledigen darf jede Person (1.354.0, Wunsch Patrick 3. November
# 2026): auch ein Mitarbeiter ohne Schreibrecht sieht im Auftragsfenster
# den Knopf „✓ Erledigt“ und entfernt damit das Problem. Externe nicht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def seite(br, rolle):
    F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
        "daten.profiles[0].role = '" + rolle + "'; daten.profiles[0].darf_bearbeiten = false;\n"
        "if (typeof window !== \"undefined\") window.TEST = TEST;")
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    return pg, f
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg, f = seite(br, "mitarbeiter")
    jid = pg.locator(".pw-balken[data-auftrag]").first.get_attribute("data-auftrag")
    pg.evaluate(f"(() => {{ const j = TEST.daten.jobs.find(j => j.id === '{jid}'); j.problem = 'Zange klemmt'; j.problem_at = new Date().toISOString(); }})()")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(800)
    pruefe("Mitarbeiter sieht Erledigt", pg.locator("#pl-problemweg").count() == 1)
    if pg.locator("#pl-problemweg").count():
        pg.click("#pl-problemweg"); pg.wait_for_timeout(400)
        pg.locator(".dialog-huelle button:has-text('Meldung entfernen')").click(); pg.wait_for_timeout(1000)
        pruefe("Problem entfernt", pg.evaluate(f"!TEST.daten.jobs.find(j => j.id === '{jid}').problem"))
    pruefe("keine Seitenfehler", not f)
    br.close()
print("Problem erledigen alle | Fehler:", "; ".join(fehler) if fehler else "keine")
