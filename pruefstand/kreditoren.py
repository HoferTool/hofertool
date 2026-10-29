# Kreditorenrechnungen (1.268.0): Ordner wählen, ein gescannter Stapel mit
# drei Rechnungen wird getrennt und je Lieferant abgelegt, eine unbekannte
# kommt nach „_Zuordnen“, wird dort von Hand abgelegt und danach erkannt.
# Erfundene Lieferanten, keine echten Rechnungen im Repository.
import time, base64
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

# Kleine PDF mit Text je Seite, ohne Bibliothek
def pdf(seiten):
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for zeilen in seiten:
        inhalt = "BT /F1 11 Tf 50 800 Td 14 TL " + " ".join("(" + z.replace("(", "").replace(")", "") + ") '" for z in zeilen) + " ET"
        objs.append("<< /Length %d >>\nstream\n%s\nendstream" % (len(inhalt.encode("latin-1")), inhalt))
        objs.append("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>" % len(objs))
        kids.append(len(objs))
    objs[1] = "<< /Type /Pages /Kids [%s] /Count %d >>" % (" ".join("%d 0 R" % k for k in kids), len(kids))
    aus = b"%PDF-1.4\n"; pos = []
    for i, o in enumerate(objs):
        pos.append(len(aus)); aus += ("%d 0 obj\n%s\nendobj\n" % (i + 1, o)).encode("latin-1")
    xref = len(aus)
    aus += ("xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)).encode() + b"".join(b"%010d 00000 n \n" % p for p in pos)
    aus += ("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)).encode()
    return aus

HOFER = ["Hofer + Co. Praezisionsdrehteile", "Alte Bernstrasse 24", "4573 Lohn-Ammannsegg"]
STAPEL = pdf([
    ["Muster Werkzeug AG, Feldweg 3, 8000 Zuerich, CHE-111.222.333 MWST"] + HOFER + ["Rechnung RE-4711", "Rechnungsdatum 27.10.2026", "Bestelldatum 20.10.2026", "Seite 1 von 2"],
    [],  # leere Rückseite (beidseitig gescannt) trennt nicht
    ["Muster Werkzeug AG", "Rechnung RE-4711", "Total CHF 120.00", "Seite 2 von 2"],
    [],
    ["Empfangsschein   Zahlteil", "Konto / Zahlbar an", "CH44 3199 9123 0008 8901 2", "Beispiel Stahl GmbH", "Industriestrasse 1", "Referenz"]
        + ["Rechnungsnummer 55001", "Datum 28.10.2026"],
    # Fusszeile nur „1/2“ ohne „Seite“, Nummer auf Seite 2 falsch gelesen,
    # „Konto-/ Zahlbar an“ mit Bindestrich (wie bei Notz Metall)
    ["Rechnung 3301 - 20.10.2026"] + HOFER + ["Total CHF 50.00", "1/2"],
    ["Rechnung 330 1 - 20.10.2026", "2/2"],
    ["Empfangsschein  Zahlteil  Konto-/ Zahlbar an", "CH12 3456 7890 1234 5678 9", "Muster Metall AG", "Bernstrasse 1", "Rechnung 3301 - 20.10.2026"],
    ["Kleiner Verein"] + HOFER + ["Rechnungs-Nr 0099", "Rechnungsdatum 26.10.2026", "IBAN CH56 0483 5012 3456 7800 9"],
    ["Turnverein Muster"] + HOFER + ["Rechnung 0777", "Rechnungsdatum 25.10.2026", "Bankverbindung:", "Turnverein Muster", "IBAN CH93 0076 2011 6238 5295 7", "Raiffeisenbank"],
])

ORDNER = """
(async () => {
  const root = await navigator.storage.getDirectory();
  for await (const [n] of root.entries()) await root.removeEntry(n, { recursive: true });
  const h = await root.getDirectoryHandle('Rechnungen Kreditoren', { create: true });
  window.KRED = h;
  window.showDirectoryPicker = async () => h;
})();
"""
BAUM = """async () => { const baum = async (d, pre) => { let a = []; for await (const [n, e] of d.entries()) {
  a.push(pre + n); if (e.kind === 'directory') a = a.concat(await baum(e, pre + n + '/')); } return a; };
  return (await baum(window.KRED, '')).sort(); }"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.add_init_script(ORDNER)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='dokumente']").click(); pg.wait_for_selector("#kred-ordner"); pg.wait_for_timeout(300)
    pruefe("Noch kein Ordner", "Noch kein Ordner gewählt" in pg.inner_text("#kred"))
    pg.click("#kred-ordner"); pg.wait_for_timeout(600)
    pruefe("Ordner gewählt", "Rechnungen Kreditoren" in pg.inner_text("#kred"))

    pg.evaluate("""async (b64) => { const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const w = await (await window.KRED.getFileHandle('Scan 001.pdf', { create: true })).createWritable();
      await w.write(bytes); await w.close(); }""", base64.b64encode(STAPEL).decode())
    pg.click("#kred-jetzt")
    pg.wait_for_selector("#kred-auftrag.si-auftrag--gut, #kred-auftrag.si-auftrag--fehler", timeout=60000)
    print("Ergebnis:", pg.inner_text("#kred-auftrag"))
    namen = pg.evaluate(BAUM); print("Ordner:", namen)
    pruefe("Zwei Seiten Muster Werkzeug als eine Rechnung", "Muster Werkzeug AG/2026-10-27 RE-4711.pdf" in namen)
    seiten = pg.evaluate("""async () => { const f = await (await (await window.KRED.getDirectoryHandle('Muster Werkzeug AG')).getFileHandle('2026-10-27 RE-4711.pdf')).getFile();
      const t = await f.text(); return (t.match(/\\/Type \\/Page[^s]/g) || []).length; }""")
    pruefe("Leere Rückseiten weg, zwei Seiten: " + str(seiten), seiten == 2)
    pruefe("QR-Zahlteil erkennt Beispiel Stahl", "Beispiel Stahl GmbH/2026-10-28 55001.pdf" in namen)
    pruefe("Fusszeile 1/2 und Konto-/ Zahlbar an", "Muster Metall AG/2026-10-20 3301.pdf" in namen and not any(n.startswith("_Zuordnen/2026-10-20") for n in namen))
    pruefe("Stapel nach _Originale", "_Originale/Scan 001.pdf" in namen and "Scan 001.pdf" not in namen)
    pruefe("Name über der IBAN erkannt", "Turnverein Muster/2026-10-25 0777.pdf" in namen)
    pruefe("Unbekannter nach _Zuordnen", "_Zuordnen/2026-10-26 0099.pdf" in namen)
    pruefe("Zeile zum Zuordnen", pg.locator("#kred-zuordnen .kred-zeile").count() == 1)

    pg.fill("#kred-zuordnen .kred-name", "Kleiner Verein")
    pg.click("#kred-zuordnen .knopf--haupt"); pg.wait_for_timeout(1000)
    namen = pg.evaluate(BAUM)
    pruefe("Von Hand abgelegt", "Kleiner Verein/2026-10-26 0099.pdf" in namen and "_Zuordnen/2026-10-26 0099.pdf" not in namen)
    pruefe("Keine Zeile mehr", pg.locator("#kred-zuordnen").count() == 0)

    # Zweiter Stapel: jetzt kennt die App alle drei
    pg.evaluate("""async (b64) => { const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const w = await (await window.KRED.getFileHandle('Scan 002.pdf', { create: true })).createWritable();
      await w.write(bytes); await w.close(); }""", base64.b64encode(STAPEL).decode())
    pg.click("#kred-jetzt"); pg.wait_for_timeout(300)
    pg.wait_for_selector("#kred-auftrag.si-auftrag--gut, #kred-auftrag.si-auftrag--fehler", timeout=60000)
    print("Ergebnis 2:", pg.inner_text("#kred-auftrag"))
    namen = pg.evaluate(BAUM)
    pruefe("Gelernt: Verein von selbst", "_Zuordnen/2026-10-26 0099.pdf" not in namen and "Kleiner Verein/2026-10-26 0099 (2).pdf" not in namen)
    pruefe("Gleiche Rechnung nicht doppelt", "Muster Werkzeug AG/2026-10-27 RE-4711 (2).pdf" not in namen and "schon abgelegt" in pg.inner_text("#kred-auftrag"))
    liste = pg.evaluate("async () => JSON.parse(await (await (await window.KRED.getFileHandle('_Lieferanten.json')).getFile()).text())")
    pruefe("UID gelernt", any(l["name"] == "Muster Werkzeug AG" and "111222333" in l["uid"] for l in liste))
    pruefe("Keine Fehler auf der Seite", not f)
    if f: print(f)
    br.close()
print("Fehler:", fehler or "keine")
