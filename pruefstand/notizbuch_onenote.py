# Aus OneNote übernehmen (seit 1.93.0, Wunsch Patrick 19. Oktober 2026):
# eine PDF aus OneNote (Datei → Exportieren → PDF) wird wieder in
# Seiten zerlegt, jede OneNote-Seite eine Seite im Notizbuch.
# Erkannt am Kopf (Titel, Datum, Uhrzeit) oder an den Lesezeichen.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.notizbuecher = []; daten.notizbuch_seiten = [];\nif (typeof window !== \"undefined\") window.TEST = TEST;")
BILD = os.environ.get("NB_BILDER", ".")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

# So sieht ein OneNote-Export aus: jede Seite beginnt auf einer neuen
# PDF-Seite mit Titel, darunter Datum und Uhrzeit; eine lange Seite
# läuft über mehrere PDF-Seiten ohne neuen Kopf
KOPF = "<div style='font-size:20pt'>{t}</div><hr><div style='font-size:9pt;color:#555'>{d}</div>"
ONENOTE = """<html><body style='font-family:Calibri,Arial'>
<section>""" + KOPF.format(t="Rüstanleitung Star", d="Montag, 12. Oktober 2026 &nbsp;&nbsp; 08:15") + """
<p>Spannzange prüfen.</p><div style='height:1500px'></div><p>Weiter auf Seite 2, Termin 13.10.2026 10:00</p></section>
<section style='break-before:page'>""" + KOPF.format(t="Werkzeuge", d="Dienstag, 13. Oktober 2026<br>14:02") + """
<p>Liste der Werkzeuge</p></section>
<section style='break-before:page'><div style='font-size:9pt;color:#555'>Mittwoch, 14. Oktober 2026 &nbsp; 07:30</div>
<p>Seite ohne Titel</p></section></body></html>"""
MIT_ZEICHEN = """<html><body style='font-family:Arial'>
<h1>Abschnitt A</h1><h2>Erste Seite</h2><p>Text</p>
<h2 style='break-before:page'>Zweite Seite</h2><p>Text</p>
<h1 style='break-before:page'>Abschnitt B</h1><h2>Dritte Seite</h2><p>Text</p></body></html>"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    # Die Test-PDFs macht Chromium selbst
    hilf = br.new_page()
    hilf.set_content(ONENOTE); PDF1 = hilf.pdf(format="A4")
    hilf.set_content(MIT_ZEICHEN); PDF2 = hilf.pdf(format="A4", outline=True, tagged=True)
    hilf.close()

    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(1000)
    buecher = lambda: pg.evaluate("() => TEST.daten.notizbuecher.map(b => b.name)")
    seiten = lambda: pg.evaluate("() => TEST.daten.notizbuch_seiten.slice().sort((a, b) => a.reihenfolge - b.reihenfolge)"
                                 ".map(s => ({ buch: s.buch_id, ab: ((TEST.daten.notizbuch_abschnitte || []).find(a => a.id === s.abschnitt_id) || {}).name, titel: s.titel, n: (s.inhalt || []).length, s: (s.inhalt || []).map(e => e.s) }))")

    def waehlen(dateien):
        with pg.expect_file_chooser() as fc:
            pg.locator("[data-nb='onenote']").click()
        fc.value.set_files(dateien)

    pruefe(pg.locator("[data-nb='onenote']").count() == 1, "Knopf „Aus OneNote übernehmen“ neben dem Plus")

    # --- Falsche Datei: Erklärung, wie man exportiert ---
    waehlen([{"name": "Werkstatt.onepkg", "mimeType": "application/octet-stream", "buffer": b"MSCF0000"}])
    pg.wait_for_selector(".dialog [data-w='ok']", timeout=5000)
    txt = pg.locator(".dialog").last.inner_text()
    pruefe("Exportieren" in txt and ".onepkg" in txt, "Hinweis bei .onepkg: " + txt.replace("\n", " ")[:120])
    pg.locator(".dialog [data-w='ok']").click(); pg.wait_for_timeout(400)
    pruefe(buecher() == [], "nichts angelegt")

    # --- OneNote-PDF: kein Buch da → gleich ein neues ---
    waehlen([{"name": "Werkstatt.pdf", "mimeType": "application/pdf", "buffer": PDF1}])
    pg.wait_for_selector("[data-nbholt]", timeout=10000)
    pg.screenshot(path=os.path.join(BILD, "onenote-laeuft.png"))
    pg.wait_for_function("() => !document.querySelector('[data-nbholt]')", timeout=60000)
    # Ohne Lesezeichen: Hinweis, wie die Abschnitte mitkommen (seit 1.108.0)
    pg.wait_for_selector(".dialog [data-w='ok']", timeout=8000)
    txt = pg.locator(".dialog").last.inner_text()
    pruefe("keine Abschnitte" in txt and "einzeln exportieren" in txt, "Hinweis ohne Abschnitte: " + txt.replace("\n", " ")[:100])
    pg.locator(".dialog [data-w='ok']").click(); pg.wait_for_timeout(1000)
    print("  Meldungen:", pg.evaluate("() => [...document.querySelectorAll('.toast')].map(e => e.textContent)"))
    pruefe(buecher() == ["Werkstatt"], "neues Buch „Werkstatt“: %s" % buecher())
    s = seiten()
    print("  Seiten:", s)
    pruefe([x["titel"] for x in s] == ["Rüstanleitung Star", "Werkzeuge", ""], "drei Seiten mit Titeln aus dem Kopf")
    pruefe(s and s[0]["s"] == [1, 2], "lange Seite: beide PDF-Seiten auf einem Blatt")
    pruefe(len(s) == 3 and s[1]["s"] == [3] and s[2]["s"] == [4], "die anderen je eine PDF-Seite")
    pruefe(pg.locator("[data-nbbild]").count() == 2, "erste Seite offen, zwei Ausdrucke darauf")
    pruefe(pg.locator(".nb-seiten .nb-eintrag").count() == 3, "Seitenliste zeigt drei Seiten")
    pg.screenshot(path=os.path.join(BILD, "onenote-fertig.png"))

    # --- Rückgängig nimmt alles weg ---
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.locator("#rueck-knopf").click(); pg.wait_for_timeout(1500)
    pruefe(buecher() == [] and seiten() == [], "Rückgängig: Buch und Seiten weg")
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(1000)

    # --- Wieder holen, dann PDF mit Lesezeichen ins offene Buch ---
    waehlen([{"name": "Werkstatt.pdf", "mimeType": "application/pdf", "buffer": PDF1}])
    pg.wait_for_function("() => TEST.daten.notizbuch_seiten.length === 3 && !document.querySelector('[data-nbholt]')", timeout=60000)
    pg.wait_for_selector(".dialog [data-w='ok']", timeout=8000); pg.locator(".dialog [data-w='ok']").click()
    pg.wait_for_timeout(1200)
    waehlen([{"name": "Abschnitte.pdf", "mimeType": "application/pdf", "buffer": PDF2}])
    pg.wait_for_selector(".dialog [data-w='hier']", timeout=5000)
    pg.screenshot(path=os.path.join(BILD, "onenote-wohin.png"))
    pg.locator(".dialog [data-w='hier']").click()
    pg.wait_for_function("() => !document.querySelector('[data-nbholt]') && TEST.daten.notizbuch_seiten.length > 3", timeout=60000)
    pg.wait_for_timeout(1200)
    s = seiten()
    print("  Seiten:", s)
    pruefe(buecher() == ["Werkstatt"], "kein neues Buch")
    pruefe([(x["ab"], x["titel"]) for x in s[3:]] == [("Abschnitt A", "Erste Seite"), ("Abschnitt A", "Zweite Seite"), ("Abschnitt B", "Dritte Seite")],
           "Lesezeichen: Abschnitte und Seiten")
    pruefe(all(x["ab"] == "Werkstatt" for x in s[:3]), "Seiten ohne Lesezeichen im Abschnitt mit dem Dateinamen")
    pruefe(pg.locator(".nb-eintrag.aktiv [data-nbseite]").inner_text() == "Erste Seite"
           and pg.locator(".nb-eintrag.aktiv [data-nbabschnitt]").inner_text() == "Abschnitt A", "erste übernommene Seite offen, in ihrem Abschnitt")
    pruefe(pg.locator("[data-nbabschnitt]").count() == 3, "drei Abschnitte unter dem Buch")
    pg.screenshot(path=os.path.join(BILD, "onenote-lesezeichen.png"))
    pruefe(pg.locator(".dialog [data-w='ok']").count() == 0, "mit Lesezeichen kein Hinweis")

    # --- Mehrere PDFs (je ein OneNote-Abschnitt): ein Buch, jede PDF ein Abschnitt ---
    waehlen([{"name": "Maschine 201.pdf", "mimeType": "application/pdf", "buffer": PDF1},
             {"name": "Maschine 202.pdf", "mimeType": "application/pdf", "buffer": PDF1}])
    pg.wait_for_selector(".dialog [data-w='eins']", timeout=5000)
    pg.locator(".dialog [data-w='eins']").click(); pg.wait_for_timeout(400)
    pg.locator(".dialog").last.locator("input").first.fill("Hanwha")
    pg.locator(".dialog .knopf--haupt").last.click()
    pg.wait_for_function("() => !document.querySelector('[data-nbholt]') && TEST.daten.notizbuch_seiten.length === 12", timeout=90000)
    pg.wait_for_timeout(1500)
    pruefe(pg.locator(".dialog [data-w='ok']").count() == 0, "mehrere PDFs: kein Hinweis")
    pruefe(buecher() == ["Werkstatt", "Hanwha"], "ein neues Buch „Hanwha“: %s" % buecher())
    neu = pg.evaluate("() => { const b = TEST.daten.notizbuecher.find(x => x.name === 'Hanwha').id;"
                      " const ab = TEST.daten.notizbuch_abschnitte.filter(a => a.buch_id === b).sort((x, y) => x.reihenfolge - y.reihenfolge);"
                      " return ab.map(a => [a.name, TEST.daten.notizbuch_seiten.filter(s => s.abschnitt_id === a.id).sort((x, y) => x.reihenfolge - y.reihenfolge).map(s => s.titel)]); }")
    print("  Hanwha:", neu)
    pruefe([a[0] for a in neu] == ["Maschine 201", "Maschine 202"], "je PDF ein Abschnitt mit dem Dateinamen")
    pruefe(all(a[1] == ["Rüstanleitung Star", "Werkzeuge", ""] for a in neu), "Seiten im richtigen Abschnitt")
    pruefe(pg.locator(".nb-baum [data-nbabschnitt]").count() == 2, "beide Abschnitte im Baum")
    pg.screenshot(path=os.path.join(BILD, "onenote-mehrere.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.locator("#rueck-knopf").click(); pg.wait_for_timeout(1500)
    pruefe(buecher() == ["Werkstatt"], "Rückgängig: Buch mit Abschnitten weg")
    br.close()
print("Fehler:", "keine" if not fehler and not f else (fehler + f))
