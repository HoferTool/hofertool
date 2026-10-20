# Notizbuch (seit 1.65.0, Wunsch Patrick 15. Oktober 2026): Vollbild blendet
# Bücher und Seiten aus, Zoom mit Knöpfen, Strg + Mausrad und zwei Fingern,
# und alte PDF-Ausdrucke ohne Verweise holen sie aus dem PDF nach.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from notizbuch_pdflinks_pdf import pdf_mit_link
from playwright.sync_api import sync_playwright

PDF = pdf_mit_link()
server_starten(); time.sleep(0.4)
ALT = ",".join("{ t: 'bild', u: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', q: location.origin + '/alt-test.pdf', s: %d, n: 'alt.pdf', x: 0.04, y: %s, b: 0.92, v: 1.4, p: [] }" % (i + 1, round(0.04 + i * 1.33, 2)) for i in range(3))
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.notizbuecher = [{ id: 'nbA', name: 'Werkstatt', farbe: '#2e7d32', reihenfolge: 1, parks: [], erstellt_am: '2026-10-07T08:00:00Z' }];"
  " daten.notizbuch_seiten = [{ id: 'sA', buch_id: 'nbA', titel: 'Handbuch', reihenfolge: 1, inhalt: [" + ALT + "] }];\n"
  "if (typeof window !== \"undefined\") window.TEST = TEST;")
BILD = os.environ.get("NB_BILDER", ".")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.route("**/alt-test.pdf", lambda r: r.fulfill(status=200, content_type="application/pdf", body=PDF))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(1000)

    # --- Alter Ausdruck: Verweise nachholen ---
    pg.wait_for_selector("[data-nblink='3']", timeout=10000)
    pg.wait_for_timeout(1200)
    gesp = pg.evaluate("() => TEST.daten.notizbuch_seiten[0].inhalt.map(x => x.l)")
    pruefe(gesp[0] and gesp[0][0]["z"] == 3 and gesp[1] == [] and gesp[2] == [], "Verweise nachgeholt und gespeichert: %s" % gesp)
    pg.locator("[data-nblink='3']").click(); pg.wait_for_timeout(1200)
    pruefe(pg.locator(".nb-rolle").evaluate("e => e.scrollTop") > 1000, "alter Ausdruck springt zu Seite 3")

    # --- Vollbild ---
    b0 = pg.locator("[data-nbblatt]").evaluate("e => e.offsetWidth")
    pg.locator("[data-nbvollbild]").click(); pg.wait_for_timeout(500)
    pruefe(not pg.locator(".nb-buecher").is_visible() and not pg.locator(".nb-seiten").is_visible(), "Vollbild: Bücher und Seiten weg")
    haupt = pg.locator(".nb-haupt").evaluate("e => e.offsetWidth")
    pruefe(haupt > 1200, "Seite nutzt die ganze Breite (%d)" % haupt)
    pg.screenshot(path=os.path.join(BILD, "nb-vollbild.png"))
    pg.locator("[data-nbvollbild]").click(); pg.wait_for_timeout(500)
    pruefe(pg.locator(".nb-buecher").is_visible() and pg.locator(".nb-seiten").is_visible(), "Vollbild verlassen: wieder da")

    # --- Zoom mit Knöpfen ---
    b0 = pg.locator("[data-nbblatt]").evaluate("e => e.offsetWidth")
    pg.locator("[data-nbzoom] button[aria-label='Vergrössern']").click(); pg.wait_for_timeout(400)
    b1 = pg.locator("[data-nbblatt]").evaluate("e => e.offsetWidth")
    pruefe(abs(b1 / b0 - 1.25) < 0.01, "Plus vergrössert (%d → %d)" % (b0, b1))
    pruefe(pg.locator("[data-nbzoomwert]").inner_text().strip() == "125 %", "Anzeige 125 %")
    pg.locator("[data-nbzoomwert]").click(); pg.wait_for_timeout(400)
    pruefe(pg.locator("[data-nbblatt]").evaluate("e => e.offsetWidth") == b0, "Klick auf % zurück auf ganze Breite")

    # --- Strg + Mausrad ---
    box = pg.locator(".nb-rolle").bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + 300)
    pg.keyboard.down("Control"); pg.mouse.wheel(0, -100); pg.keyboard.up("Control"); pg.wait_for_timeout(400)
    b2 = pg.locator("[data-nbblatt]").evaluate("e => e.offsetWidth")
    pruefe(b2 > b0 * 1.5, "Strg + Mausrad zoomt (%d → %d)" % (b0, b2))
    pg.locator("[data-nbzoomwert]").click(); pg.wait_for_timeout(400)

    # --- Zwei Finger auseinander ---
    pg.evaluate("""() => {
      const r = document.querySelector('.nb-rolle'), z = document.querySelector('[data-nbblatt]');
      const t = (id, x, y) => new Touch({ identifier: id, target: z, clientX: x, clientY: y });
      const feuer = (art, a, b) => r.dispatchEvent(new TouchEvent(art, { touches: [a, b], targetTouches: [a, b], changedTouches: [a, b], bubbles: true, cancelable: true }));
      feuer('touchstart', t(1, 600, 400), t(2, 700, 400));
      feuer('touchmove', t(1, 550, 400), t(2, 750, 400));
      r.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(1, 550, 400)], bubbles: true }));
    }""")
    pg.wait_for_timeout(400)
    b3 = pg.locator("[data-nbblatt]").evaluate("e => e.offsetWidth")
    pruefe(abs(b3 / b0 - 2) < 0.02, "zwei Finger zoomen (%d → %d)" % (b0, b3))
    pg.screenshot(path=os.path.join(BILD, "nb-zoom.png"))
    br.close()
print("Fehler:", "keine" if not fehler and not f else (fehler + f))
