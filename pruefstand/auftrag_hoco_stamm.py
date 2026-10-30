# Tipp auf die HOCO Nr. im Auftragsfenster öffnet ihre Stammdaten über dem
# Auftragsfenster (Wunsch Patrick 30. Oktober 2026). Escape schliesst nur
# die Stammdaten, das Auftragsfenster bleibt.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)

    # Ein Auftrag, dessen HOCO Nr. Stammdaten hat
    jid = pg.evaluate("""() => { const nrs = new Set((TEST.daten.hoco_parts || []).map(t => t.hoco_nr));
      const ids = new Set(TEST.daten.planwand.filter(j => nrs.has(j.job_number)).map(j => j.id));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 40); return b && b.dataset.auftrag; }""")
    pruefe("Balken mit Stammdaten gefunden", bool(jid))
    nr = pg.evaluate("(id) => TEST.daten.planwand.find(j => j.id === id).job_number", jid)
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
    pruefe("Auftragsfenster offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("HOCO Nr. ist ein Knopf", pg.locator("#pl-hoco-stamm").count() == 1
           and pg.inner_text("#pl-hoco-stamm").strip() == nr)
    pg.click("#pl-hoco-stamm"); pg.wait_for_timeout(900)
    pruefe("HOCO-Fenster offen", pg.locator("#hoco-fensterinhalt").count() == 1)
    txt = pg.inner_text("#hoco-fensterinhalt") if pg.locator("#hoco-fensterinhalt").count() else ""
    pruefe("zeigt das Teil " + nr, nr in txt and "Alle Bereiche" not in txt)
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/b9a1375a-9a96-5631-892c-75a8e837831b/scratchpad/hoco_stamm.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe("Escape schliesst nur die Stammdaten", pg.locator("#hoco-fensterinhalt").count() == 0
           and pg.locator(".dialog--auftrag").count() == 1)
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
