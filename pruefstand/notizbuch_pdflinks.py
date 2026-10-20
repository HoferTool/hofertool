# PDF im Notizbuch (seit 1.64.0, Wunsch Patrick 15. Oktober 2026):
# beim Einfügen die Frage „Ausdruck oder Datei“; Verweise im PDF
# (Seitenzahlen im Inhaltsverzeichnis) springen im Ausdruck und im
# Betrachter zur Zielseite.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

from notizbuch_pdflinks_pdf import pdf_mit_link

PDF = pdf_mit_link()
server_starten(); time.sleep(0.4)
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
  "daten.notizbuecher = [{ id: 'nbA', name: 'Werkstatt', farbe: '#2e7d32', reihenfolge: 1, parks: [], erstellt_am: '2026-10-07T08:00:00Z' }];"
  " daten.notizbuch_seiten = [{ id: 'sA', buch_id: 'nbA', titel: 'Handbuch', reihenfolge: 1, inhalt: [] }];\n"
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
    pg.route("**/handbuch-test.pdf", lambda r: r.fulfill(status=200, content_type="application/pdf", body=PDF))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2200)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(1000)
    inhalt = lambda: pg.evaluate("() => TEST.daten.notizbuch_seiten[0].inhalt")

    # --- Als Ausdruck ---
    pg.locator("[data-nbdatei]").set_input_files([{"name": "handbuch.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    pg.wait_for_selector(".dialog [data-w='ausdruck']", timeout=10000)
    pruefe(pg.locator(".dialog [data-w='datei']").count() == 1, "Frage: Ausdruck oder Datei")
    pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(BILD, "pdf-frage.png"))
    pg.locator(".dialog [data-w='ausdruck']").click()
    pg.wait_for_function("() => !document.querySelector('.nb-laeuft')", timeout=30000); pg.wait_for_timeout(1200)
    print("  Meldungen:", pg.evaluate("() => [...document.querySelectorAll('.toast')].map(e => e.textContent)"), f)
    b = [e for e in inhalt() if e.get("t") == "bild"]
    pruefe(len(b) == 3, "drei Seiten als Ausdruck (%d)" % len(b))
    pruefe(b and b[0].get("l") and b[0]["l"][0]["z"] == 3, "Verweis auf Seite 3 gemerkt: %s" % (b[0].get("l") if b else None))
    pg.locator(".nb-rolle").evaluate("e => e.scrollTop = 0"); pg.wait_for_timeout(500)
    pruefe(pg.locator("[data-nblink='3']").count() == 1, "Verweis im Ausdruck anklickbar")
    vorher = pg.locator(".nb-rolle").evaluate("e => e.scrollTop")
    pg.locator("[data-nblink='3']").click(); pg.wait_for_timeout(1200)
    nachher = pg.locator(".nb-rolle").evaluate("e => e.scrollTop")
    y3 = pg.evaluate("() => { const b = document.querySelectorAll('[data-nbbild]')[2]; return b.offsetTop; }")
    pruefe(nachher > vorher + 200 and abs(nachher - (y3 + pg.locator('[data-nbblatt]').evaluate('e => e.offsetTop') - 12)) < 40,
           "Klick springt zu Seite 3 (%d → %d, Ziel %d)" % (vorher, nachher, y3))

    # --- Als Datei ---
    pg.locator("[data-nbdatei]").set_input_files([{"name": "handbuch.pdf", "mimeType": "application/pdf", "buffer": PDF}])
    pg.locator(".dialog [data-w='datei']").click(timeout=10000)
    pg.wait_for_function("() => !document.querySelector('.nb-laeuft')", timeout=30000); pg.wait_for_timeout(1200)
    d = [e for e in inhalt() if e.get("d")]
    pruefe(len(d) == 1 and d[0].get("q") and len([e for e in inhalt() if e.get("t") == "bild"]) == 4, "als Datei: ein Element mit PDF")
    pg.locator("[data-nbpdfdatei]").scroll_into_view_if_needed()
    pg.screenshot(path=os.path.join(BILD, "pdf-datei.png"))
    # Die Ablage im Prüfstand liefert kein echtes PDF: auf die Testdatei zeigen
    pg.evaluate("() => { const e = TEST.daten.notizbuch_seiten[0].inhalt.find(x => x.d); e.q = location.origin + '/handbuch-test.pdf'; }")
    pg.locator("[data-nbseite='sA']").click(); pg.wait_for_timeout(300)
    # Seite neu laden, damit sie die geänderte Adresse kennt
    pg.locator("#notizbuch-knopf").count()
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(1500)
    pg.locator("[data-nbpdfdatei]").scroll_into_view_if_needed()
    pg.locator("[data-nbpdfdatei]").click(); pg.wait_for_timeout(2500)
    pruefe(pg.locator(".pdfansicht").count() == 1, "öffnet im Betrachter")
    pg.wait_for_selector("[data-pdflink='3']", timeout=10000)
    pruefe(pg.locator("[data-pdflink='3']").count() == 1, "Verweis im Betrachter")
    v0 = pg.locator(".pdfansicht__buehne").evaluate("e => e.scrollTop")
    pg.locator("[data-pdflink='3']").click(); pg.wait_for_timeout(1200)
    v1 = pg.locator(".pdfansicht__buehne").evaluate("e => e.scrollTop")
    ziel = pg.locator("[data-pdfseite='3']").evaluate("e => e.offsetTop")
    pruefe(abs(v1 - ziel) < 5 and v1 > v0, "Betrachter springt zu Seite 3 (%d → %d, Ziel %d)" % (v0, v1, ziel))
    pg.screenshot(path=os.path.join(BILD, "pdf-betrachter.png"))
    br.close()
print("Fehler:", "keine" if not fehler and not f else (fehler + f))
