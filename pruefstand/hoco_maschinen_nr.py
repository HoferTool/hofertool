# Wunsch Patrick 15. Oktober 2026: Bei einer HOCO Nr. steht unter
# „Maschinen“ die Maschinen-Nr., auf der sie gelaufen ist. Vorher fragte die
# App eine Spalte ab, die es in jobs nicht gibt, und die Zelle blieb leer.
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
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    # Eine HOCO Nr. mit Auftrag auf einer Maschine mit Typ
    info = pg.evaluate("""() => {
        const j = TEST.daten.jobs.find(x => x.job_number && x.machine_id
            && (TEST.daten.machines.find(m => m.id === x.machine_id) || {}).type_id);
        const m = TEST.daten.machines.find(m => m.id === j.machine_id);
        // Dazu jüngere Aufträge auf allen Maschinen desselben Typs, damit
        // es mehr als vier sind; die jüngste Maschine muss vorne stehen
        const gleiche = TEST.daten.machines.filter(x => x.type_id === m.type_id);
        gleiche.forEach((x, i) => TEST.daten.jobs.push({ id: 'mx' + i, job_number: j.job_number,
            machine_id: x.id, planned_from: '2027-0' + (1 + (i % 9)) + '-01', plan_status: 'geplant' }));
        const neueste = gleiche[Math.min(gleiche.length, 9) - 1];
        return { hoco: j.job_number, nr: neueste.machine_number, anzahl: gleiche.length }; }""")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1200)
    pg.fill("#hoco-such", info["hoco"]); pg.wait_for_timeout(500)
    pg.locator(f"[data-hoco-auf='{info['hoco']}']").first.click(); pg.wait_for_timeout(1500)
    chips = pg.locator(".hocoteil__maschine").all_inner_texts()
    pruefe("Maschinen-Nr. " + info["nr"] + " steht da: " + str(chips), info["nr"] in chips)
    pruefe("nur die Nummer, ohne Name", all(" " not in c for c in chips))
    pruefe("höchstens vier bei " + str(info["anzahl"]) + " Maschinen", len(chips) == min(4, info["anzahl"]))
    pruefe("neueste vorne", chips[:1] == [info["nr"]])
    sel = pg.evaluate("""() => TEST.protokoll.filter(x => JSON.stringify(x).includes('planned_from')
        && JSON.stringify(x).includes('stand')).length""")
    pruefe("keine Abfrage mit Spalte stand", sel == 0)
    pg.screenshot(path="/tmp/hoco_maschinen_nr.png")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
