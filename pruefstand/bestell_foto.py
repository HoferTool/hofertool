# Foto einer Bestellung lesen (1.107.0, Wunsch Patrick 19. Oktober 2026):
# im Fenster „Material erfassen“ ein Foto wählen, die Texterkennung
# füllt Material und kg. Die Bibliothek kommt sonst von jsdelivr; hier
# aus node_modules, die deutschen Sprachdaten aus TESS_DEU (Ordner mit
# deu.traineddata.gz aus dem npm-Paket @tesseract.js-data/deu). Fehlen
# sie, wird nur die Auswertung des Textes geprüft.
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
                           ("/@tesseract.js-data/deu/4.0.0_best_int/", DEU)):
        if stueck in u:
            pfad = os.path.join(ordner, u.split(stueck, 1)[1].split("?")[0])
            if os.path.exists(pfad):
                typ = "application/wasm" if pfad.endswith(".wasm") else "application/javascript" if pfad.endswith(".js") else "application/octet-stream"
                return route.fulfill(status=200, body=open(pfad, "rb").read(), content_type=typ)
            return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type="application/javascript", body=FAKE)

BESTELLUNG = """<html><body style="font-family:Arial;padding:40px;width:900px;background:#fff">
<h2>Auftragsbestätigung 45821</h2><p>Hofer + Co. Präzisionsdrehteile, Lohn-Ammannsegg</p>
<table style="font-size:20px;border-collapse:collapse" cellpadding="8">
<tr><td>Pos</td><td>Artikel</td><td>Menge</td><td>Preis</td></tr>
<tr><td>1</td><td>Rundstahl blank 1.4305 X8CrNiS18-9 rd 24 mm h9</td><td>1'245,5 kg</td><td>CHF 4.20 /kg</td></tr>
</table><p style="font-size:20px">Netto-Gewicht: 1'245,5 kg</p><p style="font-size:20px">Total CHF 5'231.10</p></body></html>"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1500, "height": 950}, timezone_id="Europe/Zurich")
    # Das „Foto“: die Bestellung als Bild
    bildseite = ctx.new_page(); bildseite.set_content(BESTELLUNG)
    bild = bildseite.screenshot(full_page=True); bildseite.close()
    pg = ctx.new_page()
    pg.expose_function("HOFER_FOTO_PROBE", lambda x: print("     Bild:", x))
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", cdn)
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("TEST.daten.material_posten = []")
    pg.evaluate("location.hash='#material'")
    pg.wait_for_selector("#mat-neu", timeout=8000)
    pg.click("#mat-neu"); pg.wait_for_selector(".mat-dialog #mat-suche")
    pruefe("Knopf Foto im Fenster", pg.locator("#mat-foto-knopf").is_visible())

    if mit_ocr:
        pg.set_input_files("#mat-foto-datei", files=[{"name": "bestellung.png", "mimeType": "image/png", "buffer": bild}])
        pg.wait_for_selector("#mat-foto-ergebnis", timeout=120000)
        print("     " + pg.inner_text(".mat-foto__punkte").replace("\n", " "))
        # Seit 1.138.0: Punkte mit ✓, Foto daneben, benutzte Zeilen markiert
        pruefe("Punkte mit Haken", pg.locator(".mat-foto__punkt--ja").count() >= 4)
        pruefe("Foto daneben", pg.locator(".mat-foto__bild img").count() == 1)
        pruefe("Zeile Material markiert", "X8CrNiS18-9" in pg.text_content(".mat-foto__text .mat-foto__zeile--material"))
        pruefe("Zeile Gewicht markiert", "1'245,5" in pg.text_content(".mat-foto__text .mat-foto__zeile--kg"))
        pruefe("Material gefüllt", "X8CrNiS18-9 rd 24 mm h9" in pg.inner_text(".mat-gewaehlt"))
        pruefe("kg gefüllt", pg.input_value("#mat-menge") == "1245,5")
        pruefe("Stangen gerechnet", pg.input_value("#mat-stangen") not in ("", "0"))
        pg.locator(".mat-dialog").screenshot(path=os.path.join(HIER, "bestell_foto.png"))
        # Speichern legt den Posten mit genau diesen Angaben an
        pg.click("#mat-mehr summary")
        pg.click("[data-ort], .mat-dialog .mat-knoepfe .knopf >> text=Restelager")
        pg.click(".mat-dialog [data-ja]"); pg.wait_for_timeout(600)
        neu = pg.evaluate("TEST.daten.material_posten[0] || null")
        pruefe("Posten gespeichert", bool(neu) and neu["menge"] == 1245.5 and neu["material"] == "X8CrNiS18-9 rd 24 mm h9")
        # Echte Fotos (nicht im Repository, enthalten Namen): Ordner in
        # BESTELL_FOTOS, Datei „…__erwartet.jpg“ nicht nötig, es wird nur
        # gezeigt, was herauskommt, und geprüft, dass etwas kommt
        ordner = os.environ.get("BESTELL_FOTOS", "")
        for f in sorted(os.listdir(ordner)) if ordner else []:
            pg.click("#mat-neu"); pg.wait_for_selector(".mat-dialog #mat-foto-datei", state="attached")
            t0 = time.time()
            pg.set_input_files("#mat-foto-datei", os.path.join(ordner, f))
            pg.wait_for_selector("#mat-foto-ergebnis", timeout=120000)
            mat = pg.locator(".mat-gewaehlt b").inner_text() if pg.locator(".mat-gewaehlt b").count() else "-"
            print(f"     {f}: {mat} | {pg.input_value('#mat-menge')} kg | {time.time()-t0:.1f}s")
            for z in pg.text_content(".mat-foto__text").split("\n"):
                if " mm" in z.lower() or "kg" in z: print("        | " + z)
            if os.environ.get("BESTELL_BILDER") and f.startswith("7f"):
                pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
                pg.screenshot(path=os.path.join(os.environ["BESTELL_BILDER"], "handy.png"), full_page=True)
                pg.set_viewport_size({"width": 1500, "height": 950}); pg.wait_for_timeout(300)
            if os.environ.get("BESTELL_BILDER"):
                pg.locator("#mat-foto-ergebnis details").evaluate("d => d.open = true")
                pg.locator(".mat-dialog").screenshot(path=os.path.join(os.environ["BESTELL_BILDER"], f + ".png"))
            pruefe("Foto " + f + " gelesen", mat != "-" and pg.input_value("#mat-menge") != "")
            pg.click(".mat-dialog [data-nein]"); pg.wait_for_timeout(300)
    else:
        print("     (ohne TESS_DEU: Texterkennung übersprungen)")
    br.close()

print("Fehler:", "; ".join(fehler) if fehler else "keine")
