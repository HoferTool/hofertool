# QS-Massnahmen aus Reklamationen in der Fertigung (seit 1.790.0, Wunsch
# Patrick 24. November 2026): Knopf „QS“ im Auftragsfenster zeigt die
# Massnahmen der HOCO Nr. und die Prüfmittel; Umstellen auf Rüsten oder
# läuft verlangt Quittieren mit Kürzel, Abbrechen lässt den Zustand.
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

def oeffnen(pg, jid):
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)

    jid = pg.evaluate("""() => { const ids = new Set(TEST.daten.planwand.filter(j => !j.ended_at && (j.plan_status || 'geplant') === 'geplant').map(j => j.id));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 40); return b && b.dataset.auftrag; }""")
    pruefe("Geplanter Auftrag gefunden", bool(jid))
    hoco = pg.evaluate("(id) => { const D = TEST.daten; const j = D.planwand.find(x => x.id === id); const k = D.jobs && D.jobs.find(x => x.id === id); if (k) k.abruf_info = k.abruf_info || 'Test'; j.abruf_info = j.abruf_info || 'Test'; return j.job_number; }", jid)
    m = {"X": [{"rk_id": "rk1", "rk_nr": "RK26-001", "text": "Mass 4.2 jede Stunde messen", "punkte": ["Prüfplan ergänzt"], "am": "2026-11-24T08:00:00Z"}]}
    pg.evaluate("(w) => { TEST.daten.app_config.push({ schluessel: 'qs_massnahmen', wert: w }); TEST.daten.qs_quittungen = []; }", json.dumps({hoco: m["X"]}))

    oeffnen(pg, jid)
    pruefe("Auftragsfenster offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("QS-Knopf neben Vorbereiten", pg.evaluate("() => { const v = document.querySelector('#pl-vorbereiten'), q = document.querySelector('#pl-qs'); return !!v && !!q && v.nextElementSibling === q; }"))
    pg.click("#pl-qs"); pg.wait_for_timeout(700)
    pruefe("QS-Fenster offen", pg.locator("#qs-fenster").count() == 1)
    pruefe("Massnahme steht da", "Mass 4.2 jede Stunde messen" in pg.inner_text("#qs-fenster"))
    pruefe("Prüfmittel-Teil da", "Prüfmittel" in pg.inner_text("#qs-fenster"))
    pg.screenshot(path="/tmp/qs_fenster.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Escape schliesst nur QS-Fenster", pg.locator("#qs-fenster").count() == 0 and pg.locator(".dialog--auftrag").count() == 1)

    # Rüsten: Quittieren verlangt, Abbrechen lässt den Zustand
    pg.select_option("#pl-zustand", "ruesten"); pg.click("#pl-ja"); pg.wait_for_timeout(900)
    pruefe("Quittier-Fenster kommt", pg.locator("#qs-quitt").count() == 1)
    pruefe("Quittieren erst gesperrt", pg.is_disabled("#qs-quitt-ok"))
    pg.screenshot(path="/tmp/qs_quitt.png")
    pg.click("#qs-quitt .knopf:has-text('Abbrechen')"); pg.wait_for_timeout(700)
    st = pg.evaluate("(id) => (TEST.daten.jobs || TEST.daten.planwand).find(x => x.id === id).plan_status", jid)
    pruefe("Abbrechen: Zustand bleibt (" + str(st) + ")", st != "ruesten")

    if pg.locator(".dialog--auftrag").count() == 0: oeffnen(pg, jid)
    pg.select_option("#pl-zustand", "ruesten"); pg.click("#pl-ja"); pg.wait_for_timeout(900)
    pg.click("[data-qs-quitt='RK26-001']"); pg.fill("#qs-quitt-kuerzel", "jpf"); pg.wait_for_timeout(200)
    pruefe("Mit Haken und Kürzel frei", not pg.is_disabled("#qs-quitt-ok"))
    pg.click("#qs-quitt-ok"); pg.wait_for_timeout(1000)
    q = pg.evaluate("() => TEST.daten.qs_quittungen")
    pruefe("Quittung gespeichert " + str(q and q[0].get("kuerzel")), len(q) == 1 and q[0]["kuerzel"] == "JPF" and q[0]["anlass"] == "ruesten" and q[0]["rk_id"] == "rk1")
    st = pg.evaluate("(id) => (TEST.daten.jobs || TEST.daten.planwand).find(x => x.id === id).plan_status", jid)
    pruefe("Zustand jetzt Rüsten", st == "ruesten")
    br.close()
print("Fehler: " + ("keine" if not fehler else "; ".join(fehler)))
