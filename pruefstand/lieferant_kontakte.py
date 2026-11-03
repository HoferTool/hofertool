# Kontaktpersonen und Besuche bei den Lieferanten (1.371.0, Wunsch
# Patrick 3. November 2026): Knopf „Kontakte“ im Reiter Lieferanten,
# Visitenkarte fotografieren füllt die Felder (Texterkennung im Gerät),
# Besuch mit Datum und Notiz. Die Erkennung wird nur geprüft, wenn
# TESS_DEU auf den Ordner mit deu.traineddata.gz zeigt (siehe bestell_foto.py).
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
# Seit 1.377.0 liegt die Texterkennung in der eigenen Website (dist/tesseract/)
mit_ocr = os.path.exists(os.path.join(HIER, "..", "dist", "tesseract", "sprache", "deu.traineddata.gz"))

def cdn(route):
    u = route.request.url
    if "tesseract" in u:
        fehler.append("Texterkennung von jsdelivr: " + u[:120])
        return route.abort()
    for stueck, ordner in (("/tesseract.js@v7.0.0/dist/", os.path.join(NM, "tesseract.js", "dist")),
                           ("/tesseract.js-core@v7.0.0/", os.path.join(NM, "tesseract.js-core")),
                           ("/@tesseract.js-data/deu/4.0.0_best_int/", DEU)):
        if stueck in u:
            pfad = os.path.join(ordner, u.split(stueck, 1)[1].split("?")[0])
            if os.path.exists(pfad):
                typ = "application/wasm" if pfad.endswith(".wasm") else "application/javascript" if pfad.endswith(".js") else "application/octet-stream"
                return route.fulfill(status=200, body=open(pfad, "rb").read(), content_type=typ)
            return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type="application/javascript", body=FAKE)

