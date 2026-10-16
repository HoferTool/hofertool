# Einrichtblatt in der App (1.43.0, Test): Excel einlesen, Stammdaten
# bestätigen, Platz bearbeiten mit Artikel und Bild aus der Bibliothek,
# Bild am Artikel gemerkt, „Blatt ist gut“ löscht das Excel.
# Beispiel-Excel: node pruefstand/einrichtblatt_app_beispiel.mjs
import time, base64, os, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
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
    pg.evaluate("""(XL) => {
      TEST.daten.hoco_type_data.push({ hoco_nr: '10000-0301', type_id: 't1', blatt_url: XL, stueckzeit_s: null });
      TEST.daten.einrichtblatt_app = []; TEST.daten.artikel_bild = []; TEST.daten.eb_bilder = []; TEST.daten.eb_spezial = [];
    }""", XL)
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_selector(".betrachter"); pg.wait_for_timeout(800)

    k = pg.locator("[data-dokextra='einrichtblatt']")
    pruefe("Knopf „Ins App-Blatt umwandeln“", k.count() == 1 and "umwandeln" in k.inner_text())
    k.click(); pg.wait_for_timeout(1500)
    # Stammdaten bestätigen
    d = pg.locator(".dialog-huelle .dialog").last
    pruefe("Stammdaten-Frage", "Stimmen die Stammdaten" in d.inner_text())
    pruefe("Waschgebinde-Auswahl", d.locator("select").count() == 1)
    pruefe("Programm-Nr. bei den Stammdaten (letzte drei Ziffern)", d.locator("input[id$='prg_nr']").input_value() == "111, 333")
    d.locator("[data-ja]").click(); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(600)
    b = pg.evaluate("TEST.daten.einrichtblatt_app[0]")
    print(json.dumps(b, ensure_ascii=False)[:600])
    pruefe("Blatt angelegt", b and b["hoco_nr"] == "10000-0301" and b["type_id"] == "t1")
    pruefe("Programme", b["programme"].get("1") == "O1111" and b["programme"].get("3") == "O3333")
    pruefe("Platz T100 eingelesen", b["plaetze"]["T100"].get("taetigkeit") == "Abstechen" and b["plaetze"]["T100"].get("standzeit") == 1000)
    pruefe("Artikel aus Werkzeugtext erkannt", b["plaetze"]["T100"].get("article_id") == "a1")
    pruefe("Keine Fotos aus dem Excel", all("bild" not in v for v in b["plaetze"].values()))
    pruefe("Maschinen-Nr.", b["maschine_nr"] == "Nr.7")
    hp = pg.evaluate("TEST.daten.hoco_parts.find(x => x.hoco_nr === '10000-0301') || {}")
    pruefe("Bezeichnung nicht aus dem Excel übernommen", hp.get("bezeichnung") != "Deckel Muster")
    td = pg.evaluate("TEST.daten.hoco_type_data.find(x => x.hoco_nr === '10000-0301' && x.type_id === 't1')")
    pruefe("Stückzeit ergänzt", td.get("stueckzeit_s") == 33)
    s = pg.inner_text("[data-eba-seite]")
    pruefe("Blatt zeigt Kopf", "Werkzeug- Protokoll-Star SR32J" in s and "O1111" in s and "10000-0301" in s and "Artikel Bezeich" not in s)
    pruefe("Keine Bilder von selbst", pg.locator("[data-eba-seite] [data-bild]").count() == 0)
    pg.screenshot(path="einrichtblatt_app_ansicht.png")

    # Bearbeiten: Platz T200, Artikel, HD ein, Standzeit, Bild hochladen
    pg.click("[data-eba-bearbeiten]"); pg.wait_for_timeout(300)
    pg.click("[data-platz='T200']"); pg.wait_for_selector("[data-platzfenster='T200']")
    pf = pg.locator("[data-platzfenster='T200']")
    pf.locator("[data-pf='hd']").click()
    pf.locator("[data-pf='standzeit']").fill("2500")
    pf.locator("[data-pf='werkzeug']").fill("MTEC")
    pg.wait_for_timeout(300)
    pruefe("Artikel-Vorschlag", pf.locator("[data-artikel='a1']").count() == 1 and pf.locator("[data-pf-neuartikel]").count() == 1
           and pf.locator("[data-pf-spezial]").count() == 1)
    pf.locator("[data-artikel='a1']").click()
    pf.locator("[data-pf-bild]").click()
    pruefe("Bibliothek ohne gezeichnete Bilder", pf.locator("[data-pf-bibliothek] [data-bib]").count() == 1
           and pf.locator("[data-bib-hoch]").count() == 1)
    PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    pf.locator("[data-bib-hoch]").set_input_files({"name": "mein-werkzeug.png", "mimeType": "image/png", "buffer": PNG})
    pg.wait_for_timeout(1200)
    eb = pg.evaluate("TEST.daten.eb_bilder")
    pruefe("Eigenes Bild hochgeladen und gewählt", len(eb) == 1 and eb[0]["name"] == "mein-werkzeug" and pf.locator("[data-pf-bild] .eba-svg--foto").count() == 1)
    pg.screenshot(path="einrichtblatt_app_platz.png")
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(500)
    schl = "eigen:" + eb[0]["id"]
    pruefe("Bild am Artikel gemerkt", pg.evaluate("TEST.daten.artikel_bild.find(x => x.article_id === 'a1')?.bild") == schl)
    pruefe("T100 bekommt das Artikelbild auch", pg.locator(f"[data-platz='T100'] [data-bild='{schl}']").count() == 1)

    # Spezialwerkzeug: füllt den Platz, wird kein Artikel
    artikel_vorher = pg.evaluate("TEST.daten.articles.length")
    pg.click("[data-platz='T3100']"); pg.wait_for_selector("[data-platzfenster='T3100']")
    pf = pg.locator("[data-platzfenster='T3100']")
    pf.locator("[data-pf='werkzeug']").fill("Sonderhalter XY")
    pg.wait_for_timeout(300)
    pf.locator("[data-pf-spezial]").click(); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(600)
    sp = pg.evaluate("TEST.daten.eb_spezial")
    pruefe("Spezialwerkzeug angelegt, kein Artikel", len(sp) == 1 and sp[0]["name"] == "Sonderhalter XY"
           and pg.evaluate("TEST.daten.articles.length") == artikel_vorher)
    pf.locator("[data-pf-bild]").click()
    pf.locator(f"[data-bib='{schl}']").click(); pg.wait_for_timeout(200)
    pf.locator("[data-pf-ok]").click(); pg.wait_for_timeout(500)
    pruefe("Bild am Spezialwerkzeug gemerkt", pg.evaluate("TEST.daten.eb_spezial[0].bild") == schl)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(800)
    b = pg.evaluate("TEST.daten.einrichtblatt_app[0]")
    t2 = b["plaetze"]["T200"]
    pruefe("T200 gespeichert", t2.get("hd") is True and t2.get("standzeit") == 2500 and t2.get("article_id") == "a1" and t2.get("werkzeug") == "MTEC-452410")
    pruefe("HD auf dem Blatt", pg.locator("[data-platz='T200'] [data-hd]").count() == 1)
    pruefe("T3100 mit Spezialwerkzeug", b["plaetze"]["T3100"].get("spezial_id") == sp[0]["id"] and not b["plaetze"]["T3100"].get("article_id"))

    # Blatt ist gut: Excel weg
    pg.click("[data-eba-gut]"); pg.wait_for_selector(".dialog-huelle [data-ja]")
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(900)
    td = pg.evaluate("TEST.daten.hoco_type_data.find(x => x.hoco_nr === '10000-0301' && x.type_id === 't1')")
    b = pg.evaluate("TEST.daten.einrichtblatt_app[0]")
    pruefe("Excel aus der Datenbank", not td.get("blatt_url") and b.get("gut_am"))
    pruefe("Knöpfe Excel weg", pg.locator("[data-eba-excel], [data-eba-gut]").count() == 0)
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(400)

    # Nochmals öffnen: direkt das App-Blatt, nach der Stammdaten-Frage
    pg.locator("[data-blatt-typ='t1']").click(); pg.wait_for_timeout(1000)
    pruefe("Frage beim Öffnen jedes Mal", "Stimmen die Stammdaten" in pg.locator(".dialog-huelle .dialog").last.inner_text())
    pg.locator(".dialog-huelle .dialog [data-ja]").last.click(); pg.wait_for_timeout(800)
    pruefe("App-Blatt statt Excel", pg.locator("[data-eba-seite]").count() == 1)
    br.close()
print("Fehler:", fehler[:4] if fehler else "keine")
