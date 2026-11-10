# Laufenden Auftrag ziehen: erst Rückfrage „Auftrag läuft schon“,
# auf eine Maschine mit laufendem Auftrag gar nicht, und schlägt das
# Speichern fehl, gehen die ausgewichenen zurück (Patrick 10.11.2026)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(t, ok):
    print(("OK  " if ok else "FEHLER ") + t)
    if not ok: fehler.append(t)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_page(viewport={"width": 1600, "height": 950})
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""() => {
      const D = TEST.daten; const m = D.machines[0].id, m2 = D.machines[1].id;
      const heute = new Date();
      const mo = (n) => { const d = new Date(heute); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + n); return d.toISOString().slice(0,10); };
      for (const j of D.planwand) if (j.machine_id === m || j.machine_id === m2) j.machine_id = D.machines[2].id;
      for (const j of (D.jobs || [])) if (j.machine_id === m || j.machine_id === m2) j.machine_id = D.machines[2].id;
      const neu = [
        { id: 'lz-l', job_number: '10430-0002', part_number: '0002', customer_number: '10430', plan_status: 'laeuft', machine_id: m, planned_from: mo(0), planned_days: 3 },
        { id: 'lz-g', job_number: '10007-0479', part_number: '0479', customer_number: '10007', plan_status: 'geplant', machine_id: m, planned_from: mo(3), planned_days: 3 },
        { id: 'lz-l2', job_number: '10841-0009', part_number: '0009', customer_number: '10841', plan_status: 'laeuft', machine_id: m2, planned_from: mo(0), planned_days: 3 },
      ].map((x) => Object.assign({ created_at: '2026-11-01T08:00:00Z', target_quantity: 20 }, x));
      for (const x of neu) { D.planwand.push(x); if (D.jobs && D.jobs !== D.planwand) D.jobs.push(Object.assign({}, x)); }
    }""")
    pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken[data-auftrag='lz-l']"); pg.wait_for_timeout(2000)
    def lage(id): return pg.evaluate(f"(() => {{ const r = document.querySelector(\".pw-balken[data-auftrag='{id}']\").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }})()")
    def daten(id): return pg.evaluate(f"(() => {{ const x = TEST.daten.planwand.find(j => j.id === '{id}'); return [x.machine_id, x.planned_from]; }})()")
    def ziehen(id, dx, dy):
        x, y, w, h = lage(id); sx, sy = x + w / 2, y + h / 2
        pg.mouse.move(sx, sy); pg.mouse.down()
        for i in range(1, 11):
            pg.mouse.move(sx + dx * i / 10, sy + dy * i / 10); pg.wait_for_timeout(40)
        pg.mouse.up(); pg.wait_for_timeout(700)
    tag = 50
    vor = daten('lz-l')
    # 1. Gleiche Maschine, 2 Wochen später (auf lz-g drauf): Rückfrage, Nein
    ziehen('lz-l', tag * 2, 0)
    txt = pg.evaluate("document.querySelector('.dialog-huelle') ? document.querySelector('.dialog-huelle').innerText : ''")
    pruefe("Rückfrage kommt", "läuft bereits" in txt)
    pg.get_by_role("button", name="Nein").click(); pg.wait_for_timeout(700)
    pruefe("Nein lässt alles", daten('lz-l') == vor)
    # 2. Nochmals, Ja: verschoben, lz-g weicht aus
    g_vor = daten('lz-g')
    ziehen('lz-l', tag * 2, 0)
    pg.get_by_role("button", name="Ja, verschieben").click(); pg.wait_for_timeout(1500)
    pruefe("Ja verschiebt", daten('lz-l')[1] != vor[1])
    pruefe("Geplanter weicht aus", daten('lz-g')[1] != g_vor[1])
    if pg.query_selector(".dialog-huelle"): pg.get_by_role("button", name="Ja, Lücke lassen").click(); pg.wait_for_timeout(1200)
    # 3. Auf Maschine mit laufendem Auftrag: Warnung, nichts geändert
    vor = daten('lz-l')
    y1 = lage('lz-l')[1]; y2 = lage('lz-l2')[1]
    x1 = lage('lz-l')[0]; x2 = lage('lz-l2')[0]
    ziehen('lz-l', x2 - x1, y2 - y1)
    pg.wait_for_timeout(500)
    meld = pg.evaluate("document.body.innerText")
    pruefe("Warnung zwei laufende", "läuft schon" in meld)
    pruefe("Keine Rückfrage dabei", pg.query_selector(".dialog-huelle") is None)
    pruefe("Nichts geändert", daten('lz-l') == vor)
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:10])
