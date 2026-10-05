# Planwand: Hat der Auftrag selbst keine Zeichnung, die HOCO Nr. aber
# schon, wird sie am Auftrag angeheftet und gespeichert. Klick auf den
# Balken zeigt sie, das Auftragsfenster zeigt sie als normalen Anhang.
# Dazu der Knopf fürs Einrichtblatt der gewählten Maschine.
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
    jid = pg.evaluate("""() => { const ohne = new Map(TEST.daten.planwand.filter(j => !j.drawing_url && j.job_number).map(j => [j.id, j]));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ohne.has(b.dataset.auftrag) && b.getBoundingClientRect().width > 40);
      if (!b) return null; const j = ohne.get(b.dataset.auftrag);
      TEST.daten.hoco_parts = TEST.daten.hoco_parts.filter(t => t.hoco_nr !== j.job_number);
      TEST.daten.hoco_parts.push({ hoco_nr: j.job_number, zeichnung_url: "data:application/pdf;base64,JVBERi0xLjQK" });
      return b.dataset.auftrag; }""")
    if not jid: fehler.append("kein Balken ohne Zeichnung")
    else:
        sel = f".pw-balken[data-auftrag='{jid}']"
        pg.locator(sel).first.click(); pg.wait_for_timeout(1000)
        if pg.locator(".betrachter").count() == 0: fehler.append("Klick zeigt Zeichnung der HOCO Nr. nicht")
        z = pg.evaluate(f"() => (TEST.daten.jobs || TEST.daten.planwand).concat(TEST.daten.planwand).find(j => j.id === '{jid}').drawing_url")
        print("am Auftrag:", (z or "")[:30])
        if not z: fehler.append("Zeichnung nicht am Auftrag gespeichert")
        for _ in range(3): pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
        pg.wait_for_timeout(1500)
        pg.locator(sel).first.dblclick(); pg.wait_for_timeout(1200)
        if pg.locator(".dialog--auftrag").count() == 0: fehler.append("kein Auftragsfenster")
        if pg.locator("#pl-vorschau iframe").count() == 0: fehler.append("Vorschau leer")
        if pg.locator("#pl-pdfreihe", has_text="Ansehen").count() == 0: fehler.append("Zeichnung nicht als Anhang")
        if pg.locator("#pl-blattreihe", has_text="Ansehen").count() == 0: fehler.append("Knopf Einrichtblatt fehlt")
        pg.screenshot(path="/tmp/claude-0/-home-claude-hofertool/47056590-a2f7-5351-8db2-d712fe3879af/scratchpad/auftrag.png")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
