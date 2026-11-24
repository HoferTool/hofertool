# Prüfberichte (seit 1.779.0, Wunsch Patrick 24. November 2026): was nötig ist
# und die Masse stehen in den Stammdaten der HOCO Nr. (pruef_stamm); im Reiter
# Todos Erstteil / AQL / LL, Liste der zuletzt bearbeiteten, „+ Protokoll“ mit
# Wahl der Art, Protokoll als A4-Blatt, drucken, löschen. Nur erfundene Daten.
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

STAMM = {"hoco_nr": "99999-0001", "arten": ["erstteil", "aql", "ll"], "aql": 1.0, "niveau": "II",
         "kopf": {"bezeichnung": "Testwelle", "zeichnung": "Z-123", "index": "B"},
         "zeilen": [{"id": "n1", "nr": "1", "soll": "Ø5.5 ±0.05", "pm": "Grenzlehrdorn Ø5.5", "ll": True},
                    {"id": "n2", "nr": "2", "soll": "12.0 +0.1/-0", "pm": "Messschieber"},
                    {"id": "n3", "nr": "3", "soll": "M6", "pm": "Gewindelehrdorn M6 6H", "ll": True}]}

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Europe/Zurich")
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("""s => { TEST.daten.pruef_stamm = [s]; TEST.daten.pruefbericht_dateien = []; TEST.daten.pruefprotokolle = [];
        const m = (TEST.daten.machines || [])[0];
        TEST.daten.jobs.push({ id: 'jpb1', job_number: '99999-0001', fa_nr: '2026000111', plan_status: 'laeuft', planned_from: '2026-11-20', target_quantity: 800, machine_id: m && m.id },
                             { id: 'jpb2', job_number: '99999-0001', fa_nr: '2025000999', plan_status: 'fertig', planned_from: '2025-05-01', target_quantity: 500 }); }""", STAMM)
    pg.evaluate("location.hash='#/qs'"); pg.wait_for_timeout(800)
    pg.evaluate("() => { const b = [...document.querySelectorAll('[data-qs=pruefberichte], .nav a, .nav button, .reiter button, .reiter a')].find(x => x.offsetParent && /Prüfberichte/.test(x.textContent)); b && b.click(); }")
    pg.wait_for_selector("#pb-todo"); pg.wait_for_timeout(500)
    pruefe(pg.locator("[data-pbtodo=erstteil] [data-pbtodoauftrag=jpb1]").count() == 1, "Erstteil steht an")
    pruefe(pg.locator("[data-pbtodo=aql] [data-pbtodoauftrag=jpb1]").count() == 1, "AQL steht an")
    pruefe(pg.locator("[data-pbtodo=ll] [data-pbtodoauftrag=jpb1]").count() == 1, "LL steht an")
    pruefe(pg.locator("#pb-hochladen").count() == 0, "kein Excel-Hochladen im Reiter")
    # Erstteil aus dem Todo
    pg.click("[data-pbtodo=erstteil] [data-pbtodoauftrag=jpb1]"); pg.wait_for_selector("#pb-blatt"); pg.wait_for_timeout(300)
    bb = pg.evaluate("() => { const r = document.querySelector('#pb-blatt').getBoundingClientRect(); return [r.width, r.height]; }")
    pruefe(780 < bb[0] < 810 and bb[1] > 1000, "A4-Blatt: %s" % bb)
    pg.fill("[data-pbist='n1-0']", "5.52"); pg.fill("[data-pbist='n1-1']", "5.60"); pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    k0 = pg.get_attribute("[data-pbist='n1-0']", "class"); k1 = pg.get_attribute("[data-pbist='n1-1']", "class")
    pruefe("pb-ist--gut" in k0 and "pb-ist--schlecht" in k1, "gut/schlecht")
    pg.wait_for_timeout(1300)
    pp = pg.evaluate("() => TEST.daten.pruefprotokolle")
    pruefe(len(pp) == 1 and pp[0].get("fa_nr") == "2026000111" and pp[0].get("job_id") == "jpb1", "Erstteil mit FA und Auftrag")
    pg.locator("input[name=pb-entscheid]").first.check(); pg.locator("label:has-text('Visum') input").last.fill("TE"); pg.wait_for_timeout(200)
    pg.click("#pb-abschliessen"); pg.wait_for_timeout(600)
    if pg.locator(".dialog-huelle").count():
        pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1000)
    pp = pg.evaluate("() => TEST.daten.pruefprotokolle")
    pruefe(pp and pp[0].get("abgeschlossen_am"), "abgeschlossen")
    pg.locator("button:has-text('← Prüfberichte')").click(); pg.wait_for_selector("#pb-todo"); pg.wait_for_timeout(600)
    pruefe(pg.locator("[data-pbtodo=erstteil] [data-pbtodoauftrag=jpb1]").count() == 0, "Erstteil nicht mehr offen")
    pruefe(pg.locator("#pb-liste [data-pbprotokoll]").count() == 1, "in der Liste zuletzt bearbeitet")
    # + Protokoll: Art wählen, HOCO, FA
    pg.click("#pb-neu"); pg.wait_for_selector(".dialog-huelle [data-w]")
    arten = pg.inner_text(".dialog-huelle")
    pruefe("AQL" in arten and "Endkontrolle" in arten, "Menü mit Arten")
    pg.click(".dialog-huelle [data-w=ll]"); pg.wait_for_selector(".dialog-huelle input")
    pg.fill(".dialog-huelle input", "99999-0001"); pg.keyboard.press("Enter")
    pg.wait_for_selector(".dialog-huelle [data-w=jpb2]"); pg.click(".dialog-huelle [data-w=jpb2]")
    pg.wait_for_selector("#pb-ll-probe"); pg.wait_for_timeout(300)
    pruefe(pg.locator("#pb-tabelle tbody tr").count() == 3, "LL mit den zwei LL-Massen aus den Stammdaten")
    pg.click("#pb-ll-probe"); pg.wait_for_timeout(1300)
    pp = pg.evaluate("() => TEST.daten.pruefprotokolle")
    ll = [x for x in pp if (x.get("kopf") or {}).get("art") == "ll"]
    pruefe(ll and len((ll[0].get("werte") or {}).get("proben") or []) == 1, "LL Stichprobe gespeichert")
    # Drucken öffnet den Betrachter
    pg.click("#pb-drucken"); pg.wait_for_timeout(4000)
    pruefe(pg.locator(".betrachter, .bt, [class*=betrachter]").count() > 0 or pg.locator("canvas").count() > 0, "Drucken zeigt das PDF")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    # Löschen
    pg.click("#pb-loeschen"); pg.wait_for_selector(".dialog-huelle"); pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle .knopf--gefahr, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(800)
    pp = pg.evaluate("() => TEST.daten.pruefprotokolle")
    pruefe(len(pp) == 1, "LL gelöscht: %d" % len(pp))
    pg.wait_for_selector("#pb-todo"); pg.wait_for_timeout(400)
    pg.screenshot(path="/tmp/pb_uebersicht.png")
    # Stammdaten: Karte Prüfung
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
