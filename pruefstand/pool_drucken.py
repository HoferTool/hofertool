# Drucken über den Pool-Rechner (111.126.0, Wunsch Patrick 9. Oktober 2026):
# iPad und Handy am WLAN Hofer&Co erreichen den Sharp im Firmennetz nicht.
# Ist unter Einstellungen → Dokumente ein Drucker gewählt, fragt „Drucken“
# im Betrachter, wohin. „An … drucken“ legt die PDF-Seiten als JPG in die
# Ablage „druck“ und einen Auftrag in druckauftraege; Excel nur mit der
# Adresse. Die Meldung folgt dem Auftrag bis „fertig“ oder Fehler.
# Ohne gewählten Drucker druckt „Drucken“ wie bisher sofort.
import sys, time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
# Kleine PDF und PNG, selbst gebaut (wie pad_drucken.py)
def pdf_bauen(b, h, seiten):
    obj = []
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(seiten))
    obj.append("<< /Type /Catalog /Pages 2 0 R >>")
    obj.append(f"<< /Type /Pages /Kids [{kids}] /Count {seiten} >>")
    for i in range(seiten):
        inhalt = f"4 w 0 0 1 RG 10 10 {b - 20} {h - 20} re S 1 0 0 RG 10 10 m {b - 10} {h - 10} l S"
        obj.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {b} {h}] /Contents {4 + 2 * i} 0 R >>")
        obj.append(f"<< /Length {len(inhalt)} >>\nstream\n{inhalt}\nendstream")
    aus = "%PDF-1.4\n"; pos = []
    for n, o in enumerate(obj, 1):
        pos.append(len(aus)); aus += f"{n} 0 obj\n{o}\nendobj\n"
    xref = len(aus)
    aus += f"xref\n0 {len(obj) + 1}\n0000000000 65535 f \n" + "".join(f"{p:010d} 00000 n \n" for p in pos)
    aus += f"trailer\n<< /Size {len(obj) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    return aus.encode("latin-1")
import struct, zlib
def png_bauen(b, h):
    def block(art, daten): return struct.pack(">I", len(daten)) + art + daten + struct.pack(">I", zlib.crc32(art + daten) & 0xffffffff)
    zeilen = b"".join(b"\x00" + b"\x30\x60\xa0" * b for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + block(b"IHDR", struct.pack(">IIBBBBB", b, h, 8, 2, 0, 0, 0))
            + block(b"IDAT", zlib.compress(zeilen)) + block(b"IEND", b""))

QUER = pdf_bauen(842, 595, 1)
HOCH = pdf_bauen(595, 842, 2)
PNG = png_bauen(4, 2)
XLSX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "einrichtblatt-beispiel.xlsx"), "rb").read()

K = """daten.app_config.push(
  { schluessel: 'druck', wert: JSON.stringify({ drucker: 'SHARP MX-3061' }) },
  { schluessel: 'druck_status', wert: JSON.stringify({ gesehen: new Date().toISOString(), rechner: 'PCWIN-10PLANBÜR',
    drucker: ['Microsoft Print to PDF', 'SHARP MX-3061'], standard: 'SHARP MX-3061', excel: true }) });
"""
MARKE = "if (typeof window !== \"undefined\") window.TEST = TEST;"
MIT = FAKE.replace("blatt_url: null", "blatt_url: 'https://x.invalid/eb.xlsx'").replace(MARKE, K + "\n" + MARKE)
OHNE = FAKE.replace("blatt_url: null", "blatt_url: 'https://x.invalid/eb.xlsx'")
SPY = "() => { window.__prints = 0; window.print = () => { window.__prints++; }; }"

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
bilder = len(sys.argv) > 1
AB = os.environ.get("BILDER_ORDNER", "/tmp")

def route(r):
    u = r.request.url
    if u.endswith(".xlsx"): r.fulfill(status=200, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body=XLSX, headers={"Access-Control-Allow-Origin": "*"})
    elif u.endswith(".png"): r.fulfill(status=200, content_type="image/png", body=PNG, headers={"Access-Control-Allow-Origin": "*"})
    else: r.fulfill(status=200, content_type="application/pdf", body=QUER if "quer" in u else HOCH, headers={"Access-Control-Allow-Origin": "*"})

def tippen(pg, sel, mobil):
    b = pg.locator(sel).bounding_box()
    x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    if mobil: pg.touchscreen.tap(x, y)
    else: pg.mouse.click(x, y)

def ins_pad(pg):
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl")

