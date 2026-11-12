# Planer-Dashboard im Pad Mode (1.507.0, Wunsch Patrick 12. November 2026):
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
  alt('h3', '11SMnPb30 rd 16', '100 kg · Notz 2026001113', '2026-04-01');
  TEST.daten.app_config = TEST.daten.app_config || [];
  TEST.daten.app_config.push({ schluessel: 'material_lieferanten', wert: JSON.stringify([
    { name: 'Metalix', tage: 3 }, { name: 'Notz', tage: 2, bestelltage: [2, 4], schluss: '11:00' }, { name: 'Schmobi', tage: 5 }]) });
  TEST.daten.planer_todos = [{ id: 't1', text: 'Gühring wegen Termin anrufen', faellig: null, erledigt_am: null, erstellt_am: '2026-11-12T08:00:00Z' }];
})();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1366, "height": 1024}, has_touch=True)
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:300]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + DATEN))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='planer']")
    pg.click("#pad [data-padwo='planer']"); pg.wait_for_selector("#pad-planer"); pg.wait_for_timeout(800)
    pg.screenshot(path=BILD + "/planer.png")
    zeile = lambda bez: pg.locator(".pl-zeile", has_text=bez).first
    notz = pg.locator("[data-pllieferant='Notz']")
    pruefe(notz.count() == 1, "Gruppe Notz da")
    pruefe(notz.locator(".pl-zeile", has_text="1.4305 rd 12").count() == 1, "1.4305 rd 12 gebündelt bei Notz (obwohl zuletzt Metalix)")
    pruefe(notz.locator(".pl-zeile", has_text="11SMnPb30").count() == 1, "11SMnPb30 bei Notz")
    pruefe("Metalix" in notz.locator(".pl-zeile", has_text="1.4305 rd 12").inner_text(), "„auch: Metalix“ steht dabei")
    pruefe(pg.locator("[data-pllieferant='Lieferant offen']", has_text="CuZn39Pb3 sw 10").count() == 1, "ohne Verlauf unter Lieferant offen")
    pruefe(pg.locator("[data-pllieferant='Schmobi']", has_text="bestellt").count() == 1, "bestellt unter Schmobi")
    pruefe("Lieferbar 2 Arbeitstage" in notz.inner_text(), "Lieferbarkeit Notz")
    teil = pg.evaluate("TEST.teilJob")
    tz = pg.locator(f"[data-plzeile='{teil}']")
    pruefe(tz.count() == 1 and "fehlen noch" in tz.inner_text(), "Teilmenge: fehlen noch … kg " + (tz.inner_text() if tz.count() else ""))
    pruefe(pg.locator(".pl-zeile", has_text="X10CrNiS18").count() == 0, "Material ganz da wird nicht gezeigt")
    pruefe(pg.locator("[data-pltodo='problem']").count() >= 1, "Problem im Todo")
    pruefe(pg.locator("[data-pltodo='eigen']").count() == 1, "eigenes Todo")
    # Lieferant von Hand wählen
    notz.locator(".pl-zeile", has_text="1.4305 rd 12").locator("[data-pllwahl]").click()
    pg.wait_for_selector(".statuswahl [data-w='Metalix']"); pg.click(".statuswahl [data-w='Metalix']"); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-pllieferant='Metalix']", has_text="1.4305 rd 12").count() == 1, "von Hand auf Metalix gewechselt")
    # Eigenes Todo anlegen
    pg.click("#pl-todo-neu"); pg.wait_for_selector(".dialog textarea")
    pg.fill(".dialog textarea", "Zangen nachzählen"); pg.keyboard.press("Control+Enter") if False else pg.locator(".dialog button:has-text('Speichern')").click()
    pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-pltodo='eigen']", has_text="Zangen nachzählen").count() == 1, "neues Todo erscheint")
    pg.locator("[data-pltodo='eigen']", has_text="Zangen").locator(".pl-haken").click(); pg.wait_for_timeout(600)
    pruefe(pg.locator(".pl-todo__eintrag--erledigt", has_text="Zangen").count() == 1, "Todo abgehakt")
    pg.click("[data-plansicht='start']"); pg.wait_for_timeout(600)
    pruefe(pg.locator(".pl-zeile").count() >= 4, "Ansicht nach Start")
    pg.click("#pl-lieferanten"); pg.wait_for_selector("#material-lieferanten")
    pruefe(pg.locator("[data-mllieferant='Notz']").count() == 1, "Lieferanten-Fenster")
    pg.screenshot(path=BILD + "/planer-lieferanten.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # iPad hoch
    pg.set_viewport_size({"width": 820, "height": 1180}); pg.click("[data-plansicht='lieferant']"); pg.wait_for_timeout(700)
    pg.screenshot(path=BILD + "/planer-hoch.png")
    breite = pg.evaluate("document.querySelector('#pad-planer').scrollWidth <= document.querySelector('#pad-planer').clientWidth + 1")
    pruefe(breite, "iPad hoch ohne seitliches Rollen")
    pruefe(not pf, "keine Fehler im Browser " + str(pf[:2]))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
