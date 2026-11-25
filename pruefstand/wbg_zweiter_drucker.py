# Zweiter WBG-Drucker (1.812.0, Wunsch Patrick 25. November 2026):
# unter Einstellungen → Dokumente ein zweiter Drucker für WBGs, dann
# fragt „Drucken“ bei einer WBG, auf welchem der beiden.
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
    drucker: ['Microsoft Print to PDF', 'SHARP MX-3061'], standard: 'SHARP MX-3061', excel: true,
    faecher: { 'SHARP MX-3061': ['Automatisch', 'Fach 1', 'Fach 2 (WBG)'], 'Microsoft Print to PDF': [] } }) });
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
    pg.locator("button:has-text('Pad Mode'):visible").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl")

def oeffnen(pg, adresse, reiter, mobil=True):
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    if adresse: pg.evaluate("(a) => { for (const j of TEST.daten.jobs) { j.drawing_url = a; j.wbg_url = a; } }", adresse)
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
    # Jeder Aufruf fängt frisch an, ohne Pad und Fenster vom letzten (seit 1.7.0)
    pg.add_init_script("try { sessionStorage.removeItem('hofer.wiederherstellen') } catch (e) {}")
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=fake))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.route("**://x.invalid/**", route)
    return br, pg, f

with sync_playwright() as p:
    # ---------- iPad mit gewähltem Drucker ----------
    # ---------- Einstellungen: zweiten Drucker wählen ----------
    br, pg, f = browser(p, False, MIT)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("#pooldrucker-2", timeout=8000)
    opts = pg.evaluate("[...document.querySelectorAll('#pooldrucker-2 option')].map(o => o.value)")
    print(opts)
    pruefe("Zweiter Drucker: Liste ohne den ersten", opts == ["", "Microsoft Print to PDF"])
    pg.select_option("#pooldrucker-2", "Microsoft Print to PDF")
    pg.click("#pooldrucker-speichern"); pg.wait_for_timeout(500)
    w = pg.evaluate("JSON.parse(TEST.daten.app_config.filter(x => x.schluessel === 'druck').pop().wert)")
    pruefe("Zweiter Drucker gespeichert, erster bleibt", w.get("drucker2") == "Microsoft Print to PDF" and w.get("drucker") == "SHARP MX-3061")
    pruefe("PC: keine Seitenfehler", not f)
    if f: print(f)
    br.close()

    # ---------- iPad: WBG mit zwei Druckern ----------
    br, pg, f = browser(p, True, MIT.replace("drucker: 'SHARP MX-3061' })", "drucker: 'SHARP MX-3061', drucker2: '\\\\\\\\srv\\\\WBG 2' })"))
    oeffnen(pg, "https://x.invalid/hoch.pdf", "wbg")
    tippen(pg, ".betrachter [data-drucken]", True); pg.wait_for_timeout(300)
    k = pg.evaluate("[...document.querySelectorAll('[data-pooldrucker]')].map(b => [b.dataset.pooldrucker, b.textContent])")
    print(k)
    pruefe("Zwei Knöpfe, einer je Drucker", len(k) == 2 and k[0][0] == "SHARP MX-3061" and k[0][1] == "Planbüro WBG" and k[1][1] == "Spedition WBG")
    if bilder: pg.screenshot(path=f"{AB}/wbg-zwei-drucker.png")
    tippen(pg, "[data-pooldrucker='\\\\\\\\srv\\\\WBG 2']", True)
    pg.wait_for_function("TEST.daten.druckauftraege && TEST.daten.druckauftraege.length === 1", timeout=15000)
    a = pg.evaluate("TEST.daten.druckauftraege[0]")
    pruefe("Auftrag geht an den zweiten Drucker", a["drucker"] == "\\\\srv\\WBG 2" and not a.get("a4"))
    pg.wait_for_timeout(3800)
    tippen(pg, ".betrachter [data-drucken]", True); pg.wait_for_timeout(300)
    tippen(pg, "[data-pooldruck]", True)
    pg.wait_for_function("TEST.daten.druckauftraege.length === 2", timeout=15000)
    pruefe("Erster Knopf: erster Drucker", pg.evaluate("TEST.daten.druckauftraege[1].drucker") == "SHARP MX-3061")
    # Zeichnung bleibt beim A4-Drucker, ein Knopf
    oeffnen(pg, "https://x.invalid/hoch.pdf", "zeichnung")
    tippen(pg, ".betrachter [data-drucken]", True); pg.wait_for_timeout(300)
    pruefe("Zeichnung: nur Im Büro drucken", pg.locator("[data-pooldrucker]").count() == 0
           and pg.inner_text("[data-pooldruck]").strip() == "Im Büro drucken")
    pruefe("iPad: keine Seitenfehler", not f)
    if f: print(f)
    br.close()

print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
