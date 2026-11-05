import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
zusatz = """
(() => {
  daten.profiles[0].role = 'extern';
  daten.machine_parks.push({ id: 'pe', name: 'Extern', is_active: true });
  daten.machines.push({ id: 'm-ex', park_id: 'pe', name: 'BNJ-42SY Zurbrügg', machine_number: '303', is_active: true, sort_order: 1 });
  daten.jobs.push({ id: 'jx1', job_number: '10841-0013', machine_id: 'm-ex', planned_from: arbeitstagPlus(montag, 0),
    planned_days: 8, plan_status: 'laeuft', started_at: new Date().toISOString(), target_quantity: 2000, color: '#0000ff' });
})();
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}).new_page()
    f=[]; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
            zusatz + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2200)
    # Produktion: Zustand als Externer ändern (Wunsch Patrick 5. November 2026)
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1800)
    knopf = pg.locator("[data-auftrag-status='jx1']")
    print("Zustandsknopf:", knopf.count(), "| Beenden:", pg.locator("[data-auftrag-ende='jx1']").count())
    knopf.first.click(); pg.wait_for_timeout(500)
    pg.locator(".dialog-huelle button", has_text="Rüsten").first.click(); pg.wait_for_timeout(1200)
    print("nach Rüsten:", pg.evaluate("TEST.daten.jobs.find(j => j.id === 'jx1').plan_status"))
    # QS Check im Pad: Knöpfe frei, läuft wählen
    pg.evaluate("location.hash='#produktion'")
    pg.evaluate("document.querySelector('#pad-knopf') && document.querySelector('#pad-knopf').click()"); pg.wait_for_timeout(1500)
    qs = pg.locator("button", has_text="QS Check")
    if qs.count(): qs.first.click(); pg.wait_for_timeout(1500)
    print("QS-Knöpfe:", pg.evaluate("[...document.querySelectorAll('[data-qsmaschine=m-ex] [data-qszustand]')].map(b => b.dataset.qszustand + (b.disabled ? ' zu' : ' frei'))"))
    b = pg.locator("[data-qsmaschine=m-ex] [data-qszustand=laeuft]")
    if b.count(): b.click(); pg.wait_for_timeout(1500)
    print("nach läuft:", pg.evaluate("TEST.daten.jobs.find(j => j.id === 'jx1').plan_status"))
    pg.screenshot(path="/tmp/claude-0/qs-extern.png")
    print("Fehler:", f[:3] if f else "keine")
    br.close()
