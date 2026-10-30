# Bestell-PDF mit Liefertermin je Position und den beim Artikel
# hinterlegten Zeichnungen als weitere Seiten (seit 1.300.0)
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
HIER = os.path.dirname(os.path.abspath(__file__))
NM = os.path.join(HIER, "..", "node_modules")
# Eine quere Test-Zeichnung, gebaut mit pdf-lib aus node_modules
import subprocess
PDF = subprocess.run(["node", "-e", """
const {PDFDocument, rgb, StandardFonts} = require('pdf-lib');
(async () => { const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([842, 595]); p.drawRectangle({ x: 40, y: 40, width: 762, height: 515, borderColor: rgb(0,0,0), borderWidth: 3 });
  p.drawText('ZEICHNUNG TEST QUER', { x: 200, y: 300, size: 40, font: f });
  process.stdout.write(Buffer.from(await d.save())); })();"""], cwd=os.path.join(HIER, ".."), capture_output=True, check=True).stdout
JSPDF = open(os.path.join(NM, "jspdf/dist/jspdf.umd.min.js"), encoding="utf-8").read()
H2C = open(os.path.join(NM, "html2canvas/dist/html2canvas.min.js"), encoding="utf-8").read()
ZUSATZ = """
TEST.daten.order_items[0].liefertermin = "KW23";
TEST.daten.order_items.push({ id: "o2", article_id: "a1", supplier_id: "s1", quantity: 5,
  status: "offen", note: null, created_by: "u1", created_at: "2026-09-11T08:00:00Z" });
TEST.daten.spezial_pdfs = [{ id: "sp1", article_id: "a1", name: "Zeichnung 452410",
  url: "https://zeichnung.test/z.pdf", pfad: "x", erstellt_am: "2026-10-01T00:00:00Z" }];
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width":1400,"height":900})
    pg = ctx.new_page(); ctx.set_default_timeout(15000)
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    ctx.route("https://zeichnung.test/**", lambda r: r.fulfill(status=200, content_type="application/pdf",
        body=PDF, headers={"Access-Control-Allow-Origin": "*"}))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate(ZUSATZ)
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(400)
    if "Termin KW23" not in pg.inner_text("#best-inhalt"): fehler.append("Termin-Chip fehlt in der Liste")

    # Bearbeiten: Termin ändern
    pg.click("[data-bearb-best='o1']"); pg.click(".dialog-huelle [data-w='position']")
    pg.wait_for_selector(".dialog-huelle input[placeholder*='KW23']")
    feld = pg.locator(".dialog-huelle input[placeholder*='KW23']")
    if feld.input_value() != "KW23": fehler.append("Termin steht nicht im Bearbeiten-Fenster")
    feld.fill("KW 24"); pg.click(".dialog-huelle [data-ja]"); pg.wait_for_timeout(800)
    o1 = pg.evaluate("TEST.daten.order_items.find(z => z.id === 'o1').liefertermin")
    if o1 != "KW 24": fehler.append("Termin nicht gespeichert: " + str(o1))

    with ctx.expect_page() as neu:
        pg.click("[data-bestellpdf]")
    bl = neu.value
    bl.on("pageerror", lambda e: fehler.append("BLATTFEHLER: " + str(e)[:160]))
    bl.wait_for_selector(".blatt.zeichnung img", timeout=15000)
    bl.wait_for_timeout(500)
    th = bl.inner_text("thead")
    if "TERMIN" not in th: fehler.append("Spalte Termin fehlt")
    zeilen = bl.locator("tbody tr")
    if zeilen.count() != 2: fehler.append("Zeilen: " + str(zeilen.count()))
    if "KW 24" not in bl.inner_text("tbody"): fehler.append("Termin fehlt im PDF")
    if bl.locator(".blatt.zeichnung").count() != 1: fehler.append("Zeichnungsseiten: " + str(bl.locator(".blatt.zeichnung").count()))
    if bl.locator(".blatt.zeichnung.quer").count() != 1: fehler.append("Zeichnung nicht quer")
    if "MTEC-452410" not in bl.inner_text(".zkopf"): fehler.append("Kopf der Zeichnung ohne Artikel")
    bl.screenshot(path=os.path.join(os.environ.get("BILDER", HIER), "bestell_termin_zeichnung.png"), full_page=True)
    # Das PDF für die Mail hat zwei Seiten, die zweite quer
    # Die Bibliotheken direkt ins Blatt, wie mailbilder.py (cdnjs ist hier nicht erreichbar)
    bl.add_script_tag(content=H2C); bl.add_script_tag(content=JSPDF)
    # Die Google-Schrift ist hier gesperrt, html2canvas wartet sonst ewig auf sie
    bl.evaluate("document.getElementById('schriftlink').remove()")
    info = bl.evaluate("""async () => { const b = await pdfMachen();
      const t = new TextDecoder('latin1').decode(await b.arrayBuffer());
      return { seiten: (t.match(/\\/Type \\/Page[^s]/g) || []).length,
               boxen: t.match(/MediaBox \\[[^\\]]*\\]/g) }; }""")
    if info["seiten"] != 2: fehler.append("PDF-Seiten: " + str(info))
    if not any(b.startswith("MediaBox [0 0 841") for b in info.get("boxen") or []): fehler.append("Zweite Seite nicht quer: " + str(info))
    bl.close()

    # Ohne Termin keine Spalte
    pg.evaluate("TEST.daten.order_items.forEach(z => z.liefertermin = null); TEST.daten.spezial_pdfs = []")
    pg.click("[data-unter='bestellungen/bestellt']"); pg.wait_for_timeout(300)
    pg.click("[data-unter='bestellungen/offen']"); pg.wait_for_timeout(500)
    with ctx.expect_page() as neu:
        pg.click("[data-bestellpdf]")
    bl = neu.value; bl.wait_for_selector("tbody tr"); bl.wait_for_timeout(800)
    if "TERMIN" in bl.inner_text("thead"): fehler.append("Spalte Termin ohne Termin")
    if bl.locator(".blatt.zeichnung").count(): fehler.append("Zeichnung ohne PDF")
    bl.close()

    # Neue Position mit Termin
    pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
    pg.fill("#pd-such", "MTEC"); pg.wait_for_selector("#pd-treffer [data-w='a1']", timeout=5000)
    pg.click("#pd-treffer [data-w='a1']")
    pg.fill("#pd-termin", "KW30"); pg.click("#pd-ja"); pg.wait_for_timeout(800)
    if not pg.evaluate("TEST.daten.order_items.some(z => z.liefertermin === 'KW30')"): fehler.append("Neue Position ohne Termin")
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
