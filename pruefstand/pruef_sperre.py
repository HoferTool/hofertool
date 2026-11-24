# Sperre vor „läuft“ (seit 1.783.0, Wunsch Patrick 24. November 2026): verlangt
# der Stamm der HOCO Nr. eine Erstteilprüfung, geht ein Auftrag erst auf „läuft“,
# wenn für genau diesen Auftrag eine Erstteilprüfung abgeschlossen ist. Nur erfundene Daten.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Europe/Zurich").new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1000)
    pg.evaluate("""() => { const D = TEST.daten;
        D.pruef_stamm = [{ hoco_nr: '99999-0002', arten: ['erstteil'], zeilen: [] }];
        D.pruefprotokolle = [{ id: 'pfremd', hoco_nr: '99999-0002', fa_nr: '2026000222', job_id: 'anderer', kopf: { art: 'erstteil' }, abgeschlossen_am: '2026-11-20T08:00:00Z' }];
        D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
        D.jobs.push({ id: 'jsp', machine_id: 'm-k1', job_number: '99999-0002', fa_nr: '2026000222', plan_status: 'ruesten',
          planned_from: '2026-11-20', planned_days: 3, target_quantity: 500, ended_at: null }); }""")
    pg.wait_for_timeout(31000)
    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(600)
    pg.locator("button:has-text('Pad Mode'):visible").first.click(); pg.wait_for_selector("#pad [data-padwo='qs']")
    pg.click("#pad [data-padwo='qs']"); pg.wait_for_selector("#pad [data-qsmaschine='m-k1']")
    z = pg.locator("#pad [data-qsmaschine='m-k1']")
    z.locator("[data-qszustand='laeuft']").click(); pg.wait_for_timeout(1500)
    st = pg.evaluate("() => TEST.daten.jobs.find(j => j.id === 'jsp').plan_status")
    pruefe(st == "ruesten", "gesperrt ohne eigene Erstteilprüfung (gleiche FA zählt nicht): %s" % st)
    pruefe("Erstteilprüfung" in pg.inner_text("body"), "Meldung nennt die Erstteilprüfung")
    pg.evaluate("""() => TEST.daten.pruefprotokolle.push({ id: 'peigen', hoco_nr: '99999-0002', job_id: 'jsp', kopf: { art: 'erstteil' }, abgeschlossen_am: '2026-11-24T08:00:00Z' })""")
    z.locator("[data-qszustand='laeuft']").click(); pg.wait_for_timeout(1500)
    st = pg.evaluate("() => TEST.daten.jobs.find(j => j.id === 'jsp').plan_status")
    pruefe(st == "laeuft", "nach abgeschlossener Erstteilprüfung läuft: %s" % st)
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
