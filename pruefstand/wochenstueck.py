# Wochenstück je Auftrag (1.127.0, Wunsch Patrick 21. Oktober 2026):
# Die Woche in Erfassen zählt nur den Auftrag, der jetzt an der Maschine
# ist. Am Wechseltag stehen zwei Felder, oben der alte, unten der neue;
# fehlt beim alten die Zahl, lässt sie sich dort nachtragen.
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

    # Woche: nur B zählt (150), nicht A (500 gestern, 300 heute)
    pg.click("[data-modus='woche']"); pg.wait_for_selector(".raster--woche"); pg.wait_for_timeout(700)
    zeile = pg.locator(".raster--woche tbody tr").filter(has=pg.locator("[data-doppel='m-k1']")).first
    if not zeile.count(): fehler.append("Woche: keine zwei Felder am Wechseltag")
    else:
        summe = zeile.locator("td.aw-summe").inner_text().strip()
        if summe != "+150": fehler.append("Woche: Summe nicht nur neuer Auftrag: " + summe)
        nr = zeile.locator("td.heute .stand-doppel__nr").all_inner_texts()
        if nr != ["alt 10111-0001", "neu 10222-0002"]: fehler.append("Woche: Reihenfolge/Anschrift: " + str(nr))
        werte = zeile.locator("td.heute input.menge").evaluate_all("l => l.map(e => e.value)")
        if werte != ["800", "150"]: fehler.append("Woche: Werte der Felder: " + str(werte))
        fremd = zeile.locator("td.zelle--fremd").count()
        gestern_in_woche = pg.evaluate("new Date().getDay() >= 2 && new Date().getDay() <= 5")
        if gestern_in_woche and fremd != 1: fehler.append(f"Woche: {fremd} blasse Tage statt 1")
    pg.screenshot(path="wochenstueck-woche.png")

    # Tag: zwei Felder mit eigener Leistung
    pg.click("[data-modus='tag']"); pg.wait_for_selector(".mkarten"); pg.wait_for_timeout(600)
    d = pg.locator(".mkarte--tag [data-doppel='m-k1']")
    if not d.count(): fehler.append("Tag: keine zwei Felder")
    else:
        l = d.locator(".zelle__leistung").all_inner_texts()
        if len(l) != 2 or "+300" not in l[0] or "+150" not in l[1]: fehler.append("Tag: Leistungen: " + str(l))
    pg.screenshot(path="wochenstueck-tag.png")

    # Ohne Zahl des alten Auftrags heute: leeres Feld mit „bisher 500“,
    # nachtragen speichert für A, ohne Frage
    pg.evaluate("TEST.daten.production_records = TEST.daten.production_records.filter(z => z.id !== 'w2')")
    pg.click("[data-modus='woche']"); pg.wait_for_timeout(300)
    pg.click("[data-modus='tag']"); pg.wait_for_timeout(800)
    feld = pg.locator(".mkarte--tag [data-doppel='m-k1'] input.menge--alt")
    if not feld.count(): fehler.append("Nachtragen: kein Feld für den alten Auftrag")
    else:
        if feld.get_attribute("placeholder") != "bisher 500": fehler.append("Nachtragen: Hinweis " + str(feld.get_attribute("placeholder")))
        feld.fill("820"); feld.press("Enter"); pg.wait_for_timeout(800)
        if pg.locator(".dialog-huelle").count(): fehler.append("Nachtragen: unerwartete Frage")
        neu = pg.evaluate("""(() => { const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
          const z = TEST.daten.production_records.find(z => z.job_id === 'wA' && z.record_date === iso(new Date()));
          return z ? z.quantity : null; })()""")
        if neu != 820: fehler.append("Nachtragen: nicht für alten Auftrag gespeichert: " + str(neu))
    br.close()
print("Wochenstück je Auftrag | Fehler:", "; ".join(fehler) if fehler else "keine")
