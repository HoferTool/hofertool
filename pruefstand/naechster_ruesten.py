# Beim Beenden rückt der nächste Auftrag auf derselben Maschine auf
# Rüsten, nicht mehr gleich auf „läuft“ (111.106.0, Wunsch 8. Oktober 2026).
# Geprüft im Pad Mode; Produktion, Planwand und Auftragsfenster laufen
# durch dieselbe Stelle (zustandSetzen). Ein Nächster, der schon auf QS
# steht, bleibt dort.
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

    def aufbauen(naechsterZustand):
        pg.evaluate("""(z) => {
          const D = TEST.daten;
          const m = D.machines.find(x => x.id === 'm-k1');
          if (!m.type_id) m.type_id = 't1';
          D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
          const basis = { machine_id: 'm-k1', ended_at: null, planned_days: 3, target_quantity: 1000 };
          D.jobs.push({ ...basis, id: 'tA', job_number: '10333-0001', plan_status: 'laeuft',
            started_at: '2026-10-01T04:00:00Z', planned_from: '2026-10-01' });
          D.jobs.push({ ...basis, id: 'tB', job_number: '10333-0002', plan_status: z,
            started_at: '2026-09-01T04:00:00Z', planned_from: '2026-10-14' });
          D.jobs.push({ ...basis, id: 'tC', job_number: '10333-0004', plan_status: 'geplant',
            started_at: '2026-09-01T04:00:00Z', planned_from: '2026-10-20' });
          D.hoco_type_data = D.hoco_type_data.filter(x => x.hoco_nr !== '10333-0001');
          D.hoco_type_data.push({ hoco_nr: '10333-0001', type_id: m.type_id, stueckzeit_s: 30 });
        }""", naechsterZustand)

    def beendenImPad():
        pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
        pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
        pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
        if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
        pg.locator("#pad .pad-kachel--maschine").filter(has_text="10333-0001").first.click()
        pg.wait_for_selector("#pad [data-padstatus]"); pg.wait_for_timeout(500)
        pg.click("#pad [data-padstatus]"); pg.wait_for_selector(".dialog-huelle [data-w='fertig']")
        t = pg.inner_text(".dialog-huelle [data-w='fertig']")
        if "Rüsten" not in t: fehler.append("Auswahl ohne Hinweis auf Rüsten: " + t)
        pg.click(".dialog-huelle [data-w='fertig']"); pg.wait_for_selector(".dialog-huelle [data-ja]")
        if "steht auf Rüsten" not in pg.inner_text(".dialog-huelle"): fehler.append("Rückfrage nennt Rüsten nicht")
        pg.click(".dialog-huelle [data-ja]"); pg.wait_for_selector(".zifferblock [data-zbja]")
        pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(1500)

    def zustand(i):
        return pg.evaluate(f"TEST.daten.jobs.find(j => j.id === '{i}').plan_status")

    aufbauen("geplant")
    beendenImPad()
    if zustand("tA") != "fertig": fehler.append("A nicht beendet: " + zustand("tA"))
    if zustand("tB") != "ruesten": fehler.append("Nächster nicht auf Rüsten: " + zustand("tB"))
    if zustand("tC") != "geplant": fehler.append("Übernächster verändert: " + zustand("tC"))
    if pg.evaluate("TEST.daten.jobs.find(j => j.id === 'tB').started_at") != "2026-09-01T04:00:00Z":
        fehler.append("Startzeit des Nächsten verändert")
    if "steht jetzt auf Rüsten" not in pg.inner_text("body"): fehler.append("Meldung fehlt")
    pg.screenshot(path="naechster-ruesten.png")
    # Im Pad steht jetzt der gerüstete Auftrag an der Maschine
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(600)

    # Steht der Nächste schon auf QS, bleibt er dort
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector("#inhalt")
    aufbauen("qs")
    beendenImPad()
    if zustand("tB") != "qs": fehler.append("QS wurde überschrieben: " + zustand("tB"))
    if zustand("tC") != "geplant": fehler.append("Übernächster bei QS verändert: " + zustand("tC"))
    br.close()
print("Nächster auf Rüsten | Fehler:", "; ".join(fehler) if fehler else "keine")
