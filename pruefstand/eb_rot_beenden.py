# Rote Werkzeuge im Einrichtblatt der App sperren das Beenden, nicht mehr
# „EB OK“ (1.400.0, Wunsch Patrick 5. November 2026).
import time
from pruefstand import art_info, kein_rest, server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1500,"height":950}, timezone_id="Europe/Zurich").new_page()
    pg.clock.set_fixed_time("2026-10-13T14:00:00+02:00")
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""() => {
      const D = TEST.daten;
      const m = D.machines.find(x => x.id === 'm-k1');
      if (!m.type_id) m.type_id = 't1';
      D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
      D.jobs.push({ id: 'tA', job_number: '10333-0001', plan_status: 'laeuft', machine_id: 'm-k1', ended_at: null,
        planned_days: 3, target_quantity: 1000, started_at: '2026-10-01T04:00:00Z', planned_from: '2026-10-01' });
      D.hoco_type_data = D.hoco_type_data.filter(x => x.hoco_nr !== '10333-0001');
      D.hoco_type_data.push({ hoco_nr: '10333-0001', type_id: m.type_id, stueckzeit_s: 30 });
      D.einrichtblatt_app = D.einrichtblatt_app || [];
      D.einrichtblatt_app.push({ id: 'eb-rot', hoco_nr: '10333-0001', type_id: m.type_id, kopf: {}, programme: {},
        plaetze: { T100: { werkzeug: 'XYZ-1' }, T200: { werkzeug: 'ABC', article_id: 'a1' } } });
    }""")
    def beenden():
        pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
        pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
        pg.click("#pad [data-park='p-kurz']"); pg.wait_for_timeout(800)
        if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
        pg.locator("#pad .pad-kachel--maschine").filter(has_text="10333-0001").first.click()
        pg.wait_for_selector("#pad [data-padstatus]"); pg.wait_for_timeout(500)
        pg.click("#pad [data-padstatus]"); pg.wait_for_selector(".dialog-huelle [data-w='fertig']")
        pg.click(".dialog-huelle [data-w='fertig']"); pg.wait_for_selector(".dialog-huelle [data-ja]")
        pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(900)
    zustand = lambda: pg.evaluate("TEST.daten.jobs.find(j => j.id === 'tA').plan_status")
    beenden()
    body = pg.inner_text("body")
    pruefe("Mit rotem T100 nicht beendet", zustand() == "laeuft")
    pruefe("Meldung nennt T100", "T100 noch rot" in body)
    pruefe("Keine Stückzahl-Frage vorher", pg.locator(".zifferblock").count() == 0)
    pg.screenshot(path="eb_rot_beenden.png")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(600)
    # Werkzeug ausgewählt: Beenden geht
    pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.id === 'eb-rot').plaetze.T100.article_id = 'a1'")
    beenden()
    if pg.locator(".zifferblock h2:has-text('Letzte Stückzahl')").count(): pg.click(".zifferblock [data-zbnein]")
    art_info(pg, laenge=7); kein_rest(pg); pg.wait_for_timeout(1500)
    pruefe("Ohne Rot beendet", zustand() == "fertig")
    br.close()
print("Fehler:", fehler or "keine")
