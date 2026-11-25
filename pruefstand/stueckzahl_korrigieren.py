# Stückzahl korrigieren im Auftragsfenster (seit 1.824.0): Einträge ändern,
# löschen, alles auf 0, mit Rückgängig; Externe ohne Knopf
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
SP = "/tmp/claude-0/-home-user/d13fb8d8-2349-5ebe-87e5-14a995737441/scratchpad/"
DAZU = """
(function(){ const j = TEST.daten.jobs[0];
TEST.daten.production_records = (TEST.daten.production_records||[]).filter(r => r.job_id !== j.id).concat([
  { id: "pr-a", job_id: j.id, machine_id: j.machine_id, record_date: "2026-09-28", quantity: 10500 },
  { id: "pr-b", job_id: j.id, machine_id: j.machine_id, record_date: "2026-09-21", quantity: 300 }]); })();
"""
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def anzahl(pg):
    return pg.evaluate("TEST.daten.production_records.filter(r => r.job_id === TEST.daten.jobs[0].id).length")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + DAZU))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate("TEST.daten.jobs[0].id")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.wait_for_selector("#pl-stueckzahl"); pg.click("#pl-stueckzahl")
    pg.wait_for_selector("#stk-korr-liste")
    pruefe("zwei Einträge", pg.locator("[data-stk-zeile]").count() == 2)
    pg.screenshot(path=SP + "stk_korr.png")
    pg.locator("[data-stk-zeile='pr-a'] input").fill("0"); pg.click("[data-stk-speichern='pr-a']"); pg.wait_for_timeout(600)
    pruefe("geändert auf 0", pg.evaluate("TEST.daten.production_records.find(r => r.id==='pr-a').quantity") == 0)
    pg.click("#stk-korr-null"); pg.wait_for_selector(".dialog-huelle button:has-text('Zurücksetzen')")
    pg.locator(".dialog-huelle button:has-text('Zurücksetzen')").last.click(); pg.wait_for_timeout(800)
    pruefe("alles gelöscht", anzahl(pg) == 0)
    pruefe("Liste leer", pg.locator("#stk-korr-leer").count() == 1)
    pg.locator(".stk-korr button:has-text('Schliessen')").click(); pg.wait_for_timeout(300)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(900)
    pruefe("Rückgängig holt beide zurück", anzahl(pg) == 2)
    pg.context.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