def oeffnen(pg, adresse, reiter, mobil=True):
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    if adresse: pg.evaluate("(a) => { for (const j of TEST.daten.jobs) j.drawing_url = a; }", adresse)
    ins_pad(pg)
    tippen(pg, f"#pad [data-padreiter='{reiter}']", mobil)
    pg.wait_for_selector(".betrachter-huelle")
    if reiter == "blatt": pg.wait_for_selector("[data-excelblatt]", timeout=20000)
    elif adresse.endswith(".png"): pg.wait_for_selector(".betrachter img")
    else: pg.wait_for_selector(".pdfansicht canvas[data-fertig]", timeout=15000)
    pg.wait_for_timeout(600)
    pg.evaluate(SPY)
    pg.evaluate("TEST.protokoll.length = 0; TEST.daten.druckauftraege = []")

def meldungen(pg):
    return pg.evaluate("[...document.querySelectorAll('.toast')].map(t => t.textContent)")

def browser(p, mobil, fake):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1180, "height": 820} if mobil else {"width": 1600, "height": 900},
                         device_scale_factor=2, is_mobile=mobil, has_touch=mobil)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=fake))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.route("**://x.invalid/**", route)
    return br, pg, f

with sync_playwright() as p:
    # ---------- iPad mit gewähltem Drucker ----------
    br, pg, f = browser(p, True, MIT)

    # PDF mit zwei Seiten, zwei Kopien
    oeffnen(pg, "https://x.invalid/hoch.pdf", "zeichnung")
    tippen(pg, ".betrachter [data-drucken]", True); pg.wait_for_timeout(300)
    pruefe("Drucken öffnet die Auswahl", pg.locator("[data-druckwahl]").count() == 1)
    pruefe("Auswahl nennt den Drucker", "SHARP MX-3061" in pg.inner_text("[data-pooldruck]"))
    pruefe("noch nichts gedruckt", pg.evaluate("window.__prints") == 0 and pg.locator("#druckdatei").count() == 0)
    if bilder: pg.screenshot(path=f"{AB}/pool-druck-auswahl.png")
    tippen(pg, "[data-kopienmehr]", True); pg.wait_for_timeout(100)
    pruefe("Kopien auf 2", pg.inner_text("[data-kopien]") == "2")
    tippen(pg, "[data-pooldruck]", True)
    pg.wait_for_function("TEST.daten.druckauftraege && TEST.daten.druckauftraege.length === 1", timeout=15000)
    a = pg.evaluate("TEST.daten.druckauftraege[0]")
    ups = pg.evaluate("TEST.protokoll.filter(x => x.art === 'upload')")
    print(a, ups)
    pruefe("zwei JPG-Seiten in die Ablage druck", len(ups) == 2 and all(u["ablage"] == "druck" and u["typ"] == "image/jpeg"
           and u["pfad"].startswith(a["id"] + "/") and u["groesse"] > 1000 for u in ups)
           and sorted(u["pfad"].split("/")[1] for u in ups) == ["1.jpg", "2.jpg"])
    pruefe("Auftrag: bilder, 2 Seiten, 2 Kopien, Drucker, Titel, wer", a["art"] == "bilder" and a["seiten"] == 2
           and a["kopien"] == 2 and a["drucker"] == "SHARP MX-3061" and a["titel"].startswith("Zeichnung") and a["wer"])
    pruefe("Auswahl zu, Knopf wieder normal", pg.locator("[data-druckwahl]").count() == 0
           and pg.inner_text(".betrachter [data-drucken]") == "Drucken")
    pruefe("Meldung: geht an den Drucker", any("Geht an SHARP" in m for m in meldungen(pg)))
    # Der Pool-Rechner druckt
    pg.evaluate("TEST.daten.druckauftraege[0].zustand = 'fertig'")
    pg.wait_for_function("[...document.querySelectorAll('.toast')].some(t => t.textContent.includes('Gedruckt auf SHARP'))", timeout=8000)
    pruefe("Meldung: gedruckt", True)
    pruefe("kein window.print", pg.evaluate("window.__prints") == 0)

    # Fehler vom Pool-Rechner kommt als Meldung
    pg.wait_for_timeout(3800)
    tippen(pg, ".betrachter [data-drucken]", True); pg.wait_for_timeout(200)
    tippen(pg, "[data-pooldruck]", True)
    pg.wait_for_function("TEST.daten.druckauftraege.length === 2", timeout=15000)
    pg.evaluate("TEST.daten.druckauftraege[1].zustand = 'fehler'; TEST.daten.druckauftraege[1].meldung = 'Papier leer'")
    pg.wait_for_function("[...document.querySelectorAll('.toast')].some(t => t.textContent.includes('Papier leer'))", timeout=8000)
    pruefe("Fehler vom Pool-Rechner als Meldung", True)
    pruefe("Kopien bleiben im Fenster gemerkt", pg.evaluate("TEST.daten.druckauftraege[1].kopien") == 2)

    # Auf diesem Gerät drucken: wie bisher
    tippen(pg, ".betrachter [data-drucken]", True); pg.wait_for_timeout(200)
    tippen(pg, "[data-geraetdruck]", True)
    pg.wait_for_function("document.getElementById('druckdatei') && window.__prints > 0", timeout=15000)
    pruefe("Auf diesem Gerät: Druckdialog mit 2 Seiten", pg.evaluate("document.querySelectorAll('#druckdatei img').length") == 2)
    pg.evaluate("window.dispatchEvent(new Event('afterprint'))"); pg.wait_for_timeout(200)

    # Tipp daneben schliesst die Auswahl
    tippen(pg, ".betrachter [data-drucken]", True); pg.wait_for_timeout(200)
    tippen(pg, ".betrachter__buehne", True); pg.wait_for_timeout(200)
    pruefe("Tipp daneben schliesst die Auswahl", pg.locator("[data-druckwahl]").count() == 0)

    # Foto
    oeffnen(pg, "https://x.invalid/foto.png", "zeichnung")
    tippen(pg, ".betrachter [data-drucken]", True); pg.wait_for_timeout(200)
    tippen(pg, "[data-pooldruck]", True)
    pg.wait_for_function("TEST.daten.druckauftraege.length === 1", timeout=15000)
    ups = pg.evaluate("TEST.protokoll.filter(x => x.art === 'upload')")
    pruefe("Foto: eine JPG-Seite", len(ups) == 1 and ups[0]["typ"] == "image/jpeg"
           and pg.evaluate("TEST.daten.druckauftraege[0].seiten") == 1)

    # Excel-Einrichtblatt: nur die Adresse
    oeffnen(pg, "", "blatt")
    tippen(pg, ".betrachter [data-drucken]", True); pg.wait_for_timeout(200)
    pruefe("Excel: Auswahl da", pg.locator("[data-pooldruck]").count() == 1)
    tippen(pg, "[data-pooldruck]", True)
    pg.wait_for_function("TEST.daten.druckauftraege.length === 1", timeout=15000)
    a = pg.evaluate("TEST.daten.druckauftraege[0]")
    pruefe("Excel: Auftrag mit Adresse, ohne Seiten", a["art"] == "excel" and a["quelle"] == "https://x.invalid/eb.xlsx"
           and a["seiten"] == 0 and not pg.evaluate("TEST.protokoll.some(x => x.art === 'upload')"))
    pruefe("iPad: keine Seitenfehler", not f)
    if f: print(f)

    br.close()

    # ---------- Einstellungen → Dokumente: Drucker wählen ----------

    br, pg, f = browser(p, False, MIT)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("#pooldrucker", timeout=8000)
    opts = pg.evaluate("[...document.querySelectorAll('#pooldrucker option')].map(o => o.textContent)")
    print(opts)
    pruefe("Einstellungen: Drucker vom Pool-Rechner in der Liste", "SHARP MX-3061 (Standard)" in opts and "Microsoft Print to PDF" in opts)
    pruefe("Einstellungen: gewählter Drucker steht da", pg.evaluate("document.querySelector('#pooldrucker').value") == "SHARP MX-3061")
    pruefe("Einstellungen: Pool-Rechner bereit", "Bereit" in pg.inner_text("#pooldrucker-stand") and "Excel ist da" in pg.inner_text("#pooldrucker-stand"))
    if bilder:
        pg.locator("#pool-drucker").scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        pg.locator("#pool-drucker").screenshot(path=f"{AB}/pool-druck-einstellungen.png")
    pg.select_option("#pooldrucker", "Microsoft Print to PDF")
    pg.click("#pooldrucker-speichern"); pg.wait_for_timeout(500)
    w = pg.evaluate("JSON.parse(TEST.daten.app_config.filter(x => x.schluessel === 'druck').pop().wert)")
    pruefe("Einstellungen: Drucker gespeichert", w.get("drucker") == "Microsoft Print to PDF")
    pruefe("PC: keine Seitenfehler", not f)
    if f: print(f)
    br.close()

    # ---------- Ohne gewählten Drucker: Drucken wie bisher ----------
    br, pg, f = browser(p, False, OHNE)
    oeffnen(pg, "https://x.invalid/quer.pdf", "zeichnung", False)
    pg.click(".betrachter [data-drucken]")
    pg.wait_for_function("document.getElementById('druckdatei') && window.__prints > 0", timeout=15000)
    pruefe("Ohne Drucker: keine Auswahl, gleich der Druckdialog", pg.locator("[data-druckwahl]").count() == 0)
    pg.evaluate("window.dispatchEvent(new Event('afterprint'))")
    br.close()
    br, pg, f2 = browser(p, False, OHNE)
    f += f2
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("#pool-drucker", timeout=8000)
    pruefe("Ohne Meldung: Hinweis, dass der Pool-Rechner sich noch nicht gemeldet hat",
           "noch nicht gemeldet" in pg.inner_text("#pooldrucker-stand"))
    pruefe("ohne Drucker: keine Seitenfehler", not f)
    if f: print(f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
