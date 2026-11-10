# QM Etappe 2 (1.460.0, Wunsch Patrick 10. November 2026): Managementbewertung
# mit Kennzahlen, Massnahmen aus dem KVP, Freigabe mit Sperre, neue Fassung, PDF.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("QM_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

ZUSATZ = """;
(TEST.daten.profiles.find(x => x.id === 'u1') || {}).einstellungen = { qmSehen: true };
TEST.daten.qm_bewertungen = [];
TEST.daten.qm_messgroessen = [
  { id: 'mg1', name: 'EBIT-Marge', einheit: '%', quelle: 'jahr', schluessel: 'ebit_marge_pct', richtung: 'hoch', ziel: 14, gelb: 12, aktiv: true, sort: 10 },
  { id: 'mg2', name: 'Ausschussquote', einheit: '%', quelle: 'auto', schluessel: 'ausschuss_pct', richtung: 'tief', aktiv: true, sort: 20 },
];
TEST.daten.qm_massnahmen = [
  { id: 'a1', nr: 1, thema: 'Dokumentenlenkung', massnahme: 'Dokumente prüfen', wer: 'GL', status: 'offen', periode: 2024 },
  { id: 'a2', nr: 2, thema: 'Alt erledigt', massnahme: 'Längst wirksam', status: 'wirksam', periode: 2024, abgeschlossen_am: '2024-06-01' },
  { id: 'a3', nr: 3, thema: 'Messraum', massnahme: 'Umbau', status: 'wirksam', periode: 2025, abschnitt: 'jahresziel', abgeschlossen_am: '2025-11-01' },
];
TEST.daten.qm_jahreswerte = [
  { jahr: 2024, schluessel: 'umsatz', wert: 4400000 }, { jahr: 2024, schluessel: 'ebit', wert: 572000 },
  { jahr: 2025, schluessel: 'ebit_marge_pct', wert: 12.5 },
];
TEST.rpc.qm_solar = () => [{ tage: 0 }];
"""
def dialog(pg):
    pg.wait_for_function("document.querySelectorAll('.dialog-huelle').length >= 1")
    return pg.locator(".dialog-huelle").last

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + ZUSATZ))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#/qm", wait_until="domcontentloaded")
    pg.wait_for_selector("#qm-kvp", timeout=8000)
    pg.click("[data-qmreiter='bewertung']"); pg.wait_for_selector("#qm-bewertungen")
    pruefe(pg.locator("#qm-bewertung-leer").count() == 1, "noch keine Bewertung")
    pg.click("#qm-neue-bewertung"); d = dialog(pg)
    d.locator("[id$='jahr']").fill("2025"); d.locator(".knopf--haupt").last.click()
    pg.wait_for_selector("#qm-bewertung", timeout=5000)
    b = pg.evaluate("() => TEST.daten.qm_bewertungen")
    pruefe(len(b) == 1 and b[0]["jahr"] == 2025 and b[0]["von"] == "2025-01-01", "Bewertung 2025 angelegt: %s" % [(x["jahr"], x.get("von")) for x in b])

    st = pg.locator("[data-qmabschnitt='status']")
    pruefe(st.locator("[data-bewmassnahme='a1']").count() == 1, "offene Massnahme 2024 steht im Status der Vorperiode")
    pruefe(st.locator("[data-bewmassnahme='a2']").count() == 0, "2024 abgeschlossene steht nicht dort")
    pruefe(pg.locator("[data-qmabschnitt='jahresziel'] [data-bewmassnahme='a3']").count() == 1, "Jahresziel 2025 steht unten")

    pg.wait_for_selector("#qm-bew-auto", timeout=8000)
    ist = pg.locator("[data-bewist='mg1']").inner_text().strip()
    pruefe(ist == "12.5", "EBIT-Marge 2025 als Ist: " + ist)
    farbe = pg.locator("[data-bewkennzahl='mg1'] [data-ampel]").get_attribute("data-ampel")
    pruefe(farbe == "gelb", "Ampel gelb bei 12.5 und Ziel 14: %s" % farbe)
    pruefe(pg.locator("[data-bewauto='kvp_offen']").count() == 1, "KVP-Kennzahlen aus dem HoferTool")
    vj = pg.locator("#qm-bew-wirtschaft").inner_text()
    pruefe("13" in vj, "Wirtschaftszahlen mit EBIT-Marge 2024")

    # Eintippen speichert von selbst
    pg.locator("[data-qmbew='verlauf.positiv']").fill("Umsatzziel leicht übertroffen\nLangdreher bewährt")
    pg.locator("[data-qmbew='rueckmeldungen.kunden.anzahl']").fill("10")
    pg.locator("[data-qmbew='audits.intern.massnahmen'] [data-jn='ja']").click()
    pg.wait_for_timeout(1500)
    i = pg.evaluate("() => TEST.daten.qm_bewertungen[0].inhalt")
    pruefe("Langdreher" in i["verlauf"]["positiv"] and i["rueckmeldungen"]["kunden"]["anzahl"] == "10"
           and i["audits"]["intern"]["massnahmen"] == "ja", "Eingaben von selbst gespeichert")

    # Massnahme direkt in einem Abschnitt
    pg.click("[data-qmneu='veraenderung']"); d = dialog(pg)
    d.locator("[id$='massnahme']").fill("ISO 9001:2026 einpflegen")
    d.locator(".knopf--haupt").last.click(); pg.wait_for_timeout(900)
    m = pg.evaluate("() => TEST.daten.qm_massnahmen.find(x => x.massnahme === 'ISO 9001:2026 einpflegen')")
    pruefe(m and m["periode"] == 2025 and m["abschnitt"] == "veraenderung" and "2025" in (m["quelle"] or ""), "Massnahme mit Abschnitt und Periode: %s" % m)
    pruefe(pg.locator("[data-qmabschnitt='veraenderung'] [data-bewmassnahme]").count() == 1, "steht unter Veränderungen")
    # → Massnahme aus gelber Kennzahl
    pg.click("[data-bewmgmassnahme='mg1']"); d = dialog(pg)
    pruefe(d.locator("[id$='abschnitt']").input_value() == "jahresziel", "aus Kennzahl als Jahresziel vorgewählt")
    d.locator("[id$='massnahme']").fill("Stundensätze prüfen"); d.locator(".knopf--haupt").last.click(); pg.wait_for_timeout(900)
    pruefe(pg.locator("[data-qmabschnitt='jahresziel'] [data-bewmassnahme]").count() == 2, "neues Jahresziel steht")
    pg.screenshot(path=BILD + "/qm-bewertung.png", full_page=True)

    # PDF
    pg.click("#qm-bew-pdf")
    pg.wait_for_function("() => document.querySelector('#qm-bew-pdf') && document.querySelector('#qm-bew-pdf').textContent === 'PDF'", timeout=30000)
    fm = pg.locator(".meldung--fehler").count() if pg.locator(".meldung--fehler").count() else 0
    pruefe(fm == 0 and not pf, "PDF ohne Fehler erstellt %s" % pf)
    pg.wait_for_timeout(2500); pg.screenshot(path=BILD + "/qm-bewertung-pdf.png")
    for n in range(2, 5):
        pg.mouse.move(700, 450); pg.mouse.wheel(0, 820); pg.wait_for_timeout(1200); pg.screenshot(path=BILD + "/qm-bewertung-pdf%d.png" % n)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # Freigeben
    pg.click("#qm-bew-freigeben"); d = dialog(pg); d.locator(".knopf--haupt").last.click()
    pg.wait_for_selector("#qm-bewertung[data-gesperrt='ja']", timeout=5000)
    b = pg.evaluate("() => TEST.daten.qm_bewertungen[0]")
    pruefe(b["status"] == "freigegeben" and b["inhalt"].get("schnapp") and len(b["inhalt"]["schnapp"]["massnahmen"]["jahresziel"]) == 2,
           "freigegeben und eingefroren")
    pruefe(pg.locator("[data-qmbew='verlauf.positiv']").get_attribute("readonly") is not None, "Felder nach Freigabe gesperrt")
    pruefe(pg.locator("#qm-bew-freigeben").count() == 0 and pg.locator("#qm-bew-loeschen").count() == 0, "kein Freigeben und Löschen mehr")
    pg.screenshot(path=BILD + "/qm-bewertung-frei.png")
    pg.click("#qm-bew-fassung"); pg.wait_for_timeout(1200)
    b = pg.evaluate("() => TEST.daten.qm_bewertungen.map(x => [x.fassung, x.status, !!(x.inhalt||{}).schnapp, ((x.inhalt||{}).verlauf||{}).positiv])")
    pruefe(len(b) == 2 and [2, "entwurf", False] == b[1][:3] and "Langdreher" in b[1][3], "neue Fassung als Entwurf mit Inhalt: %s" % b)
    pruefe(pg.locator("#qm-bewertung[data-gesperrt='nein']").count() == 1, "neue Fassung offen und bearbeitbar")

    pg.evaluate("document.body.classList.add('dunkel')"); pg.screenshot(path=BILD + "/qm-bewertung-dunkel.png")
    pg.evaluate("document.body.classList.remove('dunkel')")
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(500)
    breit = pg.evaluate("document.documentElement.scrollWidth")
    pruefe(breit <= 392, "Handy: Seite rollt nicht seitlich (%d)" % breit)
    pg.screenshot(path=BILD + "/qm-bewertung-handy.png", full_page=True)
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
