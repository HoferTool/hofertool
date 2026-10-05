# Auftragswechsel (111.45.0): Die Produktion zeigt am Tag einen Hinweis
# mit Uhrzeit und altem → neuem Auftrag, die Tagesleistung zählt beide
# Aufträge des Tages, und die Statistik im Pad Mode beginnt beim neuen
# Auftrag von vorn.
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
    # Auf Kurzdreher-Maschine m-k1 heute: alter Auftrag A bis 800 Stück,
    # um 09:30 Wechsel auf B, B macht bis jetzt 150 Stück. Gestern stand A
    # bei 500. Tagesleistung heute also 300 + 150 = 450.
    pg.evaluate("""(() => {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const h = new Date(); const heute = iso(h);
      const g = new Date(h.getFullYear(), h.getMonth(), h.getDate() - 1); const gestern = iso(g);
      const um = (std, min) => new Date(h.getFullYear(), h.getMonth(), h.getDate(), std, min).toISOString();
      const D = TEST.daten;
      D.jobs.filter(j => j.machine_id === 'm-k1').forEach(j => { if (j.plan_status === 'laeuft') j.plan_status = 'geplant'; });
      const vorlage = D.jobs.find(j => j.machine_id === 'm-k1');
      D.jobs.push({ ...vorlage, id: 'wA', job_number: '10111-0001', plan_status: 'fertig',
        started_at: new Date(Date.now() - 5 * 864e5).toISOString(), ended_at: um(9, 30), target_quantity: 800 });
      D.jobs.push({ ...vorlage, id: 'wB', job_number: '10222-0002', plan_status: 'laeuft',
        started_at: um(9, 30), ended_at: null, target_quantity: 1000, stand: 150 });
      D.production_records = D.production_records.filter(z => z.machine_id !== 'm-k1');
      D.production_records.push(
        { id: 'w1', machine_id: 'm-k1', job_id: 'wA', record_date: gestern, quantity: 500, updated_at: um(-8, 0) },
        { id: 'w2', machine_id: 'm-k1', job_id: 'wA', record_date: heute, quantity: 800, updated_at: um(9, 25) },
        { id: 'w3', machine_id: 'm-k1', job_id: 'wB', record_date: heute, quantity: 150, updated_at: um(11, 5) });
    })()""")
    pg.evaluate("location.hash='#produktion'")
    pg.wait_for_selector(".parkwahl__knopf"); pg.wait_for_timeout(500)
    pg.click(".parkwahl__knopf[data-park='p-kurz']"); pg.wait_for_timeout(600)

    # Tag: Hinweis ausgeschrieben, Leistung beider Aufträge
    pg.click("[data-modus='tag']"); pg.wait_for_selector(".mkarten"); pg.wait_for_timeout(600)
    w = pg.locator(".mk-wechsel[data-wechsel='m-k1']")
    if not w.count(): fehler.append("Tag: kein Hinweis auf den Auftragswechsel")
    else:
        t = w.first.inner_text()
        for teil in ["Auftragswechsel", "09:30", "10111-0001", "10222-0002"]:
            if teil not in t: fehler.append(f"Tag: '{teil}' fehlt im Hinweis: {t}")
    karte = pg.locator(".mkarte--tag").filter(has=pg.locator(".mk-wechsel")).first
    leist = karte.locator(".zelle__leistung").inner_text()
    if "+450" not in leist: fehler.append("Tag: Leistung nicht über beide Aufträge: " + leist)
    andere = pg.locator(".mk-wechsel").count()
    if andere != 1: fehler.append(f"Tag: {andere} Hinweise statt 1")
    pg.screenshot(path="auftragswechsel-tag.png")

    # Woche: kurzer Hinweis mit Uhrzeit in der Spalte von heute
    pg.click("[data-modus='woche']"); pg.wait_for_selector(".raster--woche"); pg.wait_for_timeout(600)
    z = pg.locator("td.heute .zelle__wechsel[data-wechsel='m-k1']")
    if not z.count(): fehler.append("Woche: kein Hinweis am heutigen Tag")
    elif "09:30" not in z.inner_text() or "10222-0002" not in (z.get_attribute("title") or ""):
        fehler.append("Woche: Hinweis unvollständig")
    if pg.locator(".zelle__wechsel").count() != 1: fehler.append("Woche: falsche Anzahl Hinweise")
    pg.screenshot(path="auftragswechsel-woche.png")

    # Pad Mode: Statistik nur des neuen Auftrags (heute 150, nicht 450),
    # gestern leer, weil da der alte Auftrag lief
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_text="10222-0002").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(500)
    neben = pg.inner_text("#pad .pad-stk-neben")
    if "heute 150" not in neben: fehler.append("Pad: heute nicht nur neuer Auftrag: " + neben)
    balken = pg.locator("#pad .pad-tag b").all_inner_texts()
    if balken[-1] != "150" or any(b not in ("–",) for b in balken[:-1]):
        fehler.append("Pad: Tage zeigen alten Auftrag: " + str(balken))
    fuss = pg.inner_text("#pad-stk-fuss")
    if "seit Auftragsbeginn" not in fuss: fehler.append("Pad: Fuss ohne Auftragsbeginn: " + fuss)
    # Uhrzeit unter dem Balken in Ortszeit (11:05), nicht UTC
    unten = pg.locator("#pad .pad-tag small").all_inner_texts()
    if unten[-1] != "11:05": fehler.append("Pad: Uhrzeit nicht Ortszeit: " + unten[-1])
    pg.screenshot(path="auftragswechsel-pad.png")
    br.close()
print("Auftragswechsel | Fehler:", "; ".join(fehler) if fehler else "keine")
