# Einrichtblatt in der App aus dem Auftragsfenster im eigenen Fenster
# bearbeiten (Patrick 2. November 2026: „durchsichtig und so“)
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
      D.einrichtblatt_app = [{ hoco_nr: j.job_number, type_id: m.type_id, programme: { p1: 'O1234' }, kopf: {}, seiten: [],
        plaetze: { T100: { taetigkeit: 'Abstechen' } }, gut_am: '2026-10-28T08:00:00Z' }];
    }""", jid)
    if os.environ.get("INAPP"):
        pg.evaluate("window.open = () => null"); pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(500); w = pg
    else:
      pg.evaluate("TEST.eigenesFenster = true")
      with ctx.expect_page() as neu: pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick()
      w = neu.value; w.wait_for_selector(".dialog--auftrag"); w.wait_for_timeout(400)
    w.click("#pl-blattreihe button"); w.wait_for_timeout(1500)
    if BILD: w.screenshot(path=BILD + "/eb-ansehen.png")
    if os.environ.get("EXCEL"):
        w.click("button:has-text('Ins App-Blatt umwandeln')"); w.wait_for_timeout(2500)
        if BILD: w.screenshot(path=BILD + "/eb-umwandeln.png"); pg.screenshot(path=BILD + "/eb-umwandeln-app.png")
    print("Blatt im eigenen Fenster:", w.locator("[data-eba-seite]").count(), "| in der App:", pg.locator("[data-eba-seite]").count())
    if w.locator("[data-eba-bearbeiten]").count():
        w.click("[data-eba-bearbeiten]"); w.wait_for_timeout(800)
    if BILD: w.screenshot(path=BILD + "/eb-bearbeiten.png")
    w.locator("[data-eba-seite] :text('T100')").first.click(); w.wait_for_timeout(800)
    if BILD: w.screenshot(path=BILD + "/eb-platz.png")
    print("Platzfenster hier:", w.evaluate("document.querySelectorAll('.dialog-huelle').length"), "dort:", pg.evaluate("document.querySelectorAll('.dialog-huelle').length"))
    st = w.evaluate("""() => { const h = document.querySelector('.eba-huelle'); const d = h && h.firstElementChild;
      const s = (e) => e ? getComputedStyle(e) : {}; return [h && h.className, s(h).backgroundColor, s(d).backgroundColor, s(d).opacity, d && d.className,
      JSON.stringify(h && h.getBoundingClientRect()), innerWidth, innerHeight] }""")
    print(st)
    if st[3] != "1": fehler.append("Blatt im eigenen Fenster durchsichtig")
    laufend = w.evaluate("document.getAnimations().filter(a => a.playState === 'running' && a.effect.getComputedTiming().endTime !== Infinity).length")
    if laufend: fehler.append("Eintritt läuft im eigenen Fenster weiter: " + str(laufend))
    ctx.close(); br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
