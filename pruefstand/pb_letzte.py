# Letzte Produktion (seit 1.795.0): Excel aus dem Ordner bis zum ersten Protokoll.
# Grundlage wie pruefberichte.py (seit 1.779.0, Wunsch Patrick 24. November 2026): was nötig ist
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

STAMM = {"hoco_nr": "99999-0001", "arten": ["erstteil", "endkontrolle", "aql", "ll"], "aql": 1.0, "niveau": "II",
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
    pg.evaluate("""s => { TEST.daten.pruef_stamm = [s]; TEST.daten.pruefbericht_dateien = [{id:'d1',hoco_nr:'88888-0001',name:'88888-0001 Pruefbericht.xlsx',url:'http://127.0.0.1/x.xlsx',quelle:'ordner',geaendert:'2026-10-01T08:00:00Z'},{id:'d2',hoco_nr:'99999-0001',name:'99999-0001 alt.xlsx',url:'http://127.0.0.1/y.xlsx',quelle:'ordner',geaendert:'2026-10-02T08:00:00Z'}]; TEST.daten.pruefprotokolle = [{id:'pp1',hoco_nr:'99999-0001',fa_nr:'2026000111',kopf:{art:'erstteil'},werte:{},erstellt_am:'2026-11-24T08:00:00Z',geaendert_am:'2026-11-24T08:00:00Z'}];
        const m = (TEST.daten.machines || [])[0];
        TEST.daten.jobs.push({ id: 'jpb1', job_number: '99999-0001', fa_nr: '2026000111', plan_status: 'laeuft', planned_from: '2026-11-20', target_quantity: 800, machine_id: m && m.id, material_bez: 'X10CrNiS18-9 rd 011 mm h8', material_dm: 11 },
                             { id: 'jpb2', job_number: '99999-0001', fa_nr: '2025000999', plan_status: 'fertig', planned_from: '2025-05-01', target_quantity: 500 }); }""", STAMM)
    pg.evaluate("location.hash='#/qs'"); pg.wait_for_timeout(800)
    pg.evaluate("() => { const b = [...document.querySelectorAll('[data-qs=pruefberichte], .nav a, .nav button, .reiter button, .reiter a')].find(x => x.offsetParent && /Prüfberichte/.test(x.textContent)); b && b.click(); }")
    pg.wait_for_selector("#pb-todo"); pg.wait_for_timeout(800)
    pruefe(pg.locator("#pb-letzte").count() == 1, "Abschnitt Letzte Produktion da")
    t = pg.inner_text("#pb-letzte") if pg.locator("#pb-letzte").count() else ""
    pruefe("88888-0001" in t, "Excel ohne Protokoll steht da")
    pruefe("99999-0001" not in t, "Excel mit Protokoll ist weg")
    pruefe(pg.locator("[data-pbletzteansehen]").count() == 1, "ein Knopf Ansehen")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
