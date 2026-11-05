# Mailkonto (1.323.0): Ferien und Bestellungen direkt über Microsoft 365
# senden, Einstellungen für Admins; ohne Konto alles wie vorher
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
HIER = os.path.dirname(os.path.abspath(__file__))
NM = os.path.join(HIER, "..", "node_modules")
JSPDF = open(os.path.join(NM, "jspdf/dist/jspdf.umd.min.js"), encoding="utf-8").read()
H2C = open(os.path.join(NM, "html2canvas/dist/html2canvas.min.js"), encoding="utf-8").read()
AKTIV = """
TEST.rpc.mail_konto_status = () => [{ aktiv: true, absender: 'programmierung@hoferco.ch', name: 'Hofer' }];
TEST.rpc.mail_konto_lesen = () => [{ mandant: 'm-1', client_id: 'c-1', absender: 'programmierung@hoferco.ch', name: 'Hofer',
  hat_geheimnis: true, geprueft_am: null, fehler: null }];
TEST.gesendet = [];
TEST.funktionen = TEST.funktionen || {};
TEST.funktionen['mail-senden'] = (b) => { TEST.gesendet.push(b);
  if (b.art === 'ferien') return { ok: true, empfaenger: 2, neu: true };
  if (b.art === 'pruefen') return { ok: true, an: 'programmierung@hoferco.ch' };
  return { ok: true }; };
true;
"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    pg = ctx.new_page(); ctx.set_default_timeout(15000)
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**", "**://cdnjs.cloudflare.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1200)
    pg.evaluate("""TEST.daten.app_config = TEST.daten.app_config || [];
      TEST.daten.app_config.push({ schluessel: 'ferien_verteiler', wert: 'anna@hoferco.ch; ben@hoferco.ch' })""")

    # Ohne Mailkonto: Häkchen wie bisher
    pg.locator("[data-fzelle]").nth(3).click(); pg.wait_for_selector("#fd-termin"); pg.wait_for_timeout(400)
    pruefe("ohne Konto: Outlook-Termin wie bisher", "Outlook-Termin an 2 Empfänger" in pg.inner_text(".fd-termin"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # Mit Mailkonto: direkt senden, kein Download
    pg.evaluate(AKTIV)
    pg.evaluate("window.hoferMailStatus()"); pg.wait_for_timeout(200)
    pg.locator("[data-fzelle]").nth(3).click(); pg.wait_for_selector("#fd-termin"); pg.wait_for_timeout(600)
    pruefe("mit Konto: Termin direkt", "Termin direkt an 2 Empfänger" in pg.inner_text(".fd-termin"))
    pg.fill("#fd-person", "Testperson"); pg.fill("#fd-notiz", "Wandern")
    downloads = []; pg.on("download", lambda d: downloads.append(d))
    pg.locator("#fd-ja").click(); pg.wait_for_timeout(1200)
    g = pg.evaluate("TEST.gesendet")
    fe = [x for x in g if x.get("art") == "ferien"]
    pruefe("Ferien an Server: " + str(fe), len(fe) == 1 and fe[0]["person"] == "Testperson" and fe[0]["id"] and fe[0]["von"] and fe[0]["bis"] and fe[0]["notiz"] == "Wandern")
    pruefe("kein Download", not downloads)
    pruefe("Meldung", "Ferientermin an 2 Empfänger gesendet" in pg.inner_text("body"))
    # Löschen: Absage mit outlook_id
    fid = fe[0]["id"] if fe else None
    pg.evaluate(f"TEST.daten.vacations.forEach(v => {{ if (v.id === '{fid}') v.outlook_id = 'EV1'; }})")
    pg.wait_for_timeout(500)
    el = pg.locator(f"[data-ferien='{fid}']")
    if el.count():
        el.first.click(); pg.wait_for_selector("#fd-weg"); pg.click("#fd-weg"); pg.wait_for_timeout(300)
        pg.locator(".dialog-huelle button:has-text('Löschen')").last.click(); pg.wait_for_timeout(1200)
        ab = [x for x in pg.evaluate("TEST.gesendet") if x.get("art") == "ferien_absagen"]
        pruefe("Absage mit Outlook-Kennung: " + str(ab), len(ab) == 1 and ab[0]["outlook_id"] == "EV1")
    else:
        pruefe("Ferienbalken nach Neuladen sichtbar", False)

    # Einstellungen
    pg.locator("#kopf-einstellungen").click(); pg.click("[data-einst='outlook']"); pg.wait_for_selector("#es-mailkonto"); pg.wait_for_timeout(500)
    pruefe("Mailkonto zeigt Absender", pg.input_value("#mk-absender") == "programmierung@hoferco.ch")
    pruefe("Schlüssel nicht angezeigt", pg.input_value("#mk-geheim") == "")
    pg.fill("#mk-mandant", "m-2"); pg.click("#mk-speichern"); pg.wait_for_timeout(600)
    s = [x for x in pg.evaluate("TEST.protokoll") if x.get("art") == "rpc" and x.get("name") == "mail_konto_setzen"]
    pruefe("gespeichert ohne Schlüssel: " + str(s[-1]["args"] if s else None), s and s[-1]["args"]["p_mandant"] == "m-2" and s[-1]["args"]["p_geheimnis"] is None)
    pg.click("#mk-probe"); pg.wait_for_timeout(800)
    pruefe("Probe gesendet", any(x.get("art") == "pruefen" for x in pg.evaluate("TEST.gesendet")))
    pg.locator("#es-mailkonto").scroll_into_view_if_needed()
    pg.screenshot(path=os.path.join(os.environ.get("BILDER", HIER), "mailkonto_einstellungen.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    # Bestellungen: Knopf und Senden aus dem Bestellblatt
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(800)
    pruefe("Knopf Bestellung senden", pg.locator("[data-bestellsenden]").count() >= 1)
    pruefe("Kein PDF-Knopf in der Liste", pg.locator("[data-bestellpdf]").count() == 0)
    with ctx.expect_page() as neu:
        pg.locator("[data-bestellsenden]").first.click()
    bl = neu.value
    bl.on("pageerror", lambda e: fehler.append("BLATTFEHLER: " + str(e)[:160]))
    bl.wait_for_selector("#sendefeld", state="visible", timeout=8000)
    pruefe("Sendefeld offen mit Betreff", "Bestellung" in bl.input_value("#sf-betreff"))
    pruefe("Nur PDF und Schliessen in der Leiste", bl.is_visible("#pdfknopf") and not bl.is_visible("#druckknopf")
           and not bl.is_visible("#mailknopf") and not bl.is_visible("#sendeknopf") and not bl.is_visible("#pdfdruckknopf"))
    bl.add_script_tag(content=H2C); bl.add_script_tag(content=JSPDF)
    bl.evaluate("document.getElementById('schriftlink') && document.getElementById('schriftlink').remove()")
    with bl.expect_download(timeout=40000) as dl:
        bl.click("#pdfknopf")
    pruefe("PDF herunterladen", dl.value.suggested_filename.endswith(".pdf"))
    bl.fill("#sf-an", "verkauf@lieferant.test")
    bl.screenshot(path=os.path.join(os.environ.get("BILDER", HIER), "mailkonto_bestellblatt.png"))
    bl.click("#sf-senden")
    bl.wait_for_selector(".sf-gut", timeout=20000)
    b = [x for x in pg.evaluate("TEST.gesendet") if x.get("art") == "bestellung"]
    pruefe("Bestellung an Server", len(b) == 1 and b[0]["an"] == "verkauf@lieferant.test" and b[0]["pdf"]["base64"].startswith("JVBER")
           and b[0]["positionen"] and b[0]["html"])
    bl.close()
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
