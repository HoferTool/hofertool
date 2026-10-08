# Stückzahl beim Vortag (111.50.0): Der Gesamtzähler wird am Morgen
# danach eingetragen. Im Pad Mode gehört die Zunahme darum zum Tag des
# vorherigen Stands: Was am Montag eingetragen wird, zählt beim Freitag,
# heute bleibt leer. Die Uhr steht fest auf Montag, 5. Oktober 2026,
# 14:00 in Zürich. Seit 111.101.0 gilt diese Regel nur noch für Stände
# vor dem 8. Oktober 2026 (neue Regel: stueckzeit.py).
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}, timezone_id="Europe/Zurich").new_page()
    pg.clock.set_fixed_time("2026-10-05T14:00:00+02:00")
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
    # Auftrag T läuft seit Mittwoch, 30.9., auf m-k1. Eingetragen am
    # Donnerstag- und Freitagmorgen: 500 und 962.
    pg.evaluate("""(() => {
      const D = TEST.daten;
      D.jobs.filter(j => j.machine_id === 'm-k1').forEach(j => { if (j.plan_status === 'laeuft') j.plan_status = 'geplant'; });
      const vorlage = D.jobs.find(j => j.machine_id === 'm-k1');
      D.jobs.push({ ...vorlage, id: 'tT', job_number: '10333-0003', plan_status: 'laeuft',
        started_at: '2026-09-30T04:00:00Z', ended_at: null, target_quantity: 5000, stand: 962 });
      D.production_records = D.production_records.filter(z => z.machine_id !== 'm-k1');
      D.production_records.push(
        { id: 't1', machine_id: 'm-k1', job_id: 'tT', record_date: '2026-10-01', quantity: 500, updated_at: '2026-10-01T05:00:00Z' },
        { id: 't2', machine_id: 'm-k1', job_id: 'tT', record_date: '2026-10-02', quantity: 962, updated_at: '2026-10-02T05:05:00Z' });
    })()""")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_text="10333-0003").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(500)

    def eintragen(zahl):
        pg.click("#pad [data-padfeld='stand']"); pg.wait_for_selector(".zifferblock")
        pg.click(".zifferblock [data-zb='C']")
        for z in str(zahl): pg.click(f".zifferblock [data-zb='{z}']")
        pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(600)
        # Seit 111.100.0 fragt die erste Zahl am Tag: Ja = für heute
        if pg.locator(".dialog-huelle [data-w='ja']").count(): pg.click(".dialog-huelle [data-w='ja']")
        pg.wait_for_timeout(900)

    # Vor der Eingabe am Montag: Mi 500, Do 462, Freitag noch offen
    balken = pg.locator("#pad .pad-tag b").all_inner_texts()
    # (seit 111.71.0 nur Arbeitstage: Fr 25. bis Mo 5.)
    if balken != ["–", "–", "–", "500", "462", "–", "–"]: fehler.append("Vorher falsch: " + str(balken))

    # Montag 14:00 den Stand eintragen
    eintragen(1270)
    gespeichert = pg.evaluate("TEST.daten.production_records.filter(z => z.machine_id === 'm-k1').map(z => z.record_date + '=' + z.quantity).sort()")
    if "2026-10-05=1270" not in gespeichert: fehler.append("Nicht am Eingabetag gespeichert: " + str(gespeichert))
    # Den Zeitstempel setzt in der echten Datenbank ein Auslöser; der
    # Nachbau kennt keinen, darum hier von Hand, dann neu zeichnen lassen
    pg.evaluate("TEST.daten.production_records.forEach(z => { if (!z.updated_at) z.updated_at = '2026-10-05T12:00:00Z'; })")
    eintragen(1270)
    balken = pg.locator("#pad .pad-tag b").all_inner_texts()
    if balken != ["–", "–", "–", "500", "462", "308", "–"]: fehler.append("Freitag nicht 308: " + str(balken))
    unten = pg.locator("#pad .pad-tag small").all_inner_texts()
    if unten[5] != "Mo 14:00" or unten[4] != "Fr 07:05" or unten[-1] != "—":
        fehler.append("Eintragezeit falsch: " + str(unten))
    neben = pg.inner_text("#pad .pad-stk-neben")
    if "Fr 2. 308 Stk" not in neben: fehler.append("Neben der Zahl: " + neben)
    if pg.inner_text("#pad .pad-stk-zahl").replace("’", "'") != "1'270": fehler.append("Zähler: " + pg.inner_text("#pad .pad-stk-zahl"))
    pg.screenshot(path="stueck-tag-pad.png")
    br.close()
print("Stückzahl Vortag | Fehler:", "; ".join(fehler) if fehler else "keine")
