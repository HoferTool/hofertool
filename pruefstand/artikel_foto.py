# Artikel per Foto der Verpackung (1.109.0, Wunsch Patrick 19. Oktober
# 2026): bei „Neue Bestellposition“ ein Foto wählen; ein vorhandener
# Artikel wird gefunden, sonst lässt er sich mit der gelesenen Nummer
# anlegen. Nach dem Hinzufügen merkt sich die App die Verpackung, und
# unter Bestellungen → Artikel lassen sich Verpackungen lernen.
# Texterkennung wie bestell_foto.py (TESS_DEU), sonst nur die Knöpfe.
import os, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

HIER = os.path.dirname(os.path.abspath(__file__))
NM = os.path.join(HIER, "..", "node_modules")
DEU = os.environ.get("TESS_DEU", "")
mit_ocr = bool(DEU) and os.path.exists(os.path.join(DEU, "deu.traineddata.gz"))

def cdn(route):
    u = route.request.url
    for stueck, ordner in (("/tesseract.js@v7.0.0/dist/", os.path.join(NM, "tesseract.js", "dist")),
                           ("/tesseract.js-core@v7.0.0/", os.path.join(NM, "tesseract.js-core")),
                           ("/@tesseract.js-data/deu/4.0.0_best_int/", DEU),
                           ("/zxing-wasm@3.1.4/dist/", os.path.join(NM, "zxing-wasm", "dist"))):
        if stueck in u:
            pfad = os.path.join(ordner, u.split(stueck, 1)[1].split("?")[0])
            if os.path.exists(pfad):
                typ = "application/wasm" if pfad.endswith(".wasm") else "application/javascript" if pfad.endswith(".js") else "application/octet-stream"
                return route.fulfill(status=200, body=open(pfad, "rb").read(), content_type=typ)
            return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type="application/javascript", body=FAKE)

def packung(zeilen, farbe="#ffd400"):
    inhalt = "".join(f"<div>{z}</div>" for z in zeilen)
    return f"""<html><body style="margin:0;background:#666;padding:30px"><div style="background:{farbe};
      font-family:Arial;font-size:30px;padding:30px;width:700px;line-height:1.5">{inhalt}</div></body></html>"""

# Vorhandener Artikel MTEC-452410 (Vischer & Bolli), mit Los und EAN
P1 = packung(["<b>VB Präzisionswerkzeuge</b>", "Wendeplatte", "Art.-Nr. MTEC-452410", "EAN 7612345678901", "LOT X7Z5512A  10 Stk."])
# Dieselbe Packung ohne lesbare Nummer, nur EAN und Los
P2 = packung(["<b>VB Präzisionswerkzeuge</b>", "Wendeplatte", "EAN 7612345678901", "LOT X7Z5512A"], "#e8f4ff")
# Nur Strichcodes, kein lesbarer Text (eigener Codeleser, 1.147.0)
CODES = os.path.join(HIER, "codes")
def nur_code(name, drehen=0):
    svg = open(os.path.join(CODES, name + ".svg")).read()
    return f"""<html><body style="margin:0;background:#fff;padding:60px"><div style="display:inline-block;padding:30px;
      background:#fff;transform:rotate({drehen}deg)">{svg}</div></body></html>"""
