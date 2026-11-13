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
    ctx = br.new_context(viewport={"width": 1366, "height": 1024}, has_touch=True)
    haupt = ctx.new_page()
    pf = []
    ctx.on("page", lambda neu: neu.on("pageerror", lambda e: pf.append(str(e)[:300])))
    haupt.on("pageerror", lambda e: pf.append(str(e)[:300]))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + DATEN))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    haupt.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
    haupt.wait_for_selector("#pw-planer", timeout=15000); haupt.wait_for_timeout(800)
    # Seit 1.520.0: Knopf neben Symbole öffnet den Planer im eigenen Tab
    with haupt.expect_popup() as tab:
        haupt.click("#pw-planer")
    pg = tab.value
    pg.wait_for_selector("#pad-planer", timeout=20000); pg.wait_for_timeout(800)
    pruefe("#/planer" in pg.url, "Planer im eigenen Tab #/planer")
    pruefe(pg.locator("#pw-planer").count() == 0, "im Planer kein Planer-Knopf")
    pg.screenshot(path=BILD + "/planer.png")
    zeile = lambda bez: pg.locator(".pl-zeile", has_text=bez).first
    notz = pg.locator("[data-pllieferant='Notz']")
    pruefe(notz.count() == 1, "Gruppe Notz da")
    pruefe(notz.locator(".pl-zeile", has_text="1.4305 rd 12").count() == 1, "1.4305 rd 12 bei Notz (2× Notz, nur 1× aber zuletzt Metalix)")
    pruefe(notz.locator(".pl-zeile", has_text="11SMnPb30").count() == 1, "11SMnPb30 bei Notz")
    pruefe("Metalix" in notz.locator(".pl-zeile", has_text="1.4305 rd 12").inner_text(), "„auch: Metalix“ steht dabei")
    rg = pg.locator("[data-pllieferant='Schmobi'] .pl-zeile", has_text="CuZn39Pb3 sw 10")
    pruefe(rg.count() == 1, "Regel „Messing sw“ → Schmobi")
    pruefe(rg.count() == 1 and "kann auch: Notz" in rg.inner_text(), "kann auch: Notz nur als Info")
    pruefe(pg.locator("[data-pllieferant='Notz']", has_text="CuZn39Pb3 rd 8").count() == 0, "Regel rd 99 gilt nicht für rd 8")
    pruefe(pg.locator("[data-pllieferant='Schmobi']", has_text="bestellt").count() == 1, "bestellt unter Schmobi")
    pruefe("Lieferbar 2 Arbeitstage" in notz.inner_text(), "Lieferbarkeit Notz")
    pruefe("liefert Mi" in notz.inner_text(), "Liefertage Notz")
    pruefe(notz.locator("[data-plnotiz]", has_text="Frau Muster").count() == 1, "Bemerkung Notz")
    # Seit 1.524.0: Logo vor dem Namen (ohne Website die Buchstaben)
    pruefe(notz.locator(".pl-lief__logo .bs-kuerzel, .pl-lief__logo .bs-logo").count() == 1, "Logo bei Notz")
    an = notz.locator(".pl-marke", has_text="heute bestellt")
    pruefe(an.count() == 1 and "Mi" in an.inner_text(), "Ankunft am Liefertag Mi " + (an.inner_text() if an.count() else ""))
    teil = pg.evaluate("TEST.teilJob")
    tz = pg.locator(f"[data-plzeile='{teil}']")
    pruefe(tz.count() == 1 and "fehlen noch" in tz.inner_text(), "Teilmenge: fehlen noch … kg " + (tz.inner_text() if tz.count() else ""))
    pruefe(pg.locator(".pl-zeile", has_text="X10CrNiS18").count() == 0, "Material ganz da wird nicht gezeigt")
    pruefe(pg.locator("[data-pltodo='problem']").count() >= 1, "Problem im Todo")
    pruefe(pg.locator("[data-pltodo='eigen']").count() == 1, "eigenes Todo")
    # Tipp aufs Lieferantenfeld: gleich das Regelfenster, vorgefüllt aus dem Verlauf
    notz.locator(".pl-zeile", has_text="1.4305 rd 12").locator("[data-pllwahl]").click()
    pg.wait_for_selector("#pl-regelfenster")
    pruefe(pg.eval_on_selector("[data-plrfmuss]", "e => e.value") == "Notz", "Regelfenster: Immer dort = Notz vorgewählt")
    pruefe("Metalix" in pg.inner_text("[data-plrfkann]"), "Regelfenster: Metalix bei Kann dort")
    pg.select_option("[data-plrfmuss]", "Metalix")
    pruefe("Metalix" not in pg.inner_text("[data-plrfkann]"), "Metalix aus Kann, wenn Immer dort")
    pg.select_option("[data-plrfdazu]", "Schmobi")
    pruefe("Schmobi" in pg.inner_text("[data-plrfkann]"), "Schmobi ins Feld Kann dort")
    pg.select_option("[data-plrfdazu]", "Notz")
    pruefe("Notz" in pg.inner_text("[data-plrfkann]") and pg.locator("[data-plrfdazu]").count() == 0, "Notz dazu, keiner mehr frei")
    pg.wait_for_timeout(500); pg.screenshot(path=BILD + "/planer-regel.png")
    pg.click("[data-plrfspeichern]"); pg.wait_for_timeout(900)
    mz = pg.locator("[data-pllieferant='Metalix'] .pl-zeile", has_text="1.4305 rd 12")
    pruefe(mz.count() == 1 and "📌" in mz.inner_text() and "kann auch: Schmobi, Notz" in mz.inner_text(), "Regel gespeichert: Metalix, kann auch Schmobi, Notz")
    # Regel aus der Zeile anlegen: 11SMnPb30 rd 16 muss bei Schmobi
    pg.locator(".pl-zeile", has_text="11SMnPb30 rd 16").locator("[data-pllwahl]").click()
    pg.wait_for_selector("#pl-regelfenster"); pg.select_option("[data-plrfmuss]", "Schmobi")
    pg.click("[data-plrfspeichern]"); pg.wait_for_timeout(900)
    pruefe(pg.locator("[data-pllieferant='Schmobi']", has_text="11SMnPb30 rd 16").count() == 1, "Regel aus der Zeile: 11SMnPb30 → Schmobi")
    pruefe(pg.locator("[data-pllieferant='Schmobi'] [data-pllwahl]", has_text="📌").count() >= 1, "📌 zeigt die Regel")
    # Eigenes Todo anlegen
    pg.click("#pl-todo-neu"); pg.wait_for_selector(".dialog textarea")
    pruefe(pg.locator(".dialog .feld-schieber input").count() == 1 and not pg.locator(".dialog .feld-schieber input").is_checked(), "Schieber steht auf Nur für mich")
    pg.wait_for_timeout(300); pg.screenshot(path=BILD + "/planer-todo-neu.png")
    pg.fill(".dialog textarea", "Zangen nachzählen"); pg.locator(".dialog button:has-text('Speichern')").click()
    pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-pltodo='eigen']", has_text="Zangen nachzählen").count() == 1, "neues Todo erscheint")
    pruefe("nur für mich" in pg.locator("[data-pltodo='eigen']", has_text="Zangen").inner_text(), "neues Todo nur für mich")
    pruefe(pg.evaluate("TEST.daten.planer_todos.find(t => t.text === 'Zangen nachzählen').fuer_alle") is False, "gespeichert fuer_alle false")
    # Fremdes „nur für mich“ erscheint nicht
    pruefe(pg.locator("[data-pltodo='eigen']", has_text="Geheim von jemand anderem").count() == 0, "fremdes privates Todo unsichtbar")
    pg.click("#pl-todo-neu"); pg.wait_for_selector(".dialog textarea")
    pg.click(".dialog .feld-schieber input"); pg.fill(".dialog textarea", "Für alle sichtbar")
    pg.locator(".dialog button:has-text('Speichern')").click(); pg.wait_for_timeout(800)
    pruefe(pg.evaluate("TEST.daten.planer_todos.find(t => t.text === 'Für alle sichtbar').fuer_alle") is True, "Schieber auf alle Admins")
    pg.locator("[data-pltodo='eigen']", has_text="Zangen").locator(".pl-haken").click(); pg.wait_for_timeout(600)
    pruefe(pg.locator("[data-pltodo='eigen']", has_text="Zangen").count() == 0, "abgehaktes Todo aus der Liste")
    pruefe("(1)" in pg.inner_text("#pl-abgeschlossen"), "Knopf Abgeschlossen zählt")
    pruefe(pg.locator("[data-pltodo='qs']").count() == 0, "keine QS-Meldungen im Todo")
    pg.click("#pl-abgeschlossen"); pg.wait_for_selector("#pl-abg")
    pruefe(pg.locator("#pl-abg [data-plabg]", has_text="Zangen").count() == 1, "Abgeschlossen zeigt Todo")
    pg.wait_for_timeout(300); pg.screenshot(path=BILD + "/planer-abgeschlossen.png")
    pg.locator("#pl-abg [data-plabg]", has_text="Zangen").locator("[data-plwieder]").click(); pg.wait_for_timeout(800)
    pruefe(pg.locator("#pl-abg [data-plabg]").count() == 0, "wieder offen aus dem Fenster")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-pltodo='eigen']", has_text="Zangen").count() == 1, "Todo wieder in der Liste")
    pg.click("[data-plansicht='start']"); pg.wait_for_timeout(600)
    pruefe(pg.locator(".pl-zeile").count() >= 4, "Ansicht nach Start")
    pg.click("#pl-lieferanten"); pg.wait_for_selector("#material-lieferanten")
    pruefe(pg.locator("[data-mllieferant='Notz']").count() == 1, "Lieferanten-Fenster")
    pruefe(pg.locator("[data-mllieferant='Notz'] .ml-form").count() == 0, "Lieferanten zugeklappt als Liste")
    pruefe(pg.locator("[data-mllieferant='Notz'] .ml-mini__tag--gruen").all_inner_texts() == ["Mi"], "Liste zeigt Liefert an Mi")
    pg.wait_for_timeout(400); pg.screenshot(path=BILD + "/planer-lieferanten-liste.png")
    pg.click("[data-mllieferant='Notz'] [data-mlzeile]"); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-mllieferant='Notz'] [data-mlliefert] .ml-tag--an").all_inner_texts() == ["Mi"], "Liefert an Mi in den Einstellungen")
    pruefe(pg.locator("[data-mllieferant='Notz'] [data-mlnotiz]").input_value() == "Frau Muster anrufen", "Bemerkung in den Einstellungen")
    pg.wait_for_timeout(600); pg.screenshot(path=BILD + "/planer-lieferanten.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # iPad hoch
    pg.set_viewport_size({"width": 820, "height": 1180}); pg.click("[data-plansicht='lieferant']"); pg.wait_for_timeout(700)
    pg.screenshot(path=BILD + "/planer-hoch.png")
    breite = pg.evaluate("document.querySelector('#pad-planer').scrollWidth <= document.querySelector('#pad-planer').clientWidth + 1")
    pruefe(breite, "iPad hoch ohne seitliches Rollen")
    # Seit 1.525.0 kein Reiter Planwand mehr im Planer
    pg.set_viewport_size({"width": 1180, "height": 820}); pg.wait_for_timeout(400)
    pruefe(pg.locator("[data-plreiter]").count() == 0, "kein Reiter Planwand mehr")
    pruefe(pg.locator("#pad .pad__zu, #pad .pad__neu").count() == 0, "keine Kopfzeile mit Schliessen und Neu laden")
    pg.screenshot(path=BILD + "/planer-ohne-reiter.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe(pg.locator("#pad-planer").is_visible() and pg.locator("[data-ja]").count() == 1, "Escape fragt erst nach")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe(pg.locator("#pad-planer").is_visible() and pg.locator("[data-ja]").count() == 0, "zweites Escape bleibt im Planer")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    try: pg.keyboard.press("Enter")
    except Exception: pass  # der Tab geht dabei zu
    haupt.wait_for_timeout(800)
    pruefe(pg.is_closed(), "Enter schliesst den Planer-Tab")
    # Im Pad gibt es keine Kachel Planer mehr
    haupt.locator("button:has-text('Pad Mode')").first.click(); haupt.wait_for_selector("#pad [data-padwo='qs']")
    pruefe(haupt.locator("#pad [data-padwo='planer']").count() == 0, "keine Kachel Planer im Pad")
    pruefe(not pf, "keine Fehler im Browser " + str(pf[:2]))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
