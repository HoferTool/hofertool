# Material in den Stammdaten ohne Lieferant, Menge und Bestellnummer
# (seit 1.942.0, Patrick 27. November 2026): Am Auftrag darf „Prometall
# 1100kg“ stehen, in die HOCO Nr. kommt nur die Bezeichnung. Unterscheidet
# sich nur das, fragt das Fenster nicht „Material auch beim Teil ändern?“.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)

    # 1) Bestehende HOCO Nr. mit leerem Material: bekommt nur die Bezeichnung
    jid = pg.evaluate("""[...document.querySelectorAll('.pw-balken[data-auftrag]')].map(b => b.dataset.auftrag)
        .find(id => { const j = TEST.daten.jobs.find(x => x.id === id);
          return j && !j.ended_at && TEST.daten.hoco_parts.some(h => h.hoco_nr === j.job_number); })""")
    nr = pg.evaluate(f"TEST.daten.jobs.find(x => x.id === '{jid}').job_number")
    pg.evaluate(f"TEST.daten.hoco_parts.find(h => h.hoco_nr === '{nr}').material = null")
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.fill("#pl-mat-bez", "CuZn38Pb2 rd 005 mm h9 Prometall 1100kg 2025007928 TE: 22.09.25")
    pg.click("#pl-ja"); pg.wait_for_timeout(1500)
    j = pg.evaluate(f"TEST.daten.jobs.find(x => x.id === '{jid}')")
    pruefe("Auftrag behält alles", j["material_bez"] == "CuZn38Pb2 rd 005 mm h9 Prometall 1100kg 2025007928 TE: 22.09.25")
    m = pg.evaluate(f"TEST.daten.hoco_parts.find(h => h.hoco_nr === '{nr}').material")
    pruefe("Stammdaten nur Bezeichnung: " + str(m), m == "CuZn38Pb2 rd 005 mm h9")

    # 2) Nur andere Menge am Auftrag: keine Rückfrage, Stammdaten bleiben
    pg.locator(f".pw-balken[data-auftrag='{jid}']").first.dblclick(); pg.wait_for_selector(".dialog--auftrag")
    pg.fill("#pl-mat-bez", "CuZn38Pb2 rd 005 mm h9 Metalix 300 kg")
    pg.click("#pl-ja"); pg.wait_for_timeout(1500)
    frage = pg.evaluate("[...document.querySelectorAll('.dialog-huelle')].some(d => d.innerText.includes('auch beim Teil'))")
    pruefe("keine Rückfrage bei nur anderer Menge", not frage)
    if frage: pg.locator(".dialog-huelle [data-nein]").last.click(); pg.wait_for_timeout(500)
    m = pg.evaluate(f"TEST.daten.hoco_parts.find(h => h.hoco_nr === '{nr}').material")
    pruefe("Stammdaten unverändert", m == "CuZn38Pb2 rd 005 mm h9")

    br.close()
# Reine Umwandlung, direkt mit Node
import json, os, subprocess
proben = {
    "11SMnPb37 rd 030 mm h9 220kgSteeltec 2023006208 16.05.23": "11SMnPb37 rd 030 mm h9",
    "ETG100 rd 012 mm h6 30kg Lager + 30kg Steeltec 2024007002 TE: 11.06.24": "ETG100 rd 012 mm h6",
    "X10CrNiS18-9 Ø40 Notz 655.4 kg": "X10CrNiS18-9 Ø40",
    "2.0400999999999998 Ø5.0 h9": "2.0401 Ø5.0 h9",
    "X20CrNiMoS13 rd 010 mm h6 (1.4197)": "X20CrNiMoS13 rd 010 mm h6 (1.4197)",
    "X46Cr13 rd 030 mm 0/+0.25": "X46Cr13 rd 030 mm 0/+0.25",
    "ab rahmen steeltec 2026008694": "",
}
datei = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src", "daten", "materialBestellung.js"))
js = "import('file://" + datei + "').then(m => console.log(JSON.stringify(" + json.dumps(list(proben)) + ".map(m.materialOhneBestellung))))"
ist = json.loads(subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True).stdout or "[]")
for (roh, soll), i in zip(proben.items(), ist):
    pruefe(roh + " → " + i, i == soll)
if len(ist) != len(proben): pruefe("Node-Probe lief", False)
print("Fehler:", ", ".join(fehler) if fehler else "keine")
