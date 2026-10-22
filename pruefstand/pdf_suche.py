# Suche im PDF-Betrachter (seit 1.139.0): Lupe öffnet ein Suchfeld,
# Treffer werden markiert, Weiter/Zurück springt zur Stelle.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)

def pdf_mit_text(seiten, texte):
    # texte: {seitennr: "Text"}; sonst steht "Seite n" drauf
    obj = ["<< /Type /Catalog /Pages 2 0 R >>", None,
           "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for i in range(seiten):
        t = texte.get(i + 1, f"Seite {i + 1}")
        if t.startswith("*"):
            # Jeder Buchstabe einzeln gesetzt, wie in vielen echten Handbüchern
            inhalt = "BT /F1 24 Tf 72 700 Td " + " ".join(f"({ch}) Tj 14 0 Td" for ch in t[1:]) + " ET"
        else:
            inhalt = f"BT /F1 24 Tf 72 700 Td ({t}) Tj ET"
        obj.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {len(obj) + 2} 0 R >>")
        kids.append(f"{len(obj)} 0 R")
        obj.append(f"<< /Length {len(inhalt)} >>\nstream\n{inhalt}\nendstream")
    obj[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {seiten} >>"
    aus = "%PDF-1.4\n"; pos = []
    for n, o in enumerate(obj, 1):
        pos.append(len(aus)); aus += f"{n} 0 obj\n{o}\nendobj\n"
    xref = len(aus)
    aus += f"xref\n0 {len(obj) + 1}\n0000000000 65535 f \n" + "".join(f"{p:010d} 00000 n \n" for p in pos)
    aus += f"trailer\n<< /Size {len(obj) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    return aus.encode("latin-1")

PDF = pdf_mit_text(60, {12: "Spindel schmieren", 47: "Reitstock und SPINDEL pruefen", 55: "*Kuehlmittelpumpe"})
K = """daten.dokumente = [
 { id: 'd1', art: 'zeichnung', hoco_nr: '10844-0049', type_id: null, titel: 'Handbuch', dateiname: 'h.pdf', datei_url: 'https://x.invalid/h.pdf', erstellt_am: '2026-09-30T08:00:00Z' }];"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

SICHTBAR = """nr => { const s = document.querySelector('[data-pdfseite="' + nr + '"]').getBoundingClientRect();
  const b = document.querySelector('.pdfansicht__buehne').getBoundingClientRect();
  return s.top < b.bottom && s.bottom > b.top; }"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1180, "height": 820}, device_scale_factor=2).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200])); pg.on("console", lambda m: print("KONSOLE", m.text[:300]) if "pdfsuche" in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.route("**://x.invalid/**", lambda r: r.fulfill(status=200, content_type="application/pdf", body=PDF,
                                                      headers={"Access-Control-Allow-Origin": "*"}))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("[data-dokauf]")
    pg.locator("[data-dokauf]").first.click(); pg.wait_for_selector(".betrachter-huelle")
    pg.wait_for_selector(".pdfansicht canvas[data-fertig]", timeout=20000)

    pg.locator("[data-pdfsuche]").click()
    pruefe("Suchfeld offen und im Fokus", pg.evaluate("() => document.activeElement && document.activeElement.matches('[data-pdfsuchfeld]')"))
    pg.locator("[data-pdfsuchfeld]").fill("spindel")
    pg.wait_for_function("() => /^1 \\/ 2$/.test(document.querySelector('[data-pdfsuchstand]').textContent.trim())", timeout=15000)
    pruefe("zwei Treffer, gross/klein egal", True)
    pg.wait_for_timeout(600)
    pruefe("springt zu Seite 12", pg.evaluate(f"({SICHTBAR})(12)"))
    pruefe("Treffer auf Seite 12 markiert", pg.locator("[data-pdfseite='12'] .pdf-treffer--aktiv").count() == 1)
    pg.locator("[data-pdfsuchfeld]").press("Enter"); pg.wait_for_timeout(600)
    pruefe("Enter: zweiter Treffer", pg.locator("[data-pdfsuchstand]").inner_text().startswith("2 / 2"))
    pruefe("springt zu Seite 47", pg.evaluate(f"({SICHTBAR})(47)"))
    pruefe("Seite 47 gezeichnet", pg.locator("[data-pdfseite='47'] canvas[data-fertig]").count() == 1 or
           (pg.wait_for_selector("[data-pdfseite='47'] canvas[data-fertig]", timeout=5000) is not None))
    pg.locator("[data-pdfzurueck]").click(); pg.wait_for_timeout(600)
    pruefe("Zurück: wieder Seite 12", pg.evaluate(f"({SICHTBAR})(12)"))
    # Buchstabe für Buchstabe gesetzter Text wird auch gefunden
    pg.locator("[data-pdfsuchfeld]").fill("kuehlmittel")
    pg.wait_for_function("() => /^1 \\/ 1$/.test(document.querySelector('[data-pdfsuchstand]').textContent.trim())", timeout=15000)
    pg.wait_for_timeout(600)
    pruefe("einzelne Buchstaben gefunden (Seite 55)", pg.evaluate(f"({SICHTBAR})(55)"))
    pruefe("Markierung über mehrere Buchstaben", pg.locator("[data-pdfseite='55'] .pdf-treffer--aktiv").count() >= 2)
    pg.locator("[data-pdfsuchfeld]").fill("gibtsnicht")
    pg.wait_for_function("() => document.querySelector('[data-pdfsuchstand]').textContent.includes('Nichts gefunden')", timeout=15000)
    pruefe("Nichts gefunden", True)
    pruefe("keine Markierung mehr", pg.locator(".pdf-treffer").count() == 0)
    # Escape schliesst nur die Suche, nicht den Betrachter
    pg.locator("[data-pdfsuchfeld]").press("Escape"); pg.wait_for_timeout(300)
    pruefe("Escape schliesst die Suche", pg.locator("[data-pdfsuchleiste]").count() == 0)
    pruefe("Betrachter bleibt offen", pg.locator(".betrachter-huelle").count() == 1)
    pruefe("keine Skriptfehler", not f)
    if f: print(f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
