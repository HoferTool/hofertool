# Produktion → Infos zum Richten: Maschinen mit dem Auftrag, der dran
# ist, Stand des Einrichtblatts, Bearbeiten öffnet das Blatt gleich zum
# Ändern, ein Excel wird vorher eingelesen, andere HOCO Nr. öffnen,
# Liste der nicht bestätigten Blätter.
import time, base64, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
HIER = os.path.dirname(os.path.abspath(__file__))
XL = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + base64.b64encode(
    open(os.path.join(HIER, "einrichtblatt-app-beispiel.xlsx"), "rb").read()).decode()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1500, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""(XL) => {
      const D = TEST.daten;
      const m = D.machines.find(x => x.id === 'm-k1'); m.type_id = 't1';
      D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
      D.jobs.push({ id: 'rH', job_number: '10000-0301', machine_id: 'm-k1', plan_status: 'laeuft', ended_at: null,
        planned_days: 3, target_quantity: 1000, planned_from: new Date().toISOString().slice(0, 10) });
      D.hoco_type_data.push({ hoco_nr: '10000-0301', type_id: 't1', blatt_url: XL, stueckzeit_s: null });
      D.einrichtblatt_app = [{ id: 'eo', hoco_nr: '10000-0999', type_id: 't1', programme: {}, plaetze: {}, kopf: {},
        seiten: [], gut_am: null, geaendert_am: new Date().toISOString() }];
      D.artikel_bild = []; D.eb_bilder = [];
    }""", XL)
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1200)
    pg.click("[data-unter='produktion/richten']"); pg.wait_for_selector("[data-richten]"); pg.wait_for_timeout(1000)
    z = pg.locator("[data-richten-maschine='m-k1']")
    pruefe("Maschine mit Auftrag und Stand", "10000-0301" in z.inner_text() and "Nur Excel" in z.inner_text())
    pruefe("Nicht bestätigtes Blatt in der Liste", pg.locator("[data-richten-offen='10000-0999']").count() == 1)
    pg.screenshot(path="produktion_richten.png")

    z.locator("[data-richten-bearbeiten]").click(); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(800)
    pruefe("Excel eingelesen", pg.evaluate("TEST.daten.einrichtblatt_app.some(b => b.hoco_nr === '10000-0301' && b.type_id === 't1')"))
    pruefe("Gleich im Bearbeiten", pg.locator("[data-eba-speichern]").count() == 1)
    pg.click("[data-eba-abbrechen]"); pg.wait_for_timeout(300)
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(1500)
    pruefe("Stand neu: in der App, nicht bestätigt", "noch nicht bestätigt" in pg.inner_text("[data-richten-maschine='m-k1']"))

    # Andere HOCO Nr. ohne Blatt: leeres Blatt zum Ausfüllen
    pg.fill("[data-richten-hoco]", "10000-0302"); pg.select_option("[data-richten-typ]", "t1")
    pg.click("[data-richten-oeffnen]"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    pruefe("Andere HOCO Nr.: neues Blatt im Bearbeiten", "10000-0302" in pg.inner_text(".eba-fenster .betrachter__titel")
           and pg.locator("[data-eba-speichern]").count() == 1)
    br.close()
print("Fehler:", fehler[:4] if fehler else "keine")
