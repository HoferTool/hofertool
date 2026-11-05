# Einrichtblatt: PDF als weitere Seite(n) hochladen (1.429.0): Reiter mit
# Dateiname, alle Seiten untereinander zum Rollen, gespeichert, löschen.
import time, os, tempfile
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILD = os.environ.get("BILD_ORDNER", ".")
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    # Ein PDF mit drei Seiten machen
    pdfpfad = os.path.join(tempfile.mkdtemp(), "Messprotokoll.pdf")
    q = br.new_page()
    q.set_content("".join(f"<div style='page-break-after:always;font:60px sans-serif'>Seite {i}</div>" for i in (1, 2, 3)))
    q.pdf(path=pdfpfad, format="A4"); q.close()
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    # Hochgeladene Dateien kommen im Nachbau aus TEST.dateien
    pg.evaluate("""() => { TEST.daten.artikel_bild = []; TEST.daten.eb_bilder = [];
      const f = window.fetch; window.fetch = (u, o) => { const m = String(u).match(/#(einrichtblatt\\/pdf\\/.*)$/);
        return m && TEST.dateien[m[1]] ? Promise.resolve(new Response(TEST.dateien[m[1]])) : f(u, o); }; }""")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-kunde='10000']").click(); pg.wait_for_timeout(600)
    pg.locator("[data-hoco-auf='10000-0301']").click(); pg.wait_for_timeout(1200)
    pg.click("[data-blatt-neu='t1']"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    pruefe("Knopf + PDF", pg.locator("[data-eba-pdf-neu]").count() == 1)
    pg.set_input_files("[data-eba-pdf-datei]", pdfpfad)
    pg.wait_for_selector("[data-eba-pdf-seite='3']", timeout=15000); pg.wait_for_timeout(1500)
    pruefe("Reiter mit Dateiname", "Messprotokoll" in pg.inner_text("[data-eba-reiter]"))
    pruefe("Drei Seiten untereinander", pg.locator("[data-eba-pdf-seite]").count() == 3)
    pos = pg.evaluate("[...document.querySelectorAll('[data-eba-pdf-seite]')].map(e => e.getBoundingClientRect().top)")
    pruefe("Untereinander", pos[0] < pos[1] < pos[2])
    gemalt = pg.evaluate("""() => { const c = document.querySelector('[data-eba-pdf-seite="1"] canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let dunkel = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dunkel++; return c.width > 100 && dunkel > 100; }""")
    pruefe("Seite 1 gezeichnet", gemalt)
    pruefe("Kein Hoch/Quer bei PDF", pg.locator("[data-eba-seite-hoch]").count() == 0)
    pg.screenshot(path=os.path.join(BILD, "eb_pdf_seiten.png"))
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1200)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    s = (b or {}).get("seiten") or []
    print(s)
    pruefe("Gespeichert als PDF-Seite", len(s) == 1 and s[0].get("art") == "pdf" and s[0].get("name") == "Messprotokoll")
    # Ansehen: Reiter wählen zeigt das PDF
    pg.click("[data-eba-seite-nr='0']"); pg.wait_for_timeout(300)
    pg.click("[data-eba-seite-nr='1']"); pg.wait_for_selector("[data-eba-pdf-seite='3']", timeout=10000)
    pruefe("Ansicht zeigt PDF", True)
    # Löschen
    pg.click("[data-eba-bearbeiten]"); pg.wait_for_timeout(500)
    pg.click("[data-eba-seite-nr='1']"); pg.wait_for_timeout(300)
    pg.click("[data-eba-seite-weg]"); pg.wait_for_timeout(300)
    pg.locator(".dialog-huelle button.knopf--gefahr, .dialog-huelle [data-ja]").first.click(); pg.wait_for_timeout(300)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1200)
    b = pg.evaluate("TEST.daten.einrichtblatt_app.find(b => b.hoco_nr === '10000-0301')")
    pruefe("Gelöscht", not (b.get("seiten") or []))
    br.close()
print("Fehler:", fehler or "keine")
