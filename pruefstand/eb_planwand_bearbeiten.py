# Einrichtblatt aus der Planwand: Ansehen zeigt es, Bearbeiten führt in die
# Produktion → Infos zum Richten (Wunsch Patrick 23. November 2026)
# INAPP=1: Auftragsfenster in der App statt im eigenen Fenster
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
    if not w.locator("[data-eba-seite]").count(): fehler.append("Blatt nicht zum Ansehen offen")
    if w.locator("[data-eba-speichern]").count(): fehler.append("Blatt gleich zum Bearbeiten offen")
    w.click("[data-eba-bearbeiten]"); pg.wait_for_timeout(2500)
    if BILD: pg.screenshot(path=BILD + "/eb-produktion.png")
    h = pg.evaluate("location.hash")
    print("Adresse:", h, "| Richten:", pg.locator("[data-richten]").count(), "| Speichern:", pg.locator("[data-eba-speichern]").count(),
          "| Auftragsfenster offen:", (not w.is_closed()) and w.locator(".dialog--auftrag").count())
    if "produktion" not in h: fehler.append("nicht in der Produktion: " + h)
    if not pg.locator("[data-richten]").count(): fehler.append("Reiter Infos zum Richten fehlt")
    if not pg.locator("[data-eba-speichern]").count(): fehler.append("Blatt nicht zum Bearbeiten offen in der Produktion")
    if not w.is_closed() and w.locator(".dialog--auftrag").count(): fehler.append("Auftragsfenster noch offen")
    ctx.close(); br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
