import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
zusatz = """
(() => {   // 160 Aufträge aus dem Import, weit in der Zukunft, ohne FA und Material
  for (let k = 0; k < 160; k++) daten.jobs.push({ id: 'imp' + k, job_number: '10900-' + k, machine_id: daten.machines[k % 6].id,
    planned_from: iso(new Date(Date.now() + (30 + k) * 86400000)), planned_days: 2, plan_status: 'geplant', fa_nr: null, material_menge: null });
  daten.jobs.forEach(j => { if (j.plan_status === 'laeuft') { j.fa_nr = null; j.material_menge = null; } });
  daten.jobs.push({ id: 'bald1', job_number: '10901-0001', machine_id: daten.machines[0].id, planned_from: iso(new Date(Date.now() + 5 * 86400000)), planned_days: 2, plan_status: 'geplant', fa_nr: null, material_menge: '30 kg' });
})();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":390,"height":844}, device_scale_factor=2).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_selector("#db-vorbereitung"); pg.wait_for_timeout(2500)
    print("Vorbereitung:", pg.evaluate("document.getElementById('db-vorbereitung').innerText.replace(/\\n+/g, ' · ')"))
    print("Fehler:", f[:3] if f else "keine")
    br.close()
