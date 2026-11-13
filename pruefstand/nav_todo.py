# Planer-Dashboard (1.507.0 im Pad Mode, seit 1.520.0 eigener Tab, Wunsch Patrick 12. November 2026):
# Todo mit Problemen und eigenen Todos, Material nach Lieferant gebündelt.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("PLANER_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

DATEN = """;
(function(){
  const J = TEST.daten.jobs;
  const geplant = J.filter(j => j.plan_status === 'geplant');
  // A: früher bei Metalix und Notz, B: nur bei Notz → beides bei Notz
  geplant[0].material_bez = '1.4305 rd 12 h9'; geplant[0].material_menge = '';
  geplant[1].material_bez = '11SMnPb30 rd 16'; geplant[1].material_menge = '';
  geplant[2].material_bez = 'CuZn39Pb3 sw 10'; geplant[2].material_menge = '';
  geplant[3].material_bez = 'CuZn39Pb3 rd 8'; geplant[3].material_menge = '300 kg · Schmobi 2026008672';
  geplant[4].material_bez = '1.4305 rd 20 h9'; geplant[4].material_menge = '20 kg · Notz 2026001234';
  geplant[4].target_quantity = 5000; geplant[4].stand = 0; TEST.teilJob = geplant[4].job_number;
  TEST.daten.hoco_parts = TEST.daten.hoco_parts || [];
  TEST.daten.hoco_parts.push({ hoco_nr: geplant[4].job_number, teil_laenge_mm: 30, teil_mass_bestaetigt: true });
  const alt = (id, bez, menge, tag) => J.push({ id, job_number: '19999-' + id, machine_id: 'm-l1', plan_status: 'fertig',
    planned_from: tag, ended_at: '2026-01-01T10:00:00Z', material_bez: bez, material_menge: menge });
  alt('h1', '1.4305 rd 12 h9', '200 kg · Metalix 2026001111', '2026-05-01');
  alt('h2', '1.4305 rd 12 h9', '100 kg · Notz 2026001112', '2026-03-01');
  alt('h4', '1.4305 rd 12 h9', '150 kg · Notz 2026001110', '2026-01-15');
  alt('h3', '11SMnPb30 rd 16', '100 kg · Notz 2026001113', '2026-04-01');
  TEST.daten.app_config = TEST.daten.app_config || [];
  TEST.daten.app_config.push({ schluessel: 'material_lieferanten', wert: JSON.stringify([
    { name: 'Metalix', tage: 3, website: 'metalix.ch' }, { name: 'Notz', tage: 2, bestelltage: [2, 4], schluss: '11:00', liefertage: [3], notiz: 'Frau Muster anrufen' }, { name: 'Schmobi', tage: 5 }]) });
  TEST.daten.app_config.push({ schluessel: 'material_regeln', wert: JSON.stringify([
    { material: 'Messing sw', muss: 'Schmobi', kann: ['Notz'] }, { material: 'Messing rd 99', muss: 'Notz', kann: [] }]) });
  TEST.daten.qs_meldungen = [{ id: 'q1', machine_id: null, stueck: 3, hoco_nr: '10000-0001', erstellt_am: '2026-11-12T08:00:00Z' }];
  TEST.daten.planer_todos = [{ id: 't1', text: 'Gühring wegen Termin anrufen', faellig: null, erledigt_am: null, erstellt_am: '2026-11-12T08:00:00Z' },
    { id: 't2', text: 'Geheim von jemand anderem', fuer_alle: false, erstellt_von: 'jemand-anders', faellig: null, erledigt_am: null, erstellt_am: '2026-11-12T09:00:00Z' }];
})();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for dunkel in (False, True):
        ctx = br.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page(); pf = []
        pg.on("pageerror", lambda e: pf.append(str(e)[:300]))
        ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + DATEN))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            ctx.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/dashboard", wait_until="domcontentloaded")
        pg.wait_for_selector("#nav-todo .pl-todo__eintrag", timeout=20000); pg.wait_for_timeout(600)
        if dunkel:
            pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(300)
        t = pg.inner_text("#nav-todo")
        pruefe("Gühring wegen Termin anrufen" in t, "eigenes Todo in der Seitenleiste")
        pruefe("Geheim von jemand anderem" not in t, "fremdes nur-für-mich nicht")
        pruefe("Probleme offen" in t, "Zahlen in der Seitenleiste")
        b = pg.evaluate("(() => { const n = document.querySelector('.nav'); return [n.scrollWidth, n.clientWidth]; })()")
        pruefe(b[0] <= b[1] + 1, "Seitenleiste rollt nicht seitlich " + str(b))
        pg.screenshot(path=f"{BILD}/nav_todo{'_dunkel' if dunkel else ''}.png")
        if not dunkel:
            pg.click("#nav-klapp"); pg.wait_for_timeout(1200)
            pruefe(not pg.is_visible("#nav-todo"), "zugeklappt ausgeblendet")
            pg.click("#nav-klapp"); pg.wait_for_timeout(1200)
            pruefe(pg.is_visible("#nav-todo"), "aufgeklappt wieder da")
            pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(500)
            pruefe(not pg.is_visible("#nav-todo"), "am Handy nicht")
        pruefe(not pf, "keine Fehler im Browser " + str(pf[:2]))
        ctx.close()
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
