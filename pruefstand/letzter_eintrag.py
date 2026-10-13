# Letzten Eintrag löschen (1.42.0, Wunsch Patrick 13. Oktober 2026):
# In Produktion → Erfassen löscht „Letzten Eintrag löschen“ nach einer
# Rückfrage den jüngsten Zählerstand des laufenden Auftrags, Rückgängig
# holt ihn zurück.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}, timezone_id="Europe/Zurich").new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""(() => {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const h = new Date(); const heute = iso(h);
      const gestern = iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 1));
      const D = TEST.daten;
      D.jobs.filter(j => j.machine_id === 'm-k1').forEach(j => { if (j.plan_status === 'laeuft') j.plan_status = 'geplant'; });
      const vorlage = D.jobs.find(j => j.machine_id === 'm-k1');
      D.jobs.push({ ...vorlage, id: 'lE', job_number: '10444-0004', plan_status: 'laeuft',
        started_at: new Date(Date.now() - 3 * 864e5).toISOString(), ended_at: null, target_quantity: 5000 });
      D.production_records = D.production_records.filter(z => z.machine_id !== 'm-k1');
      D.production_records.push(
        { id: 'e1', machine_id: 'm-k1', job_id: 'lE', record_date: gestern, quantity: 700 },
        { id: 'e2', machine_id: 'm-k1', job_id: 'lE', record_date: heute, quantity: 1250 });
    })()""")
    pg.evaluate("location.hash='#produktion'")
    pg.wait_for_selector(".parkwahl__knopf"); pg.wait_for_timeout(500)
    pg.click(".parkwahl__knopf[data-park='p-kurz']"); pg.wait_for_timeout(600)
    for modus in ["tag", "woche"]:
        pg.click(f"[data-modus='{modus}']"); pg.wait_for_timeout(700)
        k = pg.locator("[data-letzter-weg='m-k1']")
        if not k.count(): fehler.append(modus + ": Knopf fehlt")
        elif "1’250" not in k.first.inner_text(): fehler.append(modus + ": Text " + k.first.inner_text())
    pg.click("[data-modus='tag']"); pg.wait_for_timeout(700)
    pg.click("[data-letzter-weg='m-k1']"); pg.wait_for_selector(".dialog-huelle")
    t = pg.locator(".dialog-huelle").inner_text()
    if "1’250" not in t: fehler.append("Rückfrage ohne Zahl: " + t[:120])
    pg.locator(".dialog-huelle .knopf--gefahr").click(); pg.wait_for_timeout(1200)
    rest = pg.evaluate("TEST.daten.production_records.filter(z => z.machine_id === 'm-k1').map(z => z.quantity)")
    if rest != [700]: fehler.append("Nach dem Löschen: " + str(rest))
    k = pg.locator("[data-letzter-weg='m-k1']")
    if not k.count() or "700" not in k.first.inner_text(): fehler.append("Danach zeigt der Knopf nicht 700")
    # Rückgängig holt ihn zurück
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(1500)
    rest = pg.evaluate("TEST.daten.production_records.filter(z => z.machine_id === 'm-k1').map(z => z.quantity).sort((a,b)=>a-b)")
    if rest != [700, 1250]: fehler.append("Nach Rückgängig: " + str(rest))
    pg.screenshot(path="/tmp/letzter_eintrag.png")
    br.close()
print("Fehler:", "keine" if not fehler else "")
for f in fehler: print(" -", f)
