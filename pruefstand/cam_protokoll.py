# HOFERCAM seit 1.688.0: Werkzeugprotokoll (Excel-Einrichtblatt) einlesen,
# je Bearbeitung mit gleicher T-Nr. ein Werkzeug vorschlagen und übernehmen
# (Wunsch Patrick 21. November 2026). Das Protokoll hier ist erfunden.
import os, tempfile, time
import openpyxl
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

# Aufbau wie das Werkzeug-Protokoll: T-Nr., Standzeit, Aufgabe, Mass, Lieferant, Artikel
wb = openpyxl.Workbook(); ws = wb.active
ws["A1"] = "Werkzeug- Protokoll-Test"
def platz(z, s, t, aufgabe, mass, her, art):
    ws.cell(z, s, t); ws.cell(z + 1, s, 4000); ws.cell(z + 2, s, aufgabe)
    if mass: ws.cell(z + 4, s, mass)
    ws.cell(z + 6, s, her); ws.cell(z + 7, s, art)
platz(2, 1, "T100", "Drehen aussen", "Ø9.70", "SECO", "DCMT 11T304-F1")
platz(2, 3, "T200", "Planieren", "", "Test AG", "VCGX 110302 FN")
platz(2, 5, "T300", "Einstechen", "Ø8.0", "Test AG", "Stechplatte B = 1.50 / R0.1")
platz(10, 1, "T1100", "Bohren", "Ø 3.50", "Test AG", "HM Bohrer Ø3.50")
platz(10, 3, "T1200", "Zentrieren", "M2", "Test AG", "HM Ø2.00")
ws.cell(20, 1, "Ho&Co. Nr:"); ws.cell(20, 3, "99999-0001")
pfad = os.path.join(tempfile.mkdtemp(), "99999-0001_Werkzeugprotokoll.xlsx"); wb.save(pfad)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    for knopf in ["#cam-neu-dreh", "#cam-neu-dreh", "#cam-neu-dreh", "#cam-neu-front", "#cam-neu-front", "#cam-neu-dreh"]:
        pg.click(knopf); pg.wait_for_timeout(150)
    pg.wait_for_timeout(1000); pg.click("#cam-alle-zu"); pg.wait_for_timeout(1000)
    pg.click("#cam-protokoll-auf"); pg.wait_for_selector("#cam-protokoll")
    pg.set_input_files("#cam-protokoll-datei input", pfad)
    pg.wait_for_selector("[data-camproto-zeile]", timeout=15000)
    wz = pg.eval_on_selector_all("[data-camproto-wz]", "l => l.map(e => e.textContent)")
    tnr = pg.eval_on_selector_all("[data-camproto-zeile] td:nth-child(2)", "l => l.map(e => e.textContent)")
    print(list(zip(tnr, wz)))
    pruefe("6 Bearbeitungen in der Liste", len(wz) == 6)
    d = dict(zip(tnr, wz))
    pruefe("T100 D-Platte R0.4 unten", "D 55°" in d.get("T100", "") and "R0.4" in d.get("T100", ""))
    pruefe("T200 V-Platte R0.2", "V 35°" in d.get("T200", "") and "R0.2" in d.get("T200", ""))
    pruefe("T300 Einstechplatte B1.5 R0.1", "B1.5" in d.get("T300", "") and "R0.1" in d.get("T300", ""))
    pruefe("T1100 Bohrer Ø3.5", "Bohrer" in d.get("T1100", "") and "Ø3.5" in d.get("T1100", ""))
    pruefe("T1200 Zentrieren mit Ø2", "Ø2" in d.get("T1200", "") and "90°" in d.get("T1200", ""))
    pruefe("Platz ohne Protokoll ohne Haken", pg.locator("[data-camproto-zeile='5'] [data-camproto-haken]").count() == 0)
    pg.click("#cam-protokoll-ok"); pg.wait_for_timeout(1000)
    pruefe("Fenster zu", pg.locator("#cam-protokoll").count() == 0)
    pg.wait_for_timeout(900); pg.click("#cam-alle-auf"); pg.wait_for_timeout(900)
    knoepfe = pg.eval_on_selector_all("[data-camwz-auf]", "l => l.map(e => e.textContent)")
    print(knoepfe)
    pruefe("Werkzeuge an den Bearbeitungen", sum(1 for k in knoepfe if k.strip() != "🔧 Werkzeug") == 5)
    # Strg + Z: erst das Aufklappen, dann die Werkzeuge
    pg.evaluate("document.activeElement && document.activeElement.blur()")
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(600)
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(600)
    if pg.locator("#cam-alle-auf:not([disabled])").count(): pg.click("#cam-alle-auf"); pg.wait_for_timeout(300)
    knoepfe2 = pg.eval_on_selector_all("[data-camwz-auf]", "l => l.map(e => e.textContent)")
    pruefe("Strg + Z nimmt die Werkzeuge zurück", len(knoepfe2) == 6 and all(k.strip() == "🔧 Werkzeug" for k in knoepfe2))
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