# Unbekannt
P3 = packung(["<b>SECO</b>", "DNMU 110404-MF1 TM2510", "10 pcs", "Made in Sweden"], "#ffffff")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1400, "height": 950}, timezone_id="Europe/Zurich")
    bilder = []
    for h in (P1, P2, P3, nur_code("ean"), nur_code("ean", 90), nur_code("code128"), nur_code("dm")):
        s = ctx.new_page(); s.set_content(h); bilder.append(s.screenshot(full_page=True)); s.close()
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", cdn)
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#b-neu"); pg.wait_for_timeout(300)
    pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
    pruefe("Knopf Artikel fotografieren", pg.locator("#pd-foto-knopf").is_visible())
    def foto(i):
        pg.set_input_files("#pd-foto-datei", files=[{"name": f"p{i}.png", "mimeType": "image/png", "buffer": bilder[i]}])
        pg.wait_for_selector("#pd-foto-ergebnis", timeout=120000)

    if mit_ocr:
        foto(0)
        print("     " + pg.inner_text("#pd-foto-ergebnis").replace("\n", " | ")[:300])
        pruefe("Vorhandener Artikel gefunden", pg.locator("[data-fotow=a1]").count() == 1)
        pruefe("Klarer Treffer gleich gewählt", "MTEC-452410" in pg.inner_text("#pd-gewaehlt"))
        pg.locator(".dialog").first.screenshot(path=os.path.join(HIER, "artikel_foto.png"))
        n = pg.evaluate("TEST.daten.order_items.length")
        pg.click("#pd-ja"); pg.wait_for_timeout(1200)
        pruefe("Position angelegt", pg.evaluate("TEST.daten.order_items.length") == n + 1)
        m = pg.evaluate("TEST.daten.articles.find(a => a.id === 'a1').foto_merkmale || []")
        print("     gelernt:", m)
        pruefe("Verpackung gelernt", "7612345678901" in m)
        pruefe("Beispielfoto abgelegt", pg.evaluate("(TEST.daten.articles.find(a => a.id === 'a1').foto_bilder || []).length") == 1
               and pg.evaluate("TEST.protokoll.some(x => x.art === 'upload' && x.pfad.startsWith('artikel/a1/'))"))

        # Ohne Nummer: über das Gelernte
        pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
        foto(1)
        print("     " + pg.inner_text("#pd-foto-ergebnis").replace("\n", " | ")[:200])
        pruefe("Ohne Nummer über früheres Foto gefunden", pg.locator("[data-fotow=a1]").count() == 1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

        # Unbekannt: neu anlegen mit gelesener Nummer
        pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
        foto(2)
        txt = pg.inner_text("#pd-foto-ergebnis")
        print("     " + txt.replace("\n", " | ")[:300])
        pruefe("Unbekannt: kein Treffer", pg.locator("#pd-foto-nichts").count() == 1)
        nummern = pg.eval_on_selector_all("[data-fotonr]", "e => e.map(x => x.dataset.fotonr)")
        pruefe("Nummer vorgeschlagen", any("110404" in x for x in nummern))
        pg.locator(".dialog").first.screenshot(path=os.path.join(HIER, "artikel_foto_neu.png"))
        knopf = [x for x in nummern if "110404" in x][0]
        pg.click(f"[data-fotonr='{knopf}']"); pg.wait_for_timeout(500)
        pruefe("Neuer Artikel: Nummer übernommen", pg.locator(".dialog-huelle input").last.input_value() == knopf
               or knopf in [pg.locator(".dialog-huelle input").nth(i).input_value() for i in range(pg.locator(".dialog-huelle input").count())])
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    if mit_ocr:
        # Strichcode ohne Text: gelesen, gelernt, wiedererkannt
        pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
        foto(3)
        codes = pg.inner_text("#pd-foto-codes") if pg.locator("#pd-foto-codes").count() else ""
        print("     " + codes)
        pruefe("EAN gelesen", "7612345678900" in codes)
        pg.type("#pd-such", "MTEC"); pg.wait_for_selector("#pd-treffer [data-w]"); pg.click("#pd-treffer [data-w=a1]")
        pg.click("#pd-ja"); pg.wait_for_timeout(1200)
        pruefe("EAN gelernt", "CODE:7612345678900" in pg.evaluate("TEST.daten.articles.find(a => a.id === 'a1').foto_merkmale || []"))
        pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
        foto(4)
        pruefe("Gedrehter Strichcode findet den Artikel", pg.locator("[data-fotow=a1] .bs-chip").count() == 1
               and pg.inner_text("[data-fotow=a1] .bs-chip") == "passt")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
        foto(5)
        nummern = pg.eval_on_selector_all("[data-fotonr]", "e => e.map(x => x.dataset.fotonr)")
        print("     Code 128:", nummern)
        pruefe("Code 128 als Nummer vorgeschlagen", "SCMT 120408" in nummern)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
        foto(6)
        codes = pg.inner_text("#pd-foto-codes") if pg.locator("#pd-foto-codes").count() else ""
        print("     Data Matrix: " + codes)
        pruefe("Data Matrix gelesen, GTIN herausgenommen", "7612345678900" in codes and "LOT" not in codes)
        pruefe("Data Matrix findet den Artikel", pg.locator("[data-fotow=a1]").count() == 1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Bestellungen → Artikel: Verpackung lernen
    pg.click("text=Artikel >> nth=0"); pg.wait_for_selector("[data-arfoto]", timeout=8000)
    pg.click("[data-arfoto=a1]"); pg.wait_for_selector("#af-knopf")
    pruefe("Fenster Verpackung lernen", "Verpackung lernen" in pg.inner_text(".af-dialog"))
    if mit_ocr:
        vorher = pg.locator(".af-bild").count()
        pg.set_input_files("#af-datei", files=[{"name": "p.png", "mimeType": "image/png", "buffer": bilder[1]}])
        pg.wait_for_function(f"document.querySelectorAll('.af-bild').length === {vorher + 1}", timeout=120000)
        pruefe("Foto gelernt und gezeigt", True)
        pg.locator(".af-dialog").screenshot(path=os.path.join(HIER, "artikel_foto_lernen.png"))
        pg.click(".af-bild [data-afweg] >> nth=0"); pg.wait_for_timeout(300)
        pg.click(".dialog-huelle >> text=Löschen >> nth=-1"); pg.wait_for_timeout(600)
        pruefe("Foto gelöscht", pg.locator(".af-bild").count() == vorher)
    br.close()

print("Fehler:", "; ".join(fehler) if fehler else "keine")
