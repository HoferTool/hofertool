# Waschprogramm aus der WBG (1.25.0): Die Zeile „Waschprog-Nr.“ der WBG
# steht im Auftragsfenster unter dem WBG-Knopf und im Pad bei der
# HOCO Nr. Die WBG ist hier eine kleine PDF mit echtem Text.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FALSCH ") + was)
    if not ok: fehler.append(was)

def pdf_mit_text(zeilen):
    inhalt = "BT /F1 11 Tf\n" + "".join(
        f"1 0 0 1 {x} {y} Tm ({t}) Tj\n" for x, y, t in zeilen) + "ET"
    obj = ["<< /Type /Catalog /Pages 2 0 R >>",
           "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
           "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
           f"<< /Length {len(inhalt)} >>\nstream\n{inhalt}\nendstream",
           "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    aus = "%PDF-1.4\n"; stellen = []
    for i, o in enumerate(obj, 1):
        stellen.append(len(aus)); aus += f"{i} 0 obj\n{o}\nendobj\n"
    x = len(aus)
    aus += f"xref\n0 {len(obj)+1}\n0000000000 65535 f \n" + "".join(f"{s:010d} 00000 n \n" for s in stellen)
    aus += f"trailer\n<< /Size {len(obj)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF"
    return aus.encode("latin-1")

WBG = pdf_mit_text([(40, 800, "WBG 2026008520"), (40, 700, "Z-Nr.:"), (180, 700, "T04.514.13"),
                    (40, 660, "Waschprog-Nr.:"), (180, 660, "11/3"), (40, 630, "Verpackungsart:"), (180, 630, "Geb. HoCo")])

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    pg.route("https://wbg.test/**", lambda r: r.fulfill(status=200, content_type="application/pdf", body=WBG,
             headers={"Access-Control-Allow-Origin": "*"}))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.evaluate("""() => { ['jobs', 'planwand'].forEach(t => (TEST.daten[t] || []).forEach(j => j.wbg_url = 'https://wbg.test/wbg.pdf')); }""")

    # Auftragsfenster
    pg.locator(".pw-balken").first.dblclick(); pg.wait_for_selector(".dialog--auftrag"); pg.wait_for_timeout(2500)
    t = pg.evaluate("(document.getElementById('pl-waschprog') || {}).textContent || ''")
    print("     Fenster:", t)
    pruefe("Auftragsfenster zeigt Waschprog-Nr. 11/3", "11/3" in t)
    pg.screenshot(path="/tmp/waschprog-fenster.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    # Pad Mode
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    for el in pg.query_selector_all("#pad [data-park]"):
        if "Lang" in (el.inner_text() or ""): el.click(); break
    pg.wait_for_timeout(1200)
    i = pg.evaluate("""() => [...document.querySelectorAll('#pad .pad-kachel--maschine')]
      .findIndex(k => !k.innerText.includes('kein Auftrag'))""")
    pg.locator("#pad .pad-kachel--maschine").nth(max(0, i)).click(); pg.wait_for_timeout(2500)
    hoco = pg.evaluate("(document.querySelector('.pad-karte2--hoco') || {}).innerText || ''")
    print("     Pad:", hoco[:120].replace("\n", " | "))
    pruefe("Pad zeigt Waschprog. 11/3", "Waschprog." in hoco and "11/3" in hoco)
    pg.screenshot(path="/tmp/waschprog-pad.png")
    gemerkt = pg.evaluate("localStorage.getItem('hofer.waschprog') || ''")
    pruefe("auf dem Gerät gemerkt", "11/3" in gemerkt)
    br.close()
print("Fehler:", "keine" if not (fehler or f) else (fehler + f)[:12])
