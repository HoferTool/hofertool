# Überlappende Aufträge einer Maschine: nie halbe Balken, die App räumt
# sofort auf (Patrick 10. November 2026: „halb halb sollte nie möglich sein“)
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_page(viewport={"width": 1600, "height": 950})
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    # Drei Aufträge auf eine Maschine legen, die sich überlappen
    ids = pg.evaluate("""() => {
      const D = TEST.daten; const m = D.machines[0].id;
      const heute = new Date(); const t = (n) => { const d = new Date(heute); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
      const mo = (n) => { const d = new Date(heute); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + n); return d.toISOString().slice(0,10); };
      for (const j of D.planwand) if (j.machine_id === m) j.machine_id = D.machines[1].id;
      for (const j of (D.jobs || [])) if (j.machine_id === m) j.machine_id = D.machines[1].id;
      const neu = [
        { id: 'ue-f', job_number: '10430-0001', plan_status: 'fertig', planned_from: mo(-7), planned_days: 5, target_quantity: 20 },
        { id: 'ue-l', job_number: '10430-0002', plan_status: 'laeuft', planned_from: mo(-4), planned_days: 4, target_quantity: 20 },
        { id: 'ue-g', job_number: '10007-0479', plan_status: 'geplant', planned_from: mo(-1), planned_days: 3, target_quantity: 20 },
      ].map((x) => Object.assign({ machine_id: m, created_at: '2026-11-01T08:00:00Z' }, x));
      for (const x of neu) { D.planwand.push(x); if (D.jobs && D.jobs !== D.planwand) D.jobs.push(Object.assign({}, x)); }
      return neu.map((x) => x.id);
    }""")
    pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken[data-auftrag='ue-g']"); pg.wait_for_timeout(2500)
    print("da:", pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag^=ue]')].map(b=>b.dataset.auftrag)"), pg.evaluate("TEST.daten.planwand.filter(x => x.id.startsWith('ue-')).map(x => [x.id, x.planned_from, x.planned_days, x.plan_status])"))
    hoehen = pg.evaluate("""() => ['ue-l','ue-g'].map(id => { const b = document.querySelector(".pw-balken[data-auftrag='" + id + "']"); const z = b.closest('.pw-zeile');
      return [id, Math.round(b.getBoundingClientRect().height), Math.round(z.getBoundingClientRect().height)] })""")
    print("Höhen:", hoehen)
    for id, h, z in hoehen:
        if h < z * 0.7: fehler.append(f"{id} nur halb hoch ({h} von {z})")
    daten = pg.evaluate("""() => TEST.daten.planwand.filter(x => x.id.startsWith('ue-')).map(x => [x.id, x.plan_status, x.planned_from, x.planned_days])""")
    print("Daten:", daten)
    jobs = pg.evaluate("() => (TEST.protokoll || []).filter(p => JSON.stringify(p).includes('ue-')).map(p => JSON.stringify(p).slice(0,160))")
    print("Anfragen:", jobs[-6:])
    lagen = pg.evaluate("""() => ['ue-l','ue-g'].map(id => { const r = document.querySelector(".pw-balken[data-auftrag='" + id + "']").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)] })""")
    print("Lagen:", lagen)
    d = {x[0]: x for x in daten}
    if d['ue-f'][3] != 3: fehler.append("fertiger Auftrag nicht gekürzt")
    if not (lagen[0][1] <= lagen[1][0] + 2): fehler.append("Balken überlappen noch: " + str(lagen))
    if BILD := os.environ.get("BILD_ORDNER"): pg.screenshot(path=BILD + "/ueberlappung.png")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
