# Schnitt nur Arbeitstage (111.71.0): Beispiel von Patrick. Auftrag
# startet Montag mit 0, Dienstagmorgen 300 eingetragen -> Montag 300,
# Mittwoch 700 gesamt -> Dienstag 400. Ein am Samstag eingetragener
# Stand zählt beim Freitag, Samstag und Sonntag erscheinen nicht und
# zählen nicht im Schnitt. Neuer Auftrag beginnt bei null.
# Uhr: Mittwoch, 7. Oktober 2026, 14:00 in Zürich.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}, timezone_id="Europe/Zurich").new_page()
    pg.clock.set_fixed_time("2026-10-07T14:00:00+02:00")
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
    # Alter Auftrag A lief bis Mittwoch 30.9. (zählt nicht mit). Neuer
    # Auftrag N startet Donnerstag 1.10. mit 0. Fr 2.10. 500, am Samstag
    # 3.10. 900 eingetragen (Freitag gearbeitet), Mo 1000 (100 übers
    # Wochenende -> Freitag), Di 1300 -> Mo 300, Mi 1700 -> Di 400.
    pg.evaluate("""(() => {
      const D = TEST.daten;
      D.jobs.filter(j => j.machine_id === 'm-k1').forEach(j => { if (j.plan_status === 'laeuft') j.plan_status = 'geplant'; });
      const vorlage = D.jobs.find(j => j.machine_id === 'm-k1');
      D.jobs.push({ ...vorlage, id: 'tA', job_number: '10333-0001', plan_status: 'fertig',
        started_at: '2026-09-28T04:00:00Z', ended_at: '2026-09-30T14:00:00Z', target_quantity: 250, stand: 250 });
      D.jobs.push({ ...vorlage, id: 'tN', job_number: '10333-0002', plan_status: 'laeuft',
        started_at: '2026-10-01T04:00:00Z', ended_at: null, target_quantity: 5000, stand: 1700 });
      D.production_records = D.production_records.filter(z => z.machine_id !== 'm-k1');
      const r = (id, job, tag, q, zeit) => D.production_records.push({ id, machine_id: 'm-k1', job_id: job, record_date: tag, quantity: q, updated_at: zeit });
      r('a1', 'tA', '2026-09-29', 100, '2026-09-29T05:00:00Z');
      r('a2', 'tA', '2026-09-30', 250, '2026-09-30T05:00:00Z');
      r('n0', 'tN', '2026-10-01', 0,    '2026-10-01T05:00:00Z');
      r('n1', 'tN', '2026-10-02', 500,  '2026-10-02T05:00:00Z');
      r('n2', 'tN', '2026-10-03', 900,  '2026-10-03T06:00:00Z');
      r('n3', 'tN', '2026-10-05', 1000, '2026-10-05T05:00:00Z');
      r('n4', 'tN', '2026-10-06', 1300, '2026-10-06T05:00:00Z');
      r('n5', 'tN', '2026-10-07', 1700, '2026-10-07T05:00:00Z');
    })()""")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_text="10333-0002").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(600)

    tage = pg.locator("#pad .pad-tag u").all_inner_texts()
    if any(t.startswith("Sa") or t.startswith("So") for t in tage) or len(tage) != 7:
        fehler.append("Wochenende sichtbar: " + str(tage))
    balken = pg.locator("#pad .pad-tag b").all_inner_texts()
    # Di 29.9., Mi 30.9., Do 1.10., Fr 2.10., Mo 5.10., Di 6.10., Heute
    if balken != ["–", "–", "500", "500", "300", "400", "–"]:
        fehler.append("Balken falsch: " + str(balken) + str(tage))
    fuss = pg.inner_text("#pad #pad-stk-fuss")
    if "Schnitt 425 pro Arbeitstag" not in fuss: fehler.append("Schnitt Tage: " + fuss)
    pg.screenshot(path="schnitt-arbeitstage-pad.png")

    pg.click("#pad [data-stkansicht='woche']"); pg.wait_for_timeout(400)
    woche = pg.locator("#pad .pad-tag b").all_inner_texts()
    klein = pg.locator("#pad .pad-tag small").all_inner_texts()
    if woche[-2:] != ["500", "350"] or [k.replace("’", "'") for k in klein[-2:]] != ["1'000 · 2 T", "700 · 2 T"]:
        fehler.append("Woche: " + str(woche) + str(klein))
    br.close()
print("Schnitt Arbeitstage | Fehler:", "; ".join(fehler) if fehler else "keine")
