# Einstellungen → Dokumente → Zuletzt abgelegt: bei einer WBG steht, an
# welchem Auftrag sie hängt (FA Nr., Maschine, ab, Zustand), ein Tipp
# öffnet das Auftragsfenster (Wunsch Patrick 29. Oktober 2026)
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """daten.jobs[0].wbg_url = 'https://x/wbg1.pdf'; daten.jobs[0].fa_nr = '20268566'; daten.jobs[0].plan_status = 'laeuft';
daten.dokumente = [
  { id: 'w1', art: 'wbg', hoco_nr: daten.jobs[0].job_number, type_id: null, titel: '20268566',
    dateiname: '20268566 ' + daten.jobs[0].job_number + '.pdf', datei_url: 'https://x/wbg1.pdf', erstellt_am: '2026-10-29T08:00:00Z' },
  { id: 'w2', art: 'wbg', hoco_nr: '10007-0381', type_id: null, titel: '20260001',
    dateiname: '20260001 10007-0381.pdf', datei_url: 'https://x/wbg-weg.pdf', erstellt_am: '2026-10-28T08:00:00Z' },
  { id: 'z1', art: 'zeichnung', hoco_nr: '10844-0049', type_id: null, titel: 'Z',
    dateiname: 'z.pdf', datei_url: 'https://x/z.pdf', erstellt_am: '2026-10-27T08:00:00Z' }];
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(1500)
    j = pg.evaluate("({ nr: TEST.daten.jobs[0].job_number, m: TEST.daten.machines.find(m => m.id === TEST.daten.jobs[0].machine_id) })")
    zeilen = [pg.inner_text(f"#dok-letzte tbody tr:nth-child({i})") for i in (1, 2, 3)]
    for z in zeilen: print("Zeile:", z.replace("\n", " | "))
    mname = j["m"].get("machine_number") or j["m"]["name"]
    pruefe("WBG zeigt Auftrag, FA, Maschine, Zustand", "Auftrag " + j["nr"] in zeilen[0] and "FA 20268566" in zeilen[0] and mname in zeilen[0] and "läuft" in zeilen[0] and " ab " in zeilen[0])
    pruefe("WBG ohne Auftrag", "an keinem Auftrag (mehr)" in zeilen[1])
    pruefe("Zeichnung wie vorher", "10844-0049" in zeilen[2] and "Auftrag" not in zeilen[2])
    if os.environ.get("BILD_ORDNER"):
        pg.locator("#dok-letzte").screenshot(path=os.environ["BILD_ORDNER"] + "/wbg-ziel.png")
    pg.locator("[data-wbgziel] .linkknopf").first.click(); pg.wait_for_timeout(1200)
    pruefe("Auftragsfenster geht auf", j["nr"] in pg.inner_text("body") and pg.locator(".fenster, .dialog-huelle").count() > 0)
    pruefe("Keine Fehler: " + str(f), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
