# Einrichtblatt-Ordner (111.48.0): je Ordner ein Typ, Schalter „Hochladen“
# erst nach Rückfrage, Probelauf-Liste aus eb_ordner_status
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
STATUS = {"zeit": "2099-01-01T00:00:00Z", "rechner": "BUERO1", "scharf": False, "excel": 5, "neu": 2, "ersetzt": 1,
          "gleich": 0, "ohneNr": 1, "aelter": 1, "hochgeladen": 0, "fehler": None,
          "ordner": [{"pfad": "\\\\FS01\\EB\\SR32", "typ": "Star SR-32J", "excel": 5, "fehler": None},
                     {"pfad": "Z:\\EB", "typ": "Tornos Swiss GT 26", "excel": 0, "fehler": "Ordner nicht erreichbar"}],
          "liste": [{"o": 0, "d": "10844-0049.xlsx", "h": "10844-0049", "w": "würde hochladen: neu"},
                    {"o": 0, "d": "Vorlage.xlsx", "h": "", "w": "ohne HOCO Nr. im Namen, bleibt weg"}]}
K = "daten.app_config.push({ schluessel: 'eb_ordner_status', wert: %s });" % json.dumps(json.dumps(STATUS))
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
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_timeout(1200)

    pruefe("Abschnitt da", pg.locator("#eb-ordner").count() == 1)
    st = pg.inner_text("#eb-stand"); print(st)
    pruefe("Probelauf-Stand", "Probelauf" in st and "3 würden hochgeladen" in st)
    pruefe("Liste zeigt Datei", "10844-0049.xlsx" in pg.inner_text("#eb-tabelle"))
    pruefe("Ordnerfehler sichtbar", "Ordner nicht erreichbar" in pg.inner_text("#eb-ordner"))
    pruefe("Pool-Text nur WBGs", "nur für WBGs" in pg.inner_text("#inhalt, body"))

    # Ordner ohne Typ wird nicht gespeichert
    pg.locator(".eb-ordner-pfad").first.fill("\\\\FS01\\EB\\SR32")
    pg.click("#eb-speichern"); pg.wait_for_timeout(300)
    pruefe("Ohne Typ nicht gespeichert", pg.evaluate("TEST.daten.app_config.some(x => x.schluessel === 'eb_ordner')") == False)
    pg.locator(".eb-ordner-zeile select").first.select_option("t1")
    pg.click("#eb-ordner-dazu")
    pg.locator(".eb-ordner-pfad").nth(1).fill("\\\\FS01\\EB\\GT26")
    pg.locator(".eb-ordner-zeile select").nth(1).select_option("t2")
    pg.locator(".eb-ordner-zeile input[type=checkbox]").nth(1).check()
    pg.click("#eb-speichern"); pg.wait_for_timeout(400)
    w = json.loads(pg.evaluate("(TEST.daten.app_config.findLast(x => x.schluessel === 'eb_ordner') || {}).wert || 'null'"))
    print(w)
    pruefe("Gespeichert, aus", w and w["scharf"] is False and len(w["ordner"]) == 2
           and w["ordner"][0] == {"pfad": "\\\\FS01\\EB\\SR32", "typ": "t1", "unter": False}
           and w["ordner"][1]["unter"] is True)

    # Einschalten fragt nach; Abbrechen lässt es aus
    pg.click("#eb-scharf"); pg.wait_for_timeout(300)
    pg.click(".dialog-huelle [data-nein]"); pg.wait_for_timeout(300)
    w = json.loads(pg.evaluate("TEST.daten.app_config.findLast(x => x.schluessel === 'eb_ordner').wert"))
    pruefe("Abbrechen lässt aus", w["scharf"] is False and not pg.is_checked("#eb-scharf"))
    pg.click("#eb-scharf"); pg.wait_for_timeout(300)
    pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(400)
    w = json.loads(pg.evaluate("TEST.daten.app_config.findLast(x => x.schluessel === 'eb_ordner').wert"))
    pruefe("Eingeschaltet", w["scharf"] is True and pg.is_checked("#eb-scharf") and len(w["ordner"]) == 2)
    pg.locator("#eb-ordner").screenshot(path="eb_ordner.png")
    fehler += f
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
