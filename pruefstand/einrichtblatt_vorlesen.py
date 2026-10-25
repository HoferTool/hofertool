# Seit 1.178.0: Die App liest alle Excel-Einrichtblätter ohne Blatt in
# der App im Hintergrund ein und speichert sie als „noch nicht bestätigt“;
# vorhandene Blätter bleiben, nichts ist bestätigt, das Excel bleibt.
import base64, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from pruefstand import server_starten, FAKE, CH, PORT
server_starten()
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
HIER = os.path.dirname(os.path.abspath(__file__))
XL = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + base64.b64encode(
    open(os.path.join(HIER, "einrichtblatt-app-beispiel.xlsx"), "rb").read()).decode()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    # Das Excel als „.xlsx“-Adresse, wie in echt aus der Ablage
    pg.route("**/eb/*.xlsx", lambda r: r.fulfill(status=200, body=base64.b64decode(XL.split(",", 1)[1]),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
    u = f"http://127.0.0.1:{PORT}/eb/"
    pg.evaluate("""(u) => {
      const D = TEST.daten;
      D.hoco_type_data.push({ hoco_nr: '10000-0301', type_id: 't1', blatt_url: u + 'a.xlsx' });
      D.hoco_type_data.push({ hoco_nr: '10000-0302', type_id: 't1', blatt_url: u + 'b.xlsx' });
      D.hoco_type_data.push({ hoco_nr: '10000-0303', type_id: 't1', blatt_url: u + 'alt.xls' });
      D.einrichtblatt_app = [{ id: 'x1', hoco_nr: '10000-0302', type_id: 't1', programme: {}, plaetze: { T100: { taetigkeit: 'Eigenes' } },
        kopf: {}, seiten: [], gut_am: null }];
    }""", u)
    pruefe("Im Prüfstand auf Abruf", pg.evaluate("typeof TEST.ebVorlesen") == "function")
    pg.evaluate("TEST.ebVorlesen()"); pg.wait_for_timeout(500)
    b = pg.evaluate("TEST.daten.einrichtblatt_app")
    neu = [x for x in b if x["hoco_nr"] == "10000-0301"]
    pruefe("Neues Blatt eingelesen", len(neu) == 1 and neu[0]["plaetze"]["T100"].get("taetigkeit") == "Abstechen")
    pruefe("Nicht bestätigt", neu and not neu[0].get("gut_am"))
    pruefe("Vorhandenes Blatt bleibt", [x for x in b if x["hoco_nr"] == "10000-0302"][0]["plaetze"]["T100"]["taetigkeit"] == "Eigenes")
    pruefe("Altes .xls übersprungen", not any(x["hoco_nr"] == "10000-0303" for x in b))
    pruefe("Excel bleibt", pg.evaluate("TEST.daten.hoco_type_data.find(x => x.hoco_nr === '10000-0301').blatt_url").endswith("a.xlsx"))
    n = len(b); pg.evaluate("TEST.ebVorlesen()"); pg.wait_for_timeout(800)
    pruefe("Zweiter Durchgang tut nichts", len(pg.evaluate("TEST.daten.einrichtblatt_app")) == n)
    br.close()
print("Fehler:", fehler[:4] if fehler else "keine")