KARTE = """<html><body style="margin:0;background:#fff"><div style="font-family:Arial;width:850px;height:500px;padding:50px;box-sizing:border-box;background:#fff">
<div style="font-size:34px;font-weight:bold;color:#0a3d7a">VISCHER &amp; BOLLI AG</div>
<div style="font-size:20px;color:#555;margin-bottom:40px">Spannsysteme</div>
<div style="font-size:30px;font-weight:bold">Thomas Brunner</div>
<div style="font-size:22px;margin-bottom:30px">Verkaufsberater Aussendienst</div>
<div style="font-size:22px">Tel. +41 44 802 15 15</div>
<div style="font-size:22px">Mobil +41 79 412 33 21</div>
<div style="font-size:22px">thomas.brunner@vb.ch</div>
</div></body></html>"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Europe/Zurich")
    bs = ctx.new_page(); bs.set_content(KARTE); bild = bs.locator("div").first.screenshot(); bs.close()
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", cdn)
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""TEST.daten.lieferant_kontakte = [];
      TEST.daten.lieferant_besuche = [{ id: 'b0', supplier_id: 's2', datum: '2026-10-20', notiz: 'Alter Besuch', erstellt_von: null }];""")
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("[data-unter='bestellungen/lieferanten']", timeout=8000)
    pg.click("[data-unter='bestellungen/lieferanten']")
    pg.wait_for_selector("[data-lfkontakte='s1']", timeout=8000)
    pruefe("Knopf Kontakte bei jedem Lieferanten", pg.locator("[data-lfkontakte]").count() == 2)
    pruefe("Letzter Besuch steht da", "20.10.2026" in pg.inner_text("[data-lfkontakte='s2']"))

    pg.click("[data-lfkontakte='s1']"); pg.wait_for_selector("#lk-fenster #lk-karte")
    pruefe("Fenster mit Lieferant", "Vischer" in pg.inner_text("#lk-fenster h2"))

    if mit_ocr:
        pg.set_input_files("#lk-foto", files=[{"name": "karte.png", "mimeType": "image/png", "buffer": bild}])
        pg.wait_for_selector("#lk-dialog #lk-gelesen", timeout=120000)
        werte = {f: pg.input_value("#lk-f-" + f) for f in ["name", "funktion", "telefon", "mobil", "email"]}
        print("     ", werte)
        pruefe("Name erkannt", werte["name"] == "Thomas Brunner")
        pruefe("Funktion erkannt", "Verkaufsberater" in werte["funktion"])
        pruefe("Telefon erkannt", werte["telefon"].replace(" ", "") == "+41448021515")
        pruefe("Mobil erkannt", werte["mobil"].replace(" ", "") == "+41794123321")
        pruefe("Mail erkannt", werte["email"] == "thomas.brunner@vb.ch")
        pg.locator("#lk-dialog").screenshot(path=os.path.join(HIER, "lieferant_kontakte_karte.png"))
    else:
        pg.click("#lk-neu"); pg.wait_for_selector("#lk-dialog")
        pg.fill("#lk-f-name", "Thomas Brunner"); pg.fill("#lk-f-email", "thomas.brunner@vb.ch")
    # Profilbild (seit 1.377.0): ein Hochformat wird quadratisch zugeschnitten
    bs = ctx.new_page(); bs.set_viewport_size({"width": 300, "height": 500})
    bs.set_content("<body style='margin:0;background:linear-gradient(#e33,#33e)'></body>")
    profil = bs.screenshot(type="jpeg"); bs.close()
    pruefe("Ohne Bild: Anfangsbuchstaben", pg.inner_text("#lk-dialog .lk-profil--leer") == "TB")
    pg.set_input_files("#lk-f-profil-datei", files=[{"name": "p.jpg", "mimeType": "image/jpeg", "buffer": profil}])
    pg.wait_for_selector("#lk-f-profilbild", timeout=5000)
    pruefe("Profilbild in der Vorschau", pg.locator("#lk-f-profil-weg").count() == 1)
    pg.click("#lk-f-speichern"); pg.wait_for_timeout(600)
    k = pg.evaluate("TEST.daten.lieferant_kontakte")
    pruefe("Profilbild gespeichert", bool(k and k[0].get("foto_url")) and "lieferanten/s1/profil/" in (k[0].get("foto_pfad") or ""))
    pruefe("Profilbild rund in der Liste", pg.locator("#lk-kontakte button.lk-profil img").count() == 1)
    # Ändern: Profilbild entfernen
    pg.click("[data-lkbearb]"); pg.wait_for_selector("#lk-f-profil-weg")
    pg.click("#lk-f-profil-weg"); pg.click("#lk-f-speichern"); pg.wait_for_timeout(600)
    k = pg.evaluate("TEST.daten.lieferant_kontakte")
    pruefe("Profilbild entfernt", k and not k[0].get("foto_url"))
    pg.click("[data-lkbearb]"); pg.wait_for_selector("#lk-f-profil")
    pg.set_input_files("#lk-f-profil-datei", files=[{"name": "p.jpg", "mimeType": "image/jpeg", "buffer": profil}])
    pg.wait_for_selector("#lk-f-profilbild", timeout=5000)
    pg.click("#lk-f-speichern"); pg.wait_for_timeout(600)
    k = pg.evaluate("TEST.daten.lieferant_kontakte")
    pruefe("Kontakt gespeichert", len(k) == 1 and k[0]["name"] == "Thomas Brunner" and k[0]["supplier_id"] == "s1")
    if mit_ocr:
        pruefe("Visitenkarte abgelegt", bool(k[0].get("karte_url")) and "lieferanten/s1/karten/" in (k[0].get("karte_pfad") or ""))
    pruefe("Kontakt im Fenster", pg.locator("#lk-kontakte .lk-kontakt").count() == 1)

    # Besuch
    pg.click("#lk-besuch-neu"); pg.wait_for_selector(".dialog textarea")
    pg.fill(".dialog input[type=date]", "2026-11-03")
    pg.fill(".dialog textarea", "Neue Spannzangen gezeigt.\nMuster kommt nächste Woche.")
    pg.click(".dialog [data-ja]"); pg.wait_for_timeout(600)
    b = pg.evaluate("TEST.daten.lieferant_besuche.filter(x => x.supplier_id === 's1')")
    pruefe("Besuch gespeichert mit Kontakt", len(b) == 1 and b[0]["datum"] == "2026-11-03" and b[0]["kontakt_id"] == k[0]["id"])
    pruefe("Besuch im Fenster", "3. November 2026" in pg.inner_text("#lk-besuche") or "03.11" in pg.inner_text("#lk-besuche"))
    pg.locator("#lk-fenster").screenshot(path=os.path.join(HIER, "lieferant_kontakte.png"))
    # Dunkel
    pg.evaluate("document.body.classList.add('dunkel')")
    pg.locator("#lk-fenster").screenshot(path=os.path.join(HIER, "lieferant_kontakte_dunkel.png"))
    pg.evaluate("document.body.classList.remove('dunkel')")

    # Löschen des Kontakts lässt den Besuch stehen
    pg.click("[data-lkweg]"); pg.click(".dialog [data-ja]"); pg.wait_for_timeout(500)
    pruefe("Kontakt gelöscht", len(pg.evaluate("TEST.daten.lieferant_kontakte")) == 0)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe("Fenster zu, Zeile zählt neu", "letzter Besuch 03.11.2026" in pg.inner_text("[data-lfkontakte='s1']"))
    # Handy
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.click("[data-lfkontakte='s2']"); pg.wait_for_selector("#lk-fenster")
    pg.wait_for_timeout(300)
    pruefe("Handy: nichts ragt heraus", pg.evaluate("document.querySelector('#lk-fenster').scrollWidth <= document.querySelector('#lk-fenster').clientWidth + 1"))
    pg.screenshot(path=os.path.join(HIER, "lieferant_kontakte_handy.png"))
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
