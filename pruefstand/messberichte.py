# Keyence Berichte (1.443.0, Wunsch Patrick 6. November 2026): Reiter
# „Keyence Berichte“ der Produktion nach HOCO Nr. und Knopf im QS Check
# des Pads. Kein Knopf Spezialwerkzeuge/Messberichte im Auftragsfenster.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("SW_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1000)
    hoco = pg.evaluate("TEST.daten.jobs.find(j => j.job_number && !j.ended_at).job_number")
    pg.evaluate("""h => { TEST.daten.messberichte = [
      { id: 'm1', datei: 'W:/a.csv', hoco_nr: h, einstellung: h + ' 1. Seite M2 SMO', gemessen_am: '2026-11-06T13:09:25Z',
        ergebnis: 'Fehler', kopf: { 'Losnummer': '', 'Messgerät': 'KEYENCE IM Series(Hofer)' },
        spalten: ['Nr.','Messelemente','Messwert','Einheit','Sollwert','Obergr.','Untergrz.','Auflsg.'],
        zeilen: [['3','KONZENTR Ø8','','','0,000','0,020','0,000','Fehler'], ['5','LK Ø11.7','11,702','mm','11,700','0,050','-0,050','0,001','OK']] },
      { id: 'm2', datei: 'W:/b.csv', hoco_nr: h, einstellung: h + ' 2. Seite', gemessen_am: '2026-11-05T10:00:00Z',
        ergebnis: 'OK', kopf: {}, spalten: [], zeilen: [] },
      { id: 'm3', datei: 'W:/c.csv', hoco_nr: '10841-0009', einstellung: '10841-0009 Front', gemessen_am: '2026-11-04T08:00:00Z',
        ergebnis: 'OK', kopf: {}, spalten: [], zeilen: [] } ] }""", hoco)

    # Auftragsfenster ohne Knöpfe Spezialwerkzeuge und Messberichte
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate(f"TEST.daten.jobs.find(j => j.job_number === '{hoco}' && !j.ended_at).id")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.wait_for_timeout(500)
    pruefe(pg.locator("#pl-spezial, #pl-mess").count() == 0, "Kein Knopf Spezialwerkzeuge/Messberichte im Auftragsfenster")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Reiter in der Produktion
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_selector("[data-unter='produktion/keyence']")
    pg.click("[data-unter='produktion/keyence']"); pg.wait_for_selector("#keyence-berichte .mess__kopf")
    t = pg.inner_text("#keyence-berichte")
    pruefe(hoco in t and "10841-0009" in t and "2 Berichte" in t, "Je HOCO Nr. eine Zeile mit Anzahl")
    pg.click(f"[data-keyence-hoco='{hoco}']"); pg.wait_for_selector("[data-messbericht='m1']")
    pg.click("[data-messbericht='m1']"); pg.wait_for_selector("#keyence-berichte .mess__tabelle"); pg.wait_for_timeout(400)
    t = pg.inner_text("#keyence-berichte")
    pruefe("KONZENTR" in t and "11,702" in t, "Bericht zeigt Messwerte")
    pg.screenshot(path=os.path.join(BILD, "keyence-prod.png"))
    pg.fill("#keyence-suche", "10841"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-keyence-hoco]").count() == 1, "Suche nach HOCO Nr.")
    pg.fill("#keyence-suche", "")

    # Knopf im QS Check des Pads
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_timeout(500)
    pg.click("#kopf-pad, [data-pad-oeffnen], button:has-text('Pad Mode')"); pg.wait_for_selector("#pad")
    pg.wait_for_timeout(500)
    pg.locator("#pad button:has-text('QS Check')").first.click(); pg.wait_for_selector("[data-padkeyence]")
    pg.click("[data-padkeyence]"); pg.wait_for_selector("#keyence-fenster [data-keyence-hoco]"); pg.wait_for_timeout(500)
    pruefe(pg.locator("#keyence-fenster [data-keyence-hoco]").count() == 2, "Fenster aus dem QS Check")
    pg.screenshot(path=os.path.join(BILD, "keyence-pad.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe(pg.locator("#keyence-fenster").count() == 0 and pg.locator("#pad").count() == 1, "Escape schliesst nur das Fenster")

    # Kachel an der Maschine (1.444.0): teilt sich den Platz mit den Notizbüchern
    pg.evaluate("""() => { for (const j of TEST.daten.jobs) if (j.job_number && !j.ended_at
      && !TEST.daten.messberichte.some(m => m.hoco_nr === j.job_number))
      TEST.daten.messberichte.push({ id: 'x' + j.id, datei: 'W:/' + j.id + '.csv', hoco_nr: j.job_number,
        einstellung: j.job_number + ' Probe', gemessen_am: '2026-11-03T08:00:00Z', ergebnis: 'OK',
        kopf: {}, spalten: ['Nr.', 'Messwert', ''], zeilen: [['1', '5,000', 'OK'], ['2', '', 'Fehler']] }); }""")
    pg.locator("#pad [data-padzurueck], #pad button:has-text('Zurück')").first.click(); pg.wait_for_timeout(600)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    i = pg.evaluate("""() => [...document.querySelectorAll('#pad .pad-kachel--maschine')]
      .findIndex(k => !k.innerText.includes('kein Auftrag'))""")
    pg.locator("#pad .pad-kachel--maschine").nth(max(0, i)).click(); pg.wait_for_timeout(2500)
    pruefe(pg.locator(".pad-geteilt [data-padfeld='notizen']").count() == 1
      and pg.locator(".pad-geteilt [data-padfeld='keyence']").count() == 1, "Notizbücher und Keyence teilen sich die Kachel")
    pg.screenshot(path=os.path.join(BILD, "keyence-maschine.png"))
    pg.click("[data-padfeld='keyence']"); pg.wait_for_selector("#keyence-fenster [data-keyence-hoco]"); pg.wait_for_timeout(500)
    pruefe(pg.locator("#keyence-fenster [data-keyence-hoco]").count() == 1 and pg.locator("[data-keyence-alle]").count() == 1,
      "Nur die HOCO Nr. des Auftrags")
    b = pg.evaluate("document.querySelector('.dialog.messberichte').getBoundingClientRect().width")
    pruefe(b > 1200, "Fenster breit (%d)" % b)
    pg.locator("#keyence-fenster [data-messbericht]").first.click(); pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(BILD, "keyence-maschine-fenster.png"))
    pg.click("[data-keyence-alle]"); pg.wait_for_timeout(400)
    pruefe(pg.locator("#keyence-fenster [data-keyence-hoco]").count() > 1, "Alle Berichte zur Wahl")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe(not pf, "Keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
