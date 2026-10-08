# Stückzahl und Stückzeit (111.101.0, Wunsch 8. Oktober 2026):
# - Pad: Zifferblock der Stückzahl startet leer.
# - Erste Stückzahl am Tag fragt „Wurde heute schon produziert?“.
#   Nein → Stand auf dem letzten Arbeitstag, Ja → heute, danach keine Frage.
# - Pad: Kachel Stückzeit neben dem Vorsprung, in Sekunden.
# - Beenden ohne Stückzeit geht nicht; mit Eingabe schon.
# - HOCO: „Produktionsanlage“ mit Spalten Einrichtblatt und Stückzeit,
#   „Gelaufen auf“ und „Artikelbezeichnung“ sind weg.
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
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_text="10333-0003").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(500)

    def staende():
        return pg.evaluate("TEST.daten.production_records.filter(z => z.job_id === 'tT').map(z => z.record_date + '=' + z.quantity).sort()")

    def eintragen(zahl, antwort):
        pg.click("#pad [data-padfeld='stand']"); pg.wait_for_selector(".zifferblock")
        if pg.inner_text("#zb-anzeige").strip() != "0" or not pg.locator(".zb-anzeige--leer").count():
            fehler.append("Zifferblock nicht leer: " + pg.inner_text("#zb-anzeige"))
        for z in str(zahl): pg.click(f".zifferblock [data-zb='{z}']")
        pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(600)
        frage = pg.locator(".dialog-huelle h2:has-text('Wurde heute schon produziert?')").count() > 0
        if antwort:
            if not frage: fehler.append("Frage fehlt bei " + str(zahl)); return
            pg.click(f".dialog-huelle [data-w='{antwort}']")
        elif frage:
            fehler.append("Frage kommt unnötig bei " + str(zahl)); pg.click(".dialog-huelle [data-w='ja']")
        pg.wait_for_timeout(900)

    # Nein: geht auf Montag, 12.10.
    eintragen(1500, "nein")
    if "2026-10-12=1500" not in staende(): fehler.append("Nein nicht beim Vortag: " + str(staende()))
    pg.evaluate("TEST.daten.production_records.forEach(z => { if (!z.updated_at) z.updated_at = '2026-10-13T06:00:00Z'; })")
    # Noch kein Stand heute: fragt wieder, Ja geht auf heute
    eintragen(1800, "ja")
    if "2026-10-13=1800" not in staende(): fehler.append("Ja nicht heute: " + str(staende()))
    pg.evaluate("TEST.daten.production_records.forEach(z => { if (!z.updated_at) z.updated_at = '2026-10-13T12:00:00Z'; })")
    # Zweite Eingabe heute: keine Frage mehr
    eintragen(1900, None)
    if "2026-10-13=1900" not in staende(): fehler.append("Zweite heute falsch: " + str(staende()))
    balken = pg.locator("#pad .pad-tag b").all_inner_texts()
    # Mo 12. = 600, Di 13. = 400
    if balken[-2:] != ["600", "400"]: fehler.append("Balken falsch: " + str(balken))

    # Stückzeit-Kachel neben dem Vorsprung
    if not pg.locator("#pad .pad-reihe2 .pad-karte2--verzug").count(): fehler.append("Vorsprung nicht in der Reihe")
    zeit = pg.locator("#pad [data-padfeld='stueckzeit']")
    if not zeit.count(): fehler.append("Stückzeit-Kachel fehlt")
    pg.screenshot(path="stueckzeit-pad.png")

    # Beenden ohne Stückzeit: abbrechen → bleibt offen
    def beenden():
        pg.click("#pad [data-padstatus]"); pg.wait_for_selector(".dialog-huelle [data-w='fertig']")
        pg.click(".dialog-huelle [data-w='fertig']"); pg.wait_for_selector(".dialog-huelle [data-ja]")
        pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(700)
    beenden()
    if not pg.locator(".zifferblock h2:has-text('Stückzeit fehlt')").count(): fehler.append("Keine Frage nach Stückzeit")
    pg.screenshot(path="stueckzeit-fehlt.png")
    pg.click(".zifferblock [data-zbnein]"); pg.wait_for_timeout(800)
    if pg.evaluate("TEST.daten.jobs.find(j => j.id === 'tT').plan_status") == "fertig": fehler.append("Ohne Stückzeit beendet")
    if "Stückzeit" not in pg.inner_text("body"): fehler.append("Keine Meldung zur Stückzeit")

    # Stückzeit in der Kachel eintragen
    zeit.click(); pg.wait_for_selector(".zifferblock")
    for z in "42": pg.click(f".zifferblock [data-zb='{z}']")
    pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(1200)
    gespeichert = pg.evaluate(f"(TEST.daten.hoco_type_data.find(z => z.hoco_nr === '10333-0003' && z.type_id === '{typ}') || {{}}).stueckzeit_s")
    if gespeichert != 42: fehler.append("Stückzeit nicht gespeichert: " + str(gespeichert))
    if "42 s" not in pg.inner_text("#pad .pad-karte2--zeit"): fehler.append("Kachel zeigt nicht 42 s")
    pg.screenshot(path="stueckzeit-pad-42.png")
    # Jetzt lässt er sich beenden, ohne Frage
    # Mit Stückzeit fragt es trotzdem jedes Mal (111.102.0): 42 steht da.
    # Erst abbrechen → bleibt offen; dann neue Zahl tippen → ersetzt 42.
    beenden()
    if not pg.locator(".zifferblock h2:has-text('Stückzeit bestätigen')").count(): fehler.append("Fragt nicht nochmals")
    if pg.inner_text("#zb-anzeige").strip() != "42": fehler.append("Bisherige Stückzeit nicht vorgegeben: " + pg.inner_text("#zb-anzeige"))
    pg.screenshot(path="stueckzeit-bestaetigen.png")
    pg.click(".zifferblock [data-zbnein]"); pg.wait_for_timeout(800)
    if pg.evaluate("TEST.daten.jobs.find(j => j.id === 'tT').plan_status") == "fertig": fehler.append("Abbrechen hat trotzdem beendet")
    beenden()
    for z in "38": pg.click(f".zifferblock [data-zb='{z}']")
    if pg.inner_text("#zb-anzeige").strip() != "38": fehler.append("Neue Zahl ersetzt nicht: " + pg.inner_text("#zb-anzeige"))
    pg.click(".zifferblock [data-zbja]"); pg.wait_for_timeout(1500)
    neu = pg.evaluate(f"(TEST.daten.hoco_type_data.find(z => z.hoco_nr === '10333-0003' && z.type_id === '{typ}') || {{}}).stueckzeit_s")
    if neu != 38: fehler.append("Neue Stückzeit nicht gespeichert: " + str(neu))
    if pg.evaluate("TEST.daten.jobs.find(j => j.id === 'tT').plan_status") != "fertig": fehler.append("Mit Stückzeit nicht beendet")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(600)

    # HOCO Nr.: Produktionsanlage mit Stückzeit, ohne „Gelaufen auf“ und Bezeichnung
    pg.evaluate("TEST.daten.hoco_parts.push({ hoco_nr: '10333-0003', bezeichnung: 'Geheimteil', material: 'CW614N', zeichnung_url: null })")
    pg.evaluate("location.hash='#/planwand'"); pg.wait_for_selector("#pw-hoco"); pg.wait_for_timeout(800)
    pg.click("#pw-hoco"); pg.wait_for_selector("#hoco-such")
    pg.fill("#hoco-such", "10333-0003"); pg.wait_for_timeout(500)
    pg.click("[data-hoco-auf='10333-0003']"); pg.wait_for_timeout(1500)
    text = pg.inner_text("#hoco-fensterinhalt")
    for w in ["Produktionsanlage", "Einrichtblatt", "Stückzeit", "38 s"]:
        if w not in text: fehler.append("HOCO ohne " + w)
    for w in ["Gelaufen auf", "Artikelbezeichnung", "Geheimteil", "Einrichtblätter"]:
        if w in text: fehler.append("HOCO zeigt noch " + w)
    pg.screenshot(path="stueckzeit-hoco.png", full_page=True)
    br.close()
print("Stückzahl und Stückzeit | Fehler:", "; ".join(fehler) if fehler else "keine")
