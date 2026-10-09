# Pfad der Zeichnung (1.1.0, Wunsch Patrick 9. Oktober 2026): Der
# Pool-Rechner schreibt hoco_parts.zeichnung_quelle = {pfad, url}. Der
# Betrachter zeigt dann „Pfad“ statt „Neuer Tab“ und kopiert ihn, das
# Auftragsfenster ein Kopier-Zeichen neben „Zeichnung“. Passt url nicht
# (von Hand ersetzt) oder auf dem iPad: wie bisher „Neuer Tab“.
import sys, time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
PDF = None

def pdf_bauen(b, h):
    inhalt = f"4 w 0 0 1 RG 10 10 {b - 20} {h - 20} re S"
    obj = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
           f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {b} {h}] /Contents 4 0 R >>",
           f"<< /Length {len(inhalt)} >>\nstream\n{inhalt}\nendstream"]
    aus = "%PDF-1.4\n"; pos = []
    for n, o in enumerate(obj, 1):
        pos.append(len(aus)); aus += f"{n} 0 obj\n{o}\nendobj\n"
    xref = len(aus)
    aus += f"xref\n0 {len(obj) + 1}\n0000000000 65535 f \n" + "".join(f"{p:010d} 00000 n \n" for p in pos)
    aus += f"trailer\n<< /Size {len(obj) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    return aus.encode("latin-1")
PDF = pdf_bauen(842, 595)
URL = "https://x.invalid/zng.pdf"
PFAD = "\\\\SRV01\\Daten\\Zeichnungen\\10000\\0301 Deckel\\10000-0301 hofer.pdf"

fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
bilder = len(sys.argv) > 1
AB = os.environ.get("BILDER_ORDNER", "/tmp")

def browser(p, mobil):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1180, "height": 820} if mobil else {"width": 1600, "height": 900},
                         is_mobile=mobil, has_touch=mobil,
                         **({"user_agent": "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"} if mobil else {}))
    if not mobil: ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=f"http://127.0.0.1:{PORT}")
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.route("**://x.invalid/**", lambda r: r.fulfill(status=200, content_type="application/pdf", body=PDF,
                                                     headers={"Access-Control-Allow-Origin": "*"}))
    return br, pg, f

def laden(pg, quelleUrl):
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("""([u, p, qu]) => {
      const t = TEST.daten.hoco_parts[0]; t.zeichnung_url = u; t.zeichnung_quelle = { pfad: p, url: qu };
      for (const j of (TEST.daten.jobs || [])) j.drawing_url = u;
      for (const j of (TEST.daten.planwand || [])) j.drawing_url = u; }""", [URL, PFAD, quelleUrl])

def pad_zeichnung(pg, mobil):
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl")
    k = pg.locator("#pad [data-padreiter='zeichnung']")
    if mobil: k.tap()
    else: k.click()
    pg.wait_for_selector(".betrachter-huelle"); pg.wait_for_timeout(1000)

with sync_playwright() as p:
    # ---------- Computer, Pfad passt ----------
    br, pg, f = browser(p, False)
    laden(pg, URL); pad_zeichnung(pg, False)
    pruefe("Knopf Pfad da", pg.locator(".betrachter [data-pfad]").count() == 1)
    pruefe("kein Neuer Tab", pg.locator(".betrachter a:has-text('Neuer Tab')").count() == 0)
    pruefe("Pfad als Tooltip", pg.get_attribute(".betrachter [data-pfad]", "title") == PFAD)
    pg.click(".betrachter [data-pfad]"); pg.wait_for_timeout(400)
    pruefe("Pfad in der Zwischenablage", pg.evaluate("navigator.clipboard.readText()") == PFAD)
    pruefe("Meldung Pfad kopiert", any("Pfad kopiert" in t for t in pg.evaluate("[...document.querySelectorAll('.toast')].map(t => t.textContent)")))
    if bilder: pg.screenshot(path=f"{AB}/pfad-betrachter.png")
    pruefe("keine Fehler (Computer)", not f); br.close()

    # ---------- Auftragsfenster ----------
    br, pg, f = browser(p, False)
    laden(pg, URL)
    pg.evaluate("location.hash='#planwand'"); pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate("""() => { const ids = new Map(TEST.daten.planwand.map(j => [j.id, j]));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 30 && b.getBoundingClientRect().left > 0
        && b.getBoundingClientRect().right < innerWidth);
      return b ? b.dataset.auftrag : null; }""")
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(1200)
    pruefe("Auftragsfenster offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("Kopier-Zeichen neben Zeichnung", pg.locator(".dialog--auftrag [data-pfadkopieren]").count() == 1)
    if pg.locator(".dialog--auftrag [data-pfadkopieren]").count():
        pg.click(".dialog--auftrag [data-pfadkopieren]"); pg.wait_for_timeout(400)
        pruefe("Kopier-Zeichen kopiert", pg.evaluate("navigator.clipboard.readText()") == PFAD)
        pruefe("Fenster bleibt offen", pg.locator(".dialog--auftrag").count() == 1)
        if bilder: pg.locator(".dialog--auftrag").screenshot(path=f"{AB}/pfad-auftrag.png")
    pruefe("keine Fehler (Auftrag)", not f); br.close()

    # ---------- Zeichnung von Hand ersetzt: kein Pfad ----------
    br, pg, f = browser(p, False)
    laden(pg, "https://x.invalid/alt.pdf"); pad_zeichnung(pg, False)
    pruefe("ersetzt: kein Pfad", pg.locator(".betrachter [data-pfad]").count() == 0)
    pruefe("ersetzt: Neuer Tab", pg.locator(".betrachter a:has-text('Neuer Tab')").count() == 1)
    br.close()

    # ---------- iPad ----------
    br, pg, f = browser(p, True)
    laden(pg, URL); pad_zeichnung(pg, True)
    pruefe("iPad: kein Pfad", pg.locator(".betrachter [data-pfad]").count() == 0)
    pruefe("iPad: Neuer Tab", pg.locator(".betrachter a:has-text('Neuer Tab')").count() == 1)
    br.close()

print("Fehler:", ", ".join(fehler) if fehler else "keine")
sys.exit(1 if fehler else 0)
