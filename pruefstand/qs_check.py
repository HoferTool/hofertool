# QS Check im Pad Mode (1.16.0, Wunsch Patrick 10. Oktober 2026):
# Knopf unter „Maschinen“, Liste aller Maschinen mit dem Auftrag, der
# dran ist, Zustand am Ende der Zeile direkt wechseln. Dazu Bilder am
# Computer, auf dem iPad und am Handy.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("QS_BILDER", "")

def seite(br, b, h, mobil=False):
    ctx = br.new_context(viewport={"width": b, "height": h}, timezone_id="Europe/Zurich",
                         has_touch=mobil, is_mobile=mobil)
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-10-13T14:00:00+02:00")
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
    pg.evaluate("""() => {
      const D = TEST.daten;
      const m = D.machines.find(x => x.id === 'm-k1');
      if (!m.type_id) m.type_id = 't1';
      D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
      const basis = { machine_id: 'm-k1', ended_at: null, planned_days: 3, target_quantity: 1000 };
      D.jobs.push({ ...basis, id: 'qA', job_number: '10444-0001', plan_status: 'ruesten',
        started_at: '2026-10-01T04:00:00Z', planned_from: '2026-10-01' });
      // So viele Maschinen wie im Betrieb (28): Kurz 6, Lang 20, Extern 2
      if (!D.machine_parks.find(x => x.id === 'p-ext'))
        D.machine_parks.push({ id: 'p-ext', name: 'Extern', is_active: true });
      const zahl = (pk) => D.machines.filter(x => x.park_id === pk && x.is_active !== false).length;
      for (const [pk, soll, vor] of [['p-lang', 20, 'L'], ['p-kurz', 6, 'K'], ['p-ext', 2, 'E']]) {
        for (let i = zahl(pk); i < soll; i++) {
          const id = 'mx-' + pk + i;
          D.machines.push({ id, park_id: pk, name: 'Citizen L20-' + i, machine_number: vor + '-' + (3000 + i),
            is_active: true, sort_order: 100 + i, type_id: null });
          D.jobs.push({ id: 'jx' + id, machine_id: id, job_number: '10' + (500 + i) + '-0' + (100 + i),
            plan_status: ['laeuft', 'ruesten', 'qs', 'geplant'][i % 4], ended_at: null,
            planned_from: '2026-10-0' + (1 + i % 9), started_at: '2026-10-01T04:00:00Z', target_quantity: 1200 });
        }
      }
      D.jobs.push({ ...basis, id: 'qB', job_number: '10444-0002', plan_status: 'geplant',
        started_at: '2026-09-01T04:00:00Z', planned_from: '2026-10-20' });
    }""")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='qs']")
    return pg

def zustand(pg, i):
    return pg.evaluate(f"TEST.daten.jobs.find(j => j.id === '{i}').plan_status")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = seite(br, 1500, 950)
    if BILDER: pg.screenshot(path=BILDER + "/qs-start.png")
    pg.click("#pad [data-padwo='qs']"); pg.wait_for_selector("#pad .pad-qs__zeile")
    pg.wait_for_timeout(600)
    n = pg.locator("#pad .pad-qs__zeile").count()
    nm = pg.evaluate("TEST.daten.machines.filter(m => m.is_active !== false).length")
    if n < 2: fehler.append(f"zu wenige Zeilen: {n} (Maschinen {nm})")
    z = pg.locator("#pad [data-qsmaschine='m-k1']")
    if "10444-0001" not in z.inner_text(): fehler.append("Auftrag fehlt in der Zeile: " + z.inner_text())
    if "pad-zustand--ruesten" not in (z.locator("[data-qszustand='ruesten']").get_attribute("class") or ""):
        fehler.append("Rüsten nicht hervorgehoben")
    if BILDER: pg.screenshot(path=BILDER + "/qs-liste.png")

    z.locator("[data-qszustand='qs']").click(); pg.wait_for_timeout(1200)
    if zustand(pg, "qA") != "qs": fehler.append("QS nicht gesetzt: " + zustand(pg, "qA"))
    z = pg.locator("#pad [data-qsmaschine='m-k1']")
    if "pad-zustand--qs" not in (z.locator("[data-qszustand='qs']").get_attribute("class") or ""):
        fehler.append("Liste nach Wechsel nicht neu")
    z.locator("[data-qszustand='laeuft']").click(); pg.wait_for_timeout(1200)
    if zustand(pg, "qA") != "laeuft": fehler.append("Läuft nicht gesetzt")

    # Beenden: Rückfrage, Stückzeit, nächster auf Rüsten und in der Zeile
    pg.locator("#pad [data-qsmaschine='m-k1'] [data-qszustand='fertig']").click()
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.click(".dialog-huelle [data-ja]")
    pg.wait_for_selector(".zifferblock [data-zbja]")
    pg.locator(".zifferblock").get_by_text("3", exact=True).first.click()
    pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(1500)
    if zustand(pg, "qA") != "fertig": fehler.append("nicht beendet: " + zustand(pg, "qA"))
    if zustand(pg, "qB") != "ruesten": fehler.append("Nächster nicht auf Rüsten: " + zustand(pg, "qB"))
    if "10444-0002" not in pg.locator("#pad [data-qsmaschine='m-k1']").inner_text():
        fehler.append("Nächster steht nicht in der Zeile")

    pg.click("#pad [data-padzurueck]"); pg.wait_for_selector("#pad [data-padwo='qs']")

    for name, b, h, mob in [("ipad", 1180, 820, True), ("ipad-hoch", 820, 1180, True), ("handy", 390, 844, True)]:
        q = seite(br, b, h, mob)
        q.click("#pad [data-padwo='qs']"); q.wait_for_selector("#pad .pad-qs__zeile"); q.wait_for_timeout(700)
        breit = q.evaluate("document.querySelector('#pad .pad-qs').scrollWidth - document.querySelector('#pad .pad-qs').clientWidth")
        if breit > 1: fehler.append(f"{name}: ragt seitlich {breit}px heraus")
        if name == "ipad":
            hoch = q.evaluate("(() => { const e = document.querySelector('#pad .pad-qs'); return e.scrollHeight - e.clientHeight; })()")
            if hoch > 1: fehler.append(f"iPad quer: nicht alles auf einem Bildschirm, {hoch}px zu viel")
        if BILDER: q.screenshot(path=f"{BILDER}/qs-{name}.png")
        q.context.close()
    br.close()

print("Fehler:", "keine" if not fehler else "\n  " + "\n  ".join(fehler))
