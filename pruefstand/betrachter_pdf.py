# Betrachter: PDF wird selbst gezeichnet und füllt die Fläche, auf dem
# iPad quer und hoch, am PC und am Handy. Zoom mit Knöpfen.
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)

def pdf_bauen(b, h, seiten):
    # Kleinstes gültiges PDF: je Seite ein Rahmen und ein Kreuz
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

QUER = pdf_bauen(842, 595, 1)     # A4 quer wie das Einrichtblatt
HOCH = pdf_bauen(595, 842, 2)     # A4 hoch, zwei Seiten

K = """daten.dokumente = [
 { id: 'd1', art: 'zeichnung', hoco_nr: '10844-0049', type_id: null, titel: 'Quer', dateiname: 'quer.pdf', datei_url: 'https://x.invalid/quer.pdf', erstellt_am: '2026-09-30T08:00:00Z' },
 { id: 'd2', art: 'zeichnung', hoco_nr: '10844-0049', type_id: null, titel: 'Hoch', dateiname: 'hoch.pdf', datei_url: 'https://x.invalid/hoch.pdf', erstellt_am: '2026-09-29T08:00:00Z' }];"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
bilder = len(sys.argv) > 1

def pdf_route(r):
    body = QUER if "quer" in r.request.url else HOCH
    r.fulfill(status=200, content_type="application/pdf", body=body, headers={"Access-Control-Allow-Origin": "*"})

def oeffnen(pg, nr):
    pg.locator("[data-dokauf]").nth(nr).click(); pg.wait_for_selector(".betrachter-huelle")
    pg.wait_for_selector(".pdfansicht canvas[data-fertig]", timeout=15000); pg.wait_for_timeout(300)

def tippen(pg, sel):
    # Mit der Maus auf die Stelle, wie ein Finger
    b = pg.locator(sel).bounding_box()
    pg.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)

def masse(pg):
    return pg.evaluate("""() => { const c = document.querySelector('.pdfansicht canvas').getBoundingClientRect();
      const b = document.querySelector('.pdfansicht__buehne'); return { cb: c.width, ch: c.height, bb: b.clientWidth, bh: b.clientHeight }; }""")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for name, b, h in [("ipad-quer", 1180, 820), ("ipad-hoch", 820, 1180), ("pc", 1600, 900), ("handy", 390, 844)]:
        pg = br.new_context(viewport={"width": b, "height": h}, device_scale_factor=2).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
                  "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.route("**://x.invalid/**", pdf_route)
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
        pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
        pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("[data-dokauf]")

        oeffnen(pg, 0)
        m = masse(pg); print(name, "quer:", m)
        # Ganze Seite sichtbar und an einer Seite randvoll
        voll = (abs(m["cb"] - m["bb"]) < 2 or abs(m["ch"] - m["bh"]) < 2) and m["cb"] <= m["bb"] + 1 and m["ch"] <= m["bh"] + 1
        pruefe(name + ": Querblatt füllt die Fläche", voll)
        pruefe(name + ": kein Browser-Rückfall", pg.locator(".betrachter iframe").count() == 0)
        if bilder: pg.screenshot(path=f"/tmp/claude-0/-home-claude-hofertool/9059d9f6-aa92-5b6a-afb1-9bedb39c8cc3/scratchpad/{name}-quer.png")
        # Zoom
        tippen(pg, "[data-groesser]"); pg.wait_for_timeout(600)
        z = masse(pg)
        pruefe(name + ": Vergrössern", z["cb"] > m["cb"] * 1.3 and pg.inner_text("[data-einpassen]") == "140%")
        sb = pg.evaluate("(() => { const b = document.querySelector('.pdfansicht__buehne'); return b.scrollWidth > b.clientWidth || b.scrollHeight > b.clientHeight; })()")
        pruefe(name + ": vergrössert verschiebbar", sb)
        tippen(pg, "[data-einpassen]"); pg.wait_for_timeout(600)
        pruefe(name + ": Einpassen zurück", abs(masse(pg)["cb"] - m["cb"]) < 2)
        pg.click(".betrachter [data-zu]"); pg.wait_for_timeout(300)

        oeffnen(pg, 1)
        m = masse(pg); print(name, "hoch:", m)
        pruefe(name + ": Hochblatt ganz sichtbar", m["cb"] <= m["bb"] + 1 and m["ch"] <= m["bh"] + 1
               and (abs(m["cb"] - m["bb"]) < 2 or abs(m["ch"] - m["bh"]) < 2))
        pruefe(name + ": zwei Seiten", pg.locator(".pdfansicht canvas").count() == 2)
        if bilder: pg.screenshot(path=f"/tmp/claude-0/-home-claude-hofertool/9059d9f6-aa92-5b6a-afb1-9bedb39c8cc3/scratchpad/{name}-hoch.png")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
        pruefe(name + ": Escape schliesst", pg.locator(".betrachter-huelle").count() == 0)
        fehler += f
        pg.context.close()
    br.close()
print("Fehler:", fehler[:3] if fehler else "keine")
