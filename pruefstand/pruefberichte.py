# Prüfberichte (1.771.0, Wunsch Patrick 24. November 2026): Reiter in der
# Qualitätssicherung, Excel-Bericht lesen, Lehren aus der letzten Spalte,
# Protokolle Erstteil (5 Teile), AQL und LL anlegen und ausfüllen.
# Nur erfundene Daten: das Excel baut der Test selbst.
import time, os, io, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
from openpyxl import Workbook
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def excel():
    wb = Workbook(); ws = wb.active
    ws["A1"] = "Teileprüfbericht"; ws["H1"] = "Seite 1 / 1"
    ws["A2"] = "FA-Nummer"; ws["C2"] = "FA-TEST-1"; ws["I2"] = "Index"; ws["I3"] = "B"
    ws["A3"] = "Artikel-Bez."; ws["C3"] = "Testwelle"
    ws["A4"] = "Ho+Co Nr."; ws["C4"] = "99999-0001"
    ws["A5"] = "Zeichnung"; ws["C5"] = "Z-123"
    r = 8
    for i, t in enumerate(["Nr.", "Soll", "Ist 1", "Ist 2", "Ist 3", "Ist 4", "Ist 5", "Bemerkungen / spez. Prüfmittel"]):
        ws.cell(row=r, column=i + 1, value=t)
    zeilen = [("1", "Ø5.5 ±0.05", "Grenzlehrdorn Ø5.5"), ("2", "12.0 +0.1/-0", "Messschieber"), ("3", "M6", "Gewindelehrdorn M6 6H")]
    for j, (a, b, c) in enumerate(zeilen):
        ws.cell(row=r + 1 + j, column=1, value=a); ws.cell(row=r + 1 + j, column=2, value=b); ws.cell(row=r + 1 + j, column=8, value=c)
    ws.cell(row=r + 5, column=1, value="Prüf-Entscheid")
    b = io.BytesIO(); wb.save(b); return b.getvalue()
XLSX = excel()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Europe/Zurich")
    pg = ctx.new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    pg.route("**/testdatei/bericht.xlsx", lambda r: r.fulfill(status=200, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body=XLSX))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    url = f"http://127.0.0.1:{PORT}/testdatei/bericht.xlsx"
    pg.evaluate("""u => { TEST.daten.pruefbericht_dateien = [{ id: 'd1', hoco_nr: '99999-0001', name: 'Bericht 99999-0001.xlsx', url: u, ablage: 'x', seite: 1, quelle: 'ordner' }];
                          TEST.daten.pruefprotokolle = TEST.daten.pruefprotokolle || []; }""", url)
    pg.evaluate("location.hash='#/qs'"); pg.wait_for_timeout(800)
    pruefe("Prüfberichte" in pg.inner_text(".reiter"), "Reiter Prüfberichte da")
    pg.evaluate("() => { const b = [...document.querySelectorAll('[data-qs=pruefberichte], .nav a, .nav button')].find(x => x.offsetParent && /Prüfberichte/.test(x.textContent)) || document.querySelector('[data-qs=pruefberichte]'); b.click(); }"); pg.wait_for_selector("#pb-liste"); pg.wait_for_timeout(500)
    pruefe(pg.locator("[data-pbhoco='99999-0001']").count() == 1, "HOCO Nr. in der Liste")
    pg.click("[data-pbhoco='99999-0001']"); pg.wait_for_selector("#pb-lehren", timeout=10000); pg.wait_for_timeout(500)
    leh = pg.inner_text("#pb-lehren")
    pruefe("Grenzlehrdorn" in leh and "Gewindelehrdorn" in leh, "Lehren erkannt: " + leh.replace("\n", " | ")[:200])
    # Erstteil
    pg.click("[data-pbneu=erstteil]"); pg.wait_for_selector("#pb-tabelle"); pg.wait_for_timeout(300)
    pg.fill("[data-pbist='n1-0']", "5.52"); pg.fill("[data-pbist='n1-1']", "5.60"); pg.mouse.move(5, 5); pg.wait_for_timeout(300)
    k0 = pg.get_attribute("[data-pbist='n1-0']", "class"); k1 = pg.get_attribute("[data-pbist='n1-1']", "class")
    pruefe("pb-ist--gut" in k0 and "pb-ist--schlecht" in k1, "gut/schlecht: %s / %s" % (k0, k1))
    pg.wait_for_timeout(1500)
    pp = pg.evaluate("() => TEST.daten.pruefprotokolle")
    pruefe(len(pp) == 1 and (pp[0].get("werte") or {}).get("n1", [None])[0] == "5.52", "Werte gespeichert: %s" % json.dumps((pp[0] if pp else {}).get("werte"))[:120])
    pg.locator("input[name=pb-entscheid]").first.check(); pg.locator(".pb-felder label:has-text('Visum') input, label:has-text('Visum') input").last.fill("TE")
    pg.click("#pb-abschliessen"); pg.wait_for_timeout(600)
    if pg.locator(".dialog-huelle").count():
        pg.locator(".dialog-huelle .knopf--haupt, .dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1200)
    pp = pg.evaluate("() => TEST.daten.pruefprotokolle")
    pruefe(pp and pp[0].get("abgeschlossen_am"), "abgeschlossen")
    # AQL
    pg.locator("button:has-text('← 99999-0001')").first.click(); pg.wait_for_selector("#pb-neu")
    pg.click("[data-pbneu=aql]"); pg.wait_for_selector("#pb-aql"); pg.wait_for_timeout(300)
    pg.locator(".pb-felder label:has-text('Losgrösse') input").fill("500"); pg.wait_for_timeout(300)
    aql = pg.inner_text("#pb-aql")
    pruefe("Stichprobe" in aql, "AQL-Plan: " + aql.replace("\n", " ")[:120])
    pg.fill("[data-pbnio='n1']", "3"); pg.wait_for_timeout(300)
    pruefe("Zurückweisen" in pg.inner_text("#pb-aql") or "pb-ist--schlecht" in pg.get_attribute("[data-pbnio='n1']", "class"), "AQL n.i.O. erkannt")
    pg.wait_for_timeout(1200)
    # LL
    pg.locator("button:has-text('← 99999-0001')").first.click(); pg.wait_for_selector("#pb-neu")
    pg.click("[data-pbneu=ll]"); pg.wait_for_selector("#pb-ll-wahl"); pg.wait_for_timeout(300)
    pg.click("[data-pbll='n1']"); pg.click("[data-pbll='n2']"); pg.click("#pb-ll-fertig"); pg.wait_for_selector("#pb-ll-probe")
    pg.click("#pb-ll-probe"); pg.wait_for_timeout(300)
    f = pg.locator("[data-pbist^='n2-']").first
    f.fill("12.05"); pg.wait_for_timeout(1500)
    pruefe(pg.locator("#pb-tabelle tbody tr").count() == 3, "LL zwei Masse und Visum")
    pp = pg.evaluate("() => TEST.daten.pruefprotokolle")
    ll = [x for x in pp if (x.get("kopf") or {}).get("art") == "ll"]
    pruefe(ll and len((ll[0].get("werte") or {}).get("proben") or []) == 1, "LL Stichprobe gespeichert")
    pruefe(len(pp) == 3, "drei Protokolle: %d" % len(pp))
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
