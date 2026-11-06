# Messberichte vom Keyence IM (1.443.0, Wunsch Patrick 6. November 2026):
# Auftragsfenster und HOCO Nr. zeigen die Teilberichte der HOCO Nr.
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
    pg = br.new_context(viewport={"width": 1280, "height": 900}).new_page()
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
        ergebnis: 'OK', kopf: {}, spalten: [], zeilen: [] } ] }""", hoco)

    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate(f"TEST.daten.jobs.find(j => j.job_number === '{hoco}' && !j.ended_at).id")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.wait_for_timeout(600)
    pruefe("(2)" in pg.inner_text("#pl-mess"), "Knopf zeigt Anzahl: " + pg.inner_text("#pl-mess"))
    pg.click("#pl-mess"); pg.wait_for_selector("#messberichte .mess__tabelle"); pg.wait_for_timeout(600)
    t = pg.inner_text("#messberichte")
    pruefe("KONZENTR" in t and "11,702" in t and "Fehler" in t, "Neuester Bericht offen mit Messwerten")
    pruefe(pg.locator("#messberichte .mess-schild--schlecht").count() >= 1 and pg.locator("#messberichte .mess-schild--gut").count() >= 1, "Schilder gut/schlecht")
    pg.screenshot(path=os.path.join(BILD, "messberichte.png"))
    pg.click("[data-messbericht='m2']"); pg.wait_for_timeout(200)
    pruefe("Keine Messwerte" in pg.inner_text("#messberichte"), "Zweiter Bericht klappt auf")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pruefe(pg.locator("#messberichte").count() == 0 and pg.locator(".dialog--auftrag").count() == 1, "Escape schliesst nur das Fenster")
    pruefe(not pf, "Keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
