# Letzte Stückzahl beim Auftragswechsel (1.25.0, Wunsch Patrick 12. Oktober 2026):
# - Beenden im Pad fragt nach dem Zählerstand, die Zahl geht auf heute.
# - „Überspringen“ lässt alles, wie es ist, und beendet trotzdem.
# - Startet in der Produktion ein anderer Auftrag auf derselben Maschine,
#   fragt die App beim abgelösten nach dem Zählerstand.
# Die Uhr steht fest auf Dienstag, 13. Oktober 2026, 14:00 in Zürich.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}, timezone_id="Europe/Zurich").new_page()
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
    # Auftrag T läuft seit 1.10. auf m-k1 (Typ gesetzt), letzter Stand Fr 9.10.
    typ = pg.evaluate("""(() => {
      const D = TEST.daten;
      const m = D.machines.find(x => x.id === 'm-k1');
      if (!m.type_id) m.type_id = 't1';
      D.jobs.filter(j => j.machine_id === 'm-k1').forEach(j => { if (j.plan_status === 'laeuft') j.plan_status = 'geplant'; });
      const vorlage = D.jobs.find(j => j.machine_id === 'm-k1');
      D.jobs.push({ ...vorlage, id: 'tT', job_number: '10333-0003', plan_status: 'laeuft',
        started_at: '2026-10-01T04:00:00Z', ended_at: null, target_quantity: 5000, stand: 900,
        planned_from: '2026-10-01' });
      D.production_records = D.production_records.filter(z => z.machine_id !== 'm-k1');
      D.production_records.push(
        { id: 't1', machine_id: 'm-k1', job_id: 'tT', record_date: '2026-10-09', quantity: 900, updated_at: '2026-10-09T15:00:00Z' });
      return m.type_id;
    })()""")
    pg.evaluate("TEST.daten.production_records.push({ id: 't2', machine_id: 'm-k1', job_id: 'tT', record_date: '2026-10-13', quantity: 1000, updated_at: '2026-10-13T08:00:00Z' })")
    def staende(jid):
        return pg.evaluate(f"TEST.daten.production_records.filter(z => z.job_id === '{jid}').map(z => z.record_date + '=' + z.quantity).sort()")

    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_text="10333-0003").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(500)

    pg.click("#pad [data-padstatus]"); pg.wait_for_selector(".dialog-huelle [data-w='fertig']")
    pg.click(".dialog-huelle [data-w='fertig']"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(700)
    if not pg.locator(".zifferblock h2:has-text('Letzte Stückzahl')").count(): fehler.append("Pad: keine Frage nach der letzten Stückzahl")
    else:
        t = pg.inner_text(".zifferblock")
        if "1'000" not in t and "1’000" not in t: fehler.append("Pad: bisheriger Stand fehlt: " + t[:120])
        if "Überspringen" not in t: fehler.append("Pad: kein Überspringen")
        pg.screenshot(path="letzte-stueckzahl.png")
        for z in "1250": pg.click(f".zifferblock [data-zb='{z}']")
        pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(800)
    # Danach kommt die Stückzeit
    if not pg.locator(".zifferblock h2:has-text('Stückzeit')").count(): fehler.append("Pad: Stückzeit kommt nicht danach")
    else:
        for z in "40": pg.click(f".zifferblock [data-zb='{z}']")
        pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(1200)
    if "2026-10-13=1250" not in staende("tT"): fehler.append("Pad: Stand nicht gespeichert: " + str(staende("tT")))
    if pg.evaluate("TEST.daten.jobs.find(j => j.id === 'tT').plan_status") != "fertig": fehler.append("Pad: nicht beendet")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(600)

    # Produktion: U läuft auf m-k1, „Beenden“ → Frage, Überspringen → beendet, Stand bleibt
    pg.evaluate("""(() => {
      const D = TEST.daten;
      const vorlage = D.jobs.find(j => j.id === 'tT');
      D.jobs.filter(j => j.machine_id === 'm-k1' && !j.ended_at).forEach(j => { j.plan_status = 'geplant'; });
      D.jobs.push({ ...vorlage, id: 'tU', job_number: '10444-0004', plan_status: 'laeuft', started_at: '2026-10-13T05:00:00Z', ended_at: null, planned_from: '2026-10-12' });
      D.production_records.push({ id: 't3', machine_id: 'm-k1', job_id: 'tU', record_date: '2026-10-13', quantity: 300, updated_at: '2026-10-13T09:00:00Z' });
    })()""")
    pg.evaluate("location.hash='#produktion'")
    pg.wait_for_selector(".parkwahl__knopf"); pg.wait_for_timeout(500)
    pg.click(".parkwahl__knopf[data-park='p-kurz']"); pg.wait_for_timeout(800)
    pg.click("[data-auftrag-ende='tU']"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(700)
    if not pg.locator(".zifferblock h2:has-text('Letzte Stückzahl')").count(): fehler.append("Produktion: keine Frage")
    else:
        if "300" not in pg.inner_text(".zifferblock"): fehler.append("Produktion: bisher 300 fehlt")
        pg.click(".zifferblock [data-zbnein]"); pg.wait_for_timeout(700)
    if pg.locator(".zifferblock h2:has-text('Stückzeit')").count():
        for z in "30": pg.click(f".zifferblock [data-zb='{z}']")
        pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(1200)
    else: fehler.append("Produktion: Stückzeit kommt nicht")
    if staende("tU") != ["2026-10-13=300"]: fehler.append("Produktion: Überspringen hat etwas geändert: " + str(staende("tU")))
    if pg.evaluate("TEST.daten.jobs.find(j => j.id === 'tU').plan_status") != "fertig": fehler.append("Produktion: nicht beendet " + pg.inner_text("body")[-300:])
    br.close()
print("Letzte Stückzahl | Fehler:", "; ".join(fehler) if fehler else "keine")
