# Stückzahl einem früheren Tag zuordnen (111.49.0): Im Pad Mode wählt
# man im Zifferblock den Tag. Was am Freitag gemacht, aber erst am
# Montag eingetragen wird, zählt beim Freitag. Die Uhr steht fest auf
# Montag, 5. Oktober 2026, 14:00 in Zürich.
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
    # Auftrag T läuft seit Mittwoch, 30.9., auf m-k1; am Donnerstag stand er bei 1'000
    pg.evaluate("""(() => {
      const D = TEST.daten;
      D.jobs.filter(j => j.machine_id === 'm-k1').forEach(j => { if (j.plan_status === 'laeuft') j.plan_status = 'geplant'; });
      const vorlage = D.jobs.find(j => j.machine_id === 'm-k1');
      D.jobs.push({ ...vorlage, id: 'tT', job_number: '10333-0003', plan_status: 'laeuft',
        started_at: '2026-09-30T06:00:00Z', ended_at: null, target_quantity: 5000, stand: 1000 });
      D.production_records = D.production_records.filter(z => z.machine_id !== 'm-k1');
      D.production_records.push(
        { id: 't1', machine_id: 'm-k1', job_id: 'tT', record_date: '2026-09-30', quantity: 538, updated_at: '2026-09-30T14:00:00Z' },
        { id: 't2', machine_id: 'm-k1', job_id: 'tT', record_date: '2026-10-01', quantity: 1000, updated_at: '2026-10-01T12:00:00Z' });
    })()""")
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_text="10333-0003").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(500)

    def eintragen(tag, zahl):
        pg.click("#pad [data-padfeld='stand']"); pg.wait_for_selector(".zifferblock")
        if tag: pg.click(f".zifferblock [data-zbtag='{tag}']")
        pg.click(".zifferblock [data-zb='C']")
        for z in str(zahl): pg.click(f".zifferblock [data-zb='{z}']")
        pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(900)

    # Knöpfe: Heute, Fr 2., Do 1., Mi 30. (Sa/So übersprungen, nichts vor dem Beginn)
    pg.click("#pad [data-padfeld='stand']"); pg.wait_for_selector(".zifferblock")
    knoepfe = pg.locator(".zifferblock [data-zbtag]").all_inner_texts()
    if knoepfe != ["Heute", "Fr 2.", "Do 1.", "Mi 30."]: fehler.append("Tagknöpfe falsch: " + str(knoepfe))
    if pg.get_attribute(".zifferblock [data-zbtag='2026-10-05']", "aria-pressed") != "true":
        fehler.append("Heute ist nicht vorgewählt")
    pg.screenshot(path="stueck-tag-zifferblock.png")
    pg.click(".zifferblock [data-zbnein]"); pg.wait_for_timeout(300)

    eintragen("2026-10-02", 1308)
    eintragen(None, 1725)
    zeilen = pg.evaluate("TEST.daten.production_records.filter(z => z.machine_id === 'm-k1').map(z => z.record_date + '=' + z.quantity).sort()")
    if "2026-10-02=1308" not in zeilen: fehler.append("Freitag nicht gespeichert: " + str(zeilen))
    if "2026-10-05=1725" not in zeilen: fehler.append("Heute nicht gespeichert: " + str(zeilen))
    # Balken: Do 462, Fr 308, Sa/So leer, heute 417
    # Den Zeitstempel setzt in der echten Datenbank ein Auslöser; der
    # Nachbau kennt keinen, darum hier von Hand, dann neu zeichnen lassen
    pg.evaluate("TEST.daten.production_records.forEach(z => { if (!z.updated_at) z.updated_at = '2026-10-05T12:00:00Z'; })")
    eintragen(None, 1725)
    balken = pg.locator("#pad .pad-tag b").all_inner_texts()
    if balken[-4:] != ["308", "–", "–", "417"] or balken[-5] != "462":
        fehler.append("Balken falsch: " + str(balken))
    unten = pg.locator("#pad .pad-tag small").all_inner_texts()
    if unten[-4] != "Mo 14:00" or unten[-1] != "14:00": fehler.append("Freitag ohne Eintragetag: " + str(unten))
    pg.screenshot(path="stueck-tag-pad.png")

    # Auftrag erst heute begonnen: keine Tagwahl
    pg.evaluate("TEST.daten.jobs.find(j => j.id === 'tT').started_at = '2026-10-05T07:00:00Z'")
    pg.click("#pad [data-padfeld='stand']"); pg.wait_for_selector(".zifferblock")
    if pg.locator(".zifferblock [data-zbtag]").count(): fehler.append("Tagwahl trotz Beginn heute")
    pg.click(".zifferblock [data-zbnein]")
    br.close()
print("Stückzahl Tag | Fehler:", "; ".join(fehler) if fehler else "keine")
