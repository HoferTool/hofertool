# Mengen live (1.654.0, Wunsch Patrick 19. November 2026: „alle
# Materialrechnungen live, ohne neu laden … wenn man Stammdaten ändert,
# soll es gleich die Menge auch anpassen“): Länge bei der HOCO Nr. ändern,
# das offene Auftragsfenster zeigt gleich die neue Mat. info.
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
    pg = br.new_context(viewport={"width": 1500, "height": 950}, timezone_id="Europe/Zurich").new_page()
    pg.clock.set_fixed_time("2026-10-13T14:00:00+02:00")
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:200])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""() => {
      const D = TEST.daten;
      const m = D.machines.find(x => x.id === 'm-k1'); m.type_id = 't1';
      D.machine_types.forEach(t => { t.stangen_mm = 3000; t.stumpen_mm = 250; t.abstecher_mm = 2.5; });
      D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
      D.jobs.push({ id: 'mB', machine_id: 'm-k1', maschine: m.name, maschine_nr: m.machine_number, ended_at: null,
        planned_days: 3, target_quantity: 5000, stand: 0, color: 'rosa', job_number: '10555-0002',
        plan_status: 'geplant', material_bez: 'X14CrMoS17 rd 024 mm h9', planned_from: '2026-10-20',
        abruf_info: 'Abruf 1' });
      D.planwand = D.jobs;
      D.hoco_parts = D.hoco_parts.filter(x => x.hoco_nr !== '10555-0002');
      D.hoco_parts.push({ hoco_nr: '10555-0002', teil_d_mm: 24, teil_laenge_mm: 30, teil_mass_bestaetigt: true });
    }""")
    pg.evaluate("location.hash='#/planwand'")
    pg.wait_for_selector(".pw-balken[data-auftrag='mB']", timeout=10000); pg.wait_for_timeout(800)
    pg.locator(".pw-balken[data-auftrag='mB']").first.dblclick()
    pg.wait_for_selector("#pl-matinfo", timeout=5000)
    vor = pg.inner_text("#pl-matinfo").split("\n")[0]
    # 30 + 2,5 + 0,5 = 33 mm, 83 je Stange, 5'000 → 61 Stangen
    pruefe("Vorher Länge 30: " + vor, "/ 61 Stangen" in vor)
    # HOCO Nr. oben antippen öffnet die Stammdaten, dort die Länge ändern
    pg.click('#pl-hoco-stamm')
    pg.wait_for_timeout(1500); pg.screenshot(path="/tmp/ml_stamm.png")
    pg.wait_for_selector("[data-hocolaenge] button", timeout=8000)
    pg.locator("[data-hocolaenge] button").first.click()
    pg.wait_for_selector(".dialog-huelle input[id$='-laenge']", timeout=5000)
    pg.fill(".dialog-huelle input[id$='-laenge']", "10")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(1200)
    pruefe("In der Datenbank 10 mm", pg.evaluate("TEST.daten.hoco_parts.find(x => x.hoco_nr === '10555-0002').teil_laenge_mm") == 10)
    nach = pg.inner_text("#pl-matinfo").split("\n")[0]
    # 10 + 3 = 13 mm, 211 je Stange, 5'000 → 24 Stangen
    pruefe("Ohne Neuladen gleich neu gerechnet: " + nach, "/ 24 Stangen" in nach)
    pg.screenshot(path="/tmp/material_live.png")
    br.close()
print("Fehler: " + ("keine" if not fehler else str(len(fehler))))
for f in fehler: print("  " + f)
