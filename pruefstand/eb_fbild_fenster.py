# Freie Bilder im Einrichtblatt im eigenen Fenster ziehen und skalieren
# (Patrick 20. November 2026: „kann ich si nicht schiben und gröser kleiner machen“)
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILDER", "")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1600, "height": 950}, color_scheme=os.environ.get("SCHEMA","dark"))
    ctx.on("page", lambda pg: pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160])))
    pg = ctx.new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    import base64
    XL = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "einrichtblatt-app-beispiel.xlsx"), "rb").read()
    ctx.route("**/eb/*.xlsx", lambda r: r.fulfill(status=200, body=XL, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => b.getBoundingClientRect().width > 40).dataset.auftrag")
    if os.environ.get("EXCEL"): pg.evaluate("window.__excel = true")
    pg.evaluate("""(jid) => {
      const D = TEST.daten; const j = D.planwand.find(x => x.id === jid);
      const m = (D.machines || []).find(x => x.id === (j.machine_id || j.maschine_id));
      if (window.__excel) { D.einrichtblatt_app = []; D.hoco_type_data.push({ hoco_nr: j.job_number, type_id: m.type_id, blatt_url: location.origin + '/eb/a.xlsx' }); return; }
      D.einrichtblatt_app = [{ hoco_nr: j.job_number, type_id: m.type_id, programme: { p1: 'O1234' }, seiten: [],
        kopf: { bilder: [{ id: 'b1', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', x: 30, y: 30, w: 20 }] },
        plaetze: { T100: { taetigkeit: 'Abstechen' } }, gut_am: '2026-10-28T08:00:00Z' }];
    }""", jid)
    if os.environ.get("INAPP"):
        pg.evaluate("window.open = () => null"); pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(500); w = pg
    else:
      pg.evaluate("TEST.eigenesFenster = true")
      with ctx.expect_page() as neu: pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick()
      w = neu.value; w.wait_for_selector(".dialog--auftrag"); w.wait_for_timeout(400)
    w.click("#pl-blattreihe button"); w.wait_for_timeout(1500)
    def bild(): return w.evaluate("(() => { const r = document.querySelector('[data-eba-fbild=b1]').getBoundingClientRect(); return [r.left, r.top, r.width]; })()")
    def gespeichert(): return pg.evaluate("JSON.stringify((TEST.daten.einrichtblatt_app[0].kopf || {}).bilder)")
    # Bearbeiten führt seit 1.715.0 in die Produktion, im eigenen Fenster nur Ansehen
    for modus in ["ansehen"]:
        if modus == "bearbeiten":
            if w.locator("[data-eba-bearbeiten]").count(): w.click("[data-eba-bearbeiten]"); w.wait_for_timeout(800)
        x, y, b = bild()
        w.mouse.move(x + b/2, y + 5); w.mouse.down(); w.mouse.move(x + b/2 + 60, y + 45, steps=6); w.mouse.up(); w.wait_for_timeout(600)
        x2, y2, b2 = bild()
        print(modus, "verschoben:", round(x2 - x), round(y2 - y))
        if abs(x2 - x - 60) > 6 or abs(y2 - y - 40) > 6: fehler.append(modus + ": Bild im eigenen Fenster nicht verschoben")
        w.click("[data-eba-fbild=b1]"); w.wait_for_timeout(300)
        g = w.locator("[data-eba-fbild=b1] [data-eba-fbild-gross]")
        if not g.count(): fehler.append(modus + ": kein Griff zum Skalieren"); continue
        gb = g.bounding_box()
        w.mouse.move(gb["x"] + 9, gb["y"] + 9); w.mouse.down(); w.mouse.move(gb["x"] + 89, gb["y"] + 9, steps=6); w.mouse.up(); w.wait_for_timeout(600)
        x3, y3, b3 = bild()
        print(modus, "breiter:", round(b3 - b2))
        if b3 - b2 < 60: fehler.append(modus + ": Bild im eigenen Fenster nicht grösser")
    print("gespeichert:", gespeichert())
    if '"x":30,' in gespeichert(): fehler.append("Lage nicht gespeichert")
    ctx.close(); br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
