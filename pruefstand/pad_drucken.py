# Pad Mode: „Drucken“ im Betrachter druckt direkt aus der App (111.121.1).
# Vorher lief es über einen verborgenen Rahmen mit der PDF, den Safari
# auf dem iPad nie lädt und nicht druckt; der Knopf tat dort nichts.
# Geprüft: Zeichnung (PDF, quer und hoch mit zwei Seiten) und ein Foto,
# auf dem iPad quer und hochkant mit dem Finger, am PC mit der Maus.
import sys, time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)

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
QUER = pdf_bauen(842, 595, 1)
HOCH = pdf_bauen(595, 842, 2)
# Kleines PNG, 4 × 2 Pixel (quer), selbst gebaut
import struct, zlib
def png_bauen(b, h):
    def block(art, daten): return struct.pack(">I", len(daten)) + art + daten + struct.pack(">I", zlib.crc32(art + daten) & 0xffffffff)
    zeilen = b"".join(b"\x00" + b"\x30\x60\xa0" * b for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + block(b"IHDR", struct.pack(">IIBBBBB", b, h, 8, 2, 0, 0, 0))
            + block(b"IDAT", zlib.compress(zeilen)) + block(b"IEND", b""))
PNG = png_bauen(4, 2)

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
bilder = len(sys.argv) > 1
AB = os.environ.get("BILDER_ORDNER", "/tmp")
SPY = "() => { window.__prints = 0; window.print = () => { window.__prints++; }; }"

def route(r):
    u = r.request.url
    if u.endswith(".png"): r.fulfill(status=200, content_type="image/png", body=PNG, headers={"Access-Control-Allow-Origin": "*"})
    else: r.fulfill(status=200, content_type="application/pdf", body=QUER if "quer" in u else HOCH,
                    headers={"Access-Control-Allow-Origin": "*"})

def tippen(pg, sel, mobil):
    b = pg.locator(sel).bounding_box()
    x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    if mobil: pg.touchscreen.tap(x, y)
    else: pg.mouse.click(x, y)

def druckbereich(pg):
    return pg.evaluate("""() => { const d = document.getElementById('druckdatei'); if (!d) return null;
      const st = d.querySelector('style'); return { seiten: d.querySelectorAll('img').length,
        quer: /landscape/.test(st ? st.textContent : ''), klasse: document.body.classList.contains('nur-datei-drucken'),
        geladen: [...d.querySelectorAll('img')].every(i => i.naturalWidth > 0),
        prints: window.__prints, titel: document.title }; }""")

def ins_pad(pg, mobil):
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl")

def zeichnung_drucken(pg, name, mobil, adresse, erwartet_seiten, erwartet_quer):
    pg.evaluate("(a) => { for (const j of TEST.daten.jobs) j.drawing_url = a; }", adresse)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("(a) => { for (const j of TEST.daten.jobs) j.drawing_url = a; }", adresse)
    ins_pad(pg, mobil)
    tippen(pg, "#pad [data-padreiter='zeichnung']", mobil)
    pg.wait_for_selector(".betrachter-huelle")
    if adresse.endswith(".png"): pg.wait_for_selector(".betrachter img"); pg.wait_for_timeout(500)
    else: pg.wait_for_selector(".pdfansicht canvas[data-fertig]", timeout=15000)
    pg.evaluate(SPY)
    tippen(pg, ".betrachter [data-drucken]", mobil)
    pg.wait_for_function("document.getElementById('druckdatei') && window.__prints > 0", timeout=15000)
    pg.wait_for_timeout(200)
    d = druckbereich(pg); print(name, d)
    was = "Foto" if adresse.endswith(".png") else "Zeichnung"
    pruefe(f"{name}: {was} drucken ruft den Druckdialog", d and d["prints"] == 1 and d["klasse"])
    pruefe(f"{name}: {was} mit {erwartet_seiten} Seite(n) im Druckbereich", d and d["seiten"] == erwartet_seiten and d["geladen"])
    pruefe(f"{name}: {was} Papier " + ("quer" if erwartet_quer else "hoch"), d and d["quer"] == erwartet_quer)
    pruefe(f"{name}: {was} Titel im Druck", d and d["titel"].startswith("Zeichnung"))
    if bilder:
        pg.emulate_media(media="print"); pg.wait_for_timeout(200)
        pg.screenshot(path=f"{AB}/pad-druck-{name}-{was}.png", full_page=True)
        pg.emulate_media(media="screen")
    # Beim Drucken ist nur der Druckbereich sichtbar, am Bildschirm nur das Pad
    sicht = pg.evaluate("""() => { const sichtbar = (el) => el && getComputedStyle(el).display !== 'none';
      return { bildschirm: !sichtbar(document.getElementById('druckdatei')) && sichtbar(document.getElementById('pad')) }; }""")
    pg.emulate_media(media="print")
    sicht["druck"] = pg.evaluate("""() => { const sichtbar = (el) => el && getComputedStyle(el).display !== 'none';
      return sichtbar(document.getElementById('druckdatei')) && !sichtbar(document.getElementById('pad'))
        && ![...document.body.children].some(e => e.id !== 'druckdatei' && sichtbar(e)); }""")
    pg.emulate_media(media="screen")
    pruefe(f"{name}: {was} am Bildschirm Pad, im Druck nur die Seiten", sicht["bildschirm"] and sicht["druck"])
    pg.evaluate("window.dispatchEvent(new Event('afterprint'))"); pg.wait_for_timeout(200)
    pruefe(f"{name}: {was} nach dem Drucken aufgeräumt", pg.locator("#druckdatei").count() == 0
           and not pg.evaluate("document.body.classList.contains('nur-datei-drucken')")
           and pg.evaluate("document.title") == "Hofer Tool"
           and pg.locator(".betrachter-huelle").count() == 1 and pg.inner_text(".betrachter [data-drucken]") == "Drucken")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for name, b, h, mobil in [("ipad-quer", 1180, 820, True), ("ipad-hoch", 820, 1180, True), ("pc", 1600, 900, False)]:
        ctx = br.new_context(viewport={"width": b, "height": h}, device_scale_factor=2, is_mobile=mobil, has_touch=mobil)
        pg = ctx.new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
                  "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.route("**://x.invalid/**", route)
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
        zeichnung_drucken(pg, name, mobil, "https://x.invalid/quer.pdf", 1, True)
        zeichnung_drucken(pg, name, mobil, "https://x.invalid/hoch.pdf", 2, False)
        zeichnung_drucken(pg, name, mobil, "https://x.invalid/foto.png", 1, True)
        pruefe(name + ": keine Seitenfehler", not f)
        if f: print(f)
        ctx.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
