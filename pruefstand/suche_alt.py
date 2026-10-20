# Suche auf der Planwand findet auch Aufträge vor dem geladenen Jahr,
# ohne dass man zuerst zurückfährt (1.24.1, Wunsch Patrick 12. Oktober 2026).
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
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    # Zwei alte, abgeschlossene Aufträge von 2021: erst nach dem Laden in
    # die Datenbank, also nicht im geladenen Bereich der Planwand
    pg.evaluate("""() => { const v = TEST.daten.planwand.find(j => j.machine_id);
      ['2021-03-08', '2021-06-14'].forEach((d, i) => TEST.daten.planwand.push(Object.assign({}, v, {
        id: 'alt' + i, job_number: '99999-0001', planned_from: d, planned_days: 3, plan_status: 'fertig',
        ended_at: d + 'T16:00:00Z', fa_nr: null, problem: null }))); }""")
    pruefe("vorher nicht geladen", pg.evaluate("!alt_geladen()") if False else
           pg.locator(".pw-balken[data-auftrag='alt0']").count() == 0)
    pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(500)
    pg.locator("[data-sureihe='neu']").click()
    pg.fill("#su-text", "99999-0001"); pg.locator("#su-ja").click(); pg.wait_for_timeout(2500)
    leiste = pg.evaluate("(document.querySelector('.su-leiste__text') || {}).textContent || ''")
    print("     leiste:", leiste)
    pruefe("beide alten gefunden", "von 2" in leiste)
    pruefe("neuester zuerst gezeigt", pg.locator(".pw-balken[data-auftrag='alt1']").count() == 1)
    pg.locator("#su-weiter").click(); pg.wait_for_timeout(2000)
    pruefe("Weiter springt zum älteren", pg.locator(".pw-balken[data-auftrag='alt0']").count() == 1
           and "Treffer 2 von 2" in pg.evaluate("document.querySelector('.su-leiste__text').textContent"))
    pg.screenshot(path="/tmp/suche_alt.png")
    # Normale Suche geht weiter
    pg.locator("#su-ende").click(); pg.wait_for_timeout(300)
    pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(500)
    pg.fill("#su-text", "Star SR3"); pg.locator("#su-ja").click(); pg.wait_for_timeout(1500)
    pruefe("normale Suche findet weiter", "Treffer 1 von" in pg.evaluate("(document.querySelector('.su-leiste__text') || {}).textContent || ''"))
    # Ein einziger Treffer: nur hinführen, kein Auftragsfenster (seit 1.24.2)
    pg.evaluate("() => { const j = TEST.daten.planwand.find(x => x.id === 'alt0'); j.job_number = '88888-0001'; }")
    pg.locator("#su-ende").click(); pg.wait_for_timeout(300)
    pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(500)
    pg.fill("#su-text", "88888-0001"); pg.locator("#su-ja").click(); pg.wait_for_timeout(2500)
    pruefe("ein Treffer gefunden", "von 1" in pg.evaluate("(document.querySelector('.su-leiste__text') || {}).textContent || ''"))
    pruefe("kein Auftragsfenster", pg.locator(".dialog--auftrag").count() == 0)
    # Werkstoffnummer findet den Kurznamen in der Bezeichnung (1.99.0)
    pg.evaluate("() => { TEST.daten.planwand.forEach(x => { if (/1\\.4104|x14crmos17/i.test(x.material_bez || '')) x.material_bez = 'Messing'; });"
                " TEST.daten.planwand.find(x => x.id === 'alt0').material_bez = 'X14CrMoS17 rd 012 mm h9'; }")
    pg.locator("#su-ende").click(); pg.wait_for_timeout(300)
    pg.locator("#pw-suche-los").click(); pg.wait_for_timeout(500)
    pg.fill("#su-text", "1.4104"); pg.locator("#su-ja").click(); pg.wait_for_timeout(2500)
    pruefe("1.4104 findet X14CrMoS17", "von 1" in pg.evaluate("(document.querySelector('.su-leiste__text') || {}).textContent || ''"))
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
