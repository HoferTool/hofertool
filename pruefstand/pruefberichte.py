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
    pg.evaluate("""s => { TEST.daten.pruef_stamm = [s]; TEST.daten.pruefbericht_dateien = []; TEST.daten.pruefprotokolle = [];
        TEST.daten.pruefmittel = [{ id: 'pmx', nr: 'PM-9', bezeichnung: 'Grenzlehrdorn', mass: '5.45 / 5.55', ort_art: 'schrank', status: 'aktiv' }];
        const m = (TEST.daten.machines || [])[0];
        // Nachbau der Funktionen aus sql/pruefmittel-ausbuchen-alle.sql
        TEST.rpc.pruefmittel_schrank_lesen = () => TEST.daten.pruefmittel.filter(p => p.ort_art === 'schrank');
        TEST.rpc.pruefmittel_ausbuchen = (a) => { const j = TEST.daten.jobs.find(x => x.id === a.p_job); let n = 0;
          TEST.daten.pruefmittel.forEach(p => { if (a.p_ids.includes(p.id) && p.ort_art === 'schrank') { p.ort_art = 'maschine'; p.machine_id = j.machine_id; p.job_id = j.id; n++; } }); return n; };
        TEST.daten.jobs.push({ id: 'jpb1', job_number: '99999-0001', fa_nr: '2026000111', plan_status: 'ruesten', planned_from: '2026-11-20', target_quantity: 800, machine_id: m && m.id, material_bez: 'X10CrNiS18-9 rd 011 mm h8', material_dm: 11 },
                             { id: 'jpb2', job_number: '99999-0001', fa_nr: '2025000999', plan_status: 'fertig', planned_from: '2026-11-01', ended_at: new Date(Date.now() - 3*86400000).toISOString(), target_quantity: 500 }); }""", STAMM)
    pg.evaluate("location.hash='#/qs'"); pg.wait_for_timeout(800)
    pg.evaluate("() => { const b = [...document.querySelectorAll('[data-qs=pruefberichte], .nav a, .nav button, .reiter button, .reiter a')].find(x => x.offsetParent && /Prüfberichte/.test(x.textContent)); b && b.click(); }")
    pg.wait_for_selector("#pb-todo"); pg.wait_for_timeout(500)
    pruefe(pg.locator("[data-pbtodo=erstteil] [data-pbtodoauftrag=jpb1]").count() == 1, "Erstteil steht an")
    pruefe(pg.locator("[data-pbtodo=aql] [data-pbtodoauftrag=jpb1]").count() == 0, "AQL erst bei läuft")
    pruefe(pg.locator("[data-pbtodo=endkontrolle] [data-pbtodoauftrag=jpb1]").count() == 0, "Endkontrolle nicht beim Rüsten")
    pruefe(pg.locator("[data-pbtodo=endkontrolle] [data-pbtodoauftrag=jpb2]").count() == 1, "fertiger Auftrag bei Endkontrolle")
    pruefe(pg.locator("#pb-hochladen").count() == 0, "kein Excel-Hochladen im Reiter")
    pruefe(pg.locator("#pb-neu").count() == 0, "kein Knopf + Protokoll")
    # Erstteil aus dem Todo
    pg.click("[data-pbtodo=erstteil] [data-pbtodoauftrag=jpb1]"); pg.wait_for_selector("[data-pbcheckliste]"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-pbcheck]").count() >= 5, "Checkliste mit Zeichnung, Lehren, Messmittel: %d" % pg.locator("[data-pbcheck]").count())
    pruefe(pg.locator("#pb-check-quittieren").is_disabled(), "Quittieren erst wenn alles abgehakt")
    for c in pg.locator("[data-pbcheck]").all(): c.check()
    pg.click("#pb-check-quittieren"); pg.wait_for_selector("#pb-blatt"); pg.wait_for_timeout(300)
    pmo = pg.evaluate("() => TEST.daten.pruefmittel.find(p => p.id === 'pmx').ort_art")
    pruefe(pmo == "schrank", "Checkliste quittieren bucht noch nicht aus: %s" % pmo)
    bb = pg.evaluate("() => { const r = document.querySelector('#pb-blatt').getBoundingClientRect(); return [r.width, r.height]; }")
    pruefe(780 < bb[0] < 810 and bb[1] > 1000, "A4-Blatt: %s" % bb)
    pg.fill("[data-pbist='n1-0']", "5.52"); pg.fill("[data-pbist='n1-1']", "5.60"); pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    k0 = pg.get_attribute("[data-pbist='n1-0']", "class"); k1 = pg.get_attribute("[data-pbist='n1-1']", "class")
    pruefe("pb-ist--gut" in k0 and "pb-ist--schlecht" in k1, "gut/schlecht")
    pruefe("rd 011" in pg.inner_text("#pb-blatt"), "Material mit Durchmesser im Kopf")
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
    st1 = pg.evaluate("() => TEST.daten.jobs.find(j => j.id === 'jpb1').plan_status")
    pruefe(st1 == "laeuft", "Freigabe stellt jpb1 auf läuft: %s" % st1)
    pmx = pg.evaluate("() => TEST.daten.pruefmittel.find(p => p.id === 'pmx')")
    pruefe(pmx.get("ort_art") == "maschine" and pmx.get("job_id") == "jpb1", "nach Freigabe ausgebucht: %s %s" % (pmx.get("ort_art"), pmx.get("job_id")))
    pruefe(pg.locator("[data-pbtodo=aql] [data-pbtodoauftrag=jpb1]").count() == 1, "AQL steht an bei läuft")
    # Endkontrolle als Zwischenkontrolle: nichts muss ausgefüllt sein, Auftrag bleibt bei Endkontrolle
    pg.click("[data-pbtodo=endkontrolle] [data-pbtodoauftrag=jpb2]"); pg.wait_for_selector("#pb-kontrolle")
    pg.click("[data-pbkontrolle=zwischen]"); pg.wait_for_timeout(300)
    pruefe("Zwischenkontrolle" in pg.inner_text("#pb-blatt"), "Titel Zwischenkontrolle")
    pg.locator("input[name=pb-entscheid]").first.check(); pg.locator("label:has-text('Visum') input").last.fill("TE"); pg.wait_for_timeout(200)
    pg.click("#pb-abschliessen"); pg.wait_for_timeout(1000)
    leerfrage = pg.locator(".dialog-huelle:has-text('leer')").count()
    pruefe(leerfrage == 0, "keine Frage nach leeren Feldern")
    if pg.locator(".dialog-huelle").count():
        pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(800)
    zw = [x for x in pg.evaluate("() => TEST.daten.pruefprotokolle") if (x.get("kopf") or {}).get("kontrolle") == "zwischen"]
    pruefe(zw and zw[0].get("abgeschlossen_am"), "Zwischenkontrolle abgeschlossen")
    pg.locator("button:has-text('← Prüfberichte')").click(); pg.wait_for_selector("#pb-todo"); pg.wait_for_timeout(600)
    pruefe(pg.locator("[data-pbtodo=endkontrolle] [data-pbtodoauftrag=jpb2]").count() == 1, "nach Zwischenkontrolle weiter bei Endkontrolle")
    # LL aus dem Todo
    pg.click("[data-pbtodo=ll] [data-pbtodoauftrag=jpb1]")
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
    pruefe(len(pp) == 2, "LL gelöscht: %d" % len(pp))
    pg.wait_for_selector("#pb-todo"); pg.wait_for_timeout(400)
    # Auftrag im Rüsten: Erstteil mit Freigabe stellt ihn auf läuft
    pg.evaluate("() => TEST.daten.jobs.push({ id: 'jpb3', job_number: '99999-0001', fa_nr: '2026000333', plan_status: 'ruesten', planned_from: '2026-11-24', target_quantity: 300 })")
    pg.locator("button:has-text('← Prüfberichte'), [data-qs=pruefberichte]").count()
    pg.evaluate("location.hash='#/start'"); pg.wait_for_timeout(500); pg.evaluate("location.hash='#/qs'"); pg.wait_for_timeout(800)
    pg.evaluate("() => { const b = [...document.querySelectorAll('[data-qs=pruefberichte], .nav a, .nav button, .reiter button, .reiter a')].find(x => x.offsetParent && /Prüfberichte/.test(x.textContent)); b && b.click(); }")
    pg.wait_for_selector("[data-pbtodo=erstteil] [data-pbtodoauftrag=jpb3]")
    pg.click("[data-pbtodo=erstteil] [data-pbtodoauftrag=jpb3]"); pg.wait_for_selector("[data-pbcheckliste]")
    pg.click("button:has-text('Alle abhaken')"); pg.click("#pb-check-quittieren"); pg.wait_for_selector("#pb-blatt")
    pg.locator("input[name=pb-entscheid]").first.check(); pg.locator("label:has-text('Visum') input").last.fill("TE"); pg.wait_for_timeout(200)
    pg.click("#pb-abschliessen"); pg.wait_for_timeout(600)
    if pg.locator(".dialog-huelle").count():
        pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1500)
    pg.wait_for_timeout(1000)
    st = pg.evaluate("() => TEST.daten.jobs.find(j => j.id === 'jpb3').plan_status")
    pruefe(st == "laeuft", "nach Freigabe läuft der Auftrag: %s" % st)
    pg.locator("button:has-text('← Prüfberichte')").click(); pg.wait_for_selector("#pb-todo"); pg.wait_for_timeout(600)
    pruefe(pg.locator("[data-pbtodo=erstteil] [data-pbtodoauftrag=jpb3]").count() == 0, "Erstteil jpb3 nicht mehr in der Liste")
    pg.screenshot(path="/tmp/pb_uebersicht.png")
    # Stammdaten: Karte Prüfung mit Masse-Blatt
    pg.locator("#pb-liste [data-pbprotokoll]").first.click()
    pg.wait_for_selector("#pb-blatt"); pg.wait_for_timeout(300)
    pg.locator("button:has-text('Prüfmasse 99999-0001')").click()
    pg.wait_for_selector("#pst-blatt-auf", timeout=8000); pg.click("#pst-blatt-auf")
    pg.wait_for_selector("[data-pstblatt] [data-pstseite]")
    pruefe(pg.locator("[data-pstseite]").count() == 1 and pg.locator("[data-pstblatt] tbody tr").count() == 3, "Masse-Blatt mit 3 Massen")
    for i in range(20):
        pg.click("#pst-mass-neu")
    pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-pstseite]").count() == 2, "zweite Seite bei 23 Massen: %d" % pg.locator("[data-pstseite]").count())
    pg.click("#pst-abschnitt-neu"); pg.wait_for_timeout(200)
    pruefe(pg.locator(".pst-abschnitt").count() >= 1, "Abschnitt angelegt")
    pg.locator("[data-pstabschnittdavor]").first.click(); pg.wait_for_timeout(200)
    pruefe(pg.locator(".pst-abschnitt").count() >= 2, "Abschnitt davor eingefügt")
    # Zeilen markieren wie Excel: Kopf antippen, Shift bis zur vierten, leeren, dann löschen
    k = pg.locator("[data-pstkopf]")
    k.nth(1).click(); k.nth(3).click(modifiers=["Shift"]); pg.wait_for_timeout(150)
    pruefe(pg.locator("tr.pst-markiert").count() == 3, "3 Zeilen markiert: %d" % pg.locator("tr.pst-markiert").count())
    pg.click("#pst-mark-leeren"); pg.wait_for_timeout(150)
    leer = pg.evaluate("() => [...document.querySelectorAll('tr.pst-markiert input:not([type=checkbox])')].every(i => !i.value)")
    pruefe(leer, "markierte Zeilen geleert")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    pruefe(pg.locator("tr.pst-markiert").count() == 0 and pg.locator("[data-pstblatt]").count() == 1, "Escape hebt Markierung auf, Blatt bleibt")
    k.nth(1).click(); k.nth(2).click(modifiers=["Shift"]); pg.click("#pst-mark-weg"); pg.wait_for_timeout(200)
    pg.locator(".dialog-huelle button:has-text('Löschen')").click(); pg.wait_for_timeout(200)
    pruefe(pg.locator("[data-pstblatt] tbody tr").count() == 23, "2 Zeilen gelöscht: %d" % pg.locator("[data-pstblatt] tbody tr").count())
    pg.screenshot(path="/tmp/pst_blatt.png")
    pg.click("#pst-blatt-speichern"); pg.wait_for_timeout(1000)
    st = pg.evaluate("() => TEST.daten.pruef_stamm[0]")
    pruefe(len(st.get("zeilen") or []) == 23, "gespeichert: %d Zeilen" % len(st.get("zeilen") or []))
    pg.click("#pst-blatt-zu"); pg.wait_for_timeout(400)
    pruefe(pg.locator("[data-pstblatt]").count() == 0, "Blatt zu")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
