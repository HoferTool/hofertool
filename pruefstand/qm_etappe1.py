# QM Etappe 1 (1.459.0, Wunsch Patrick 10. November 2026): KVP-Massnahmen,
# Messgrössen mit Ampel und Wirtschaftszahlen je Jahr, nur mit qmSehen.
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
TEST.daten.qm_massnahmen = [];
TEST.daten.qm_messgroessen = [];
TEST.daten.qm_jahreswerte = [
  { jahr: 2023, schluessel: 'umsatz', wert: 4000000 }, { jahr: 2023, schluessel: 'ebit', wert: 360000 },
  { jahr: 2024, schluessel: 'umsatz', wert: 4400000 }, { jahr: 2024, schluessel: 'ebit', wert: 572000 },
  { jahr: 2024, schluessel: 'personal', wert: 1892000 }, { jahr: 2024, schluessel: 'vollzeit', wert: 20 },
  { jahr: 2022, schluessel: 'ebit_marge_pct', wert: 15 },
];
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
    pruefe(pg.locator("#qm-kvp-leer").count() == 1, "leere KVP-Liste mit Hinweis")

    # Wirtschaftszahlen: gerechnet
    pg.click("[data-qmreiter='zahlen']"); pg.wait_for_selector("#qm-zahlen")
    t = lambda k: pg.locator(f"[data-qmwert='{k}']").inner_text().strip()
    pruefe(t("umsatz_vj_pct-2024") == "10", "Umsatz zum Vorjahr 10 Prozent: " + t("umsatz_vj_pct-2024"))
    pruefe(t("umsatz_je_vz-2024") == "220'000", "Umsatz je Vollzeitstelle: " + t("umsatz_je_vz-2024"))
    marge = pg.locator("[data-qmfeld='ebit_marge_pct-2024']")
    pruefe(marge.get_attribute("placeholder") == "13", "EBIT-Marge 2024 gerechnet 13 Prozent: %s" % marge.get_attribute("placeholder"))
    pruefe(pg.locator("[data-qmfeld='ebit_marge_pct-2022']").input_value() == "15", "eingetippte Marge 2022 steht")
    pruefe(t("ebit_marge_vj-2023") == "−6", "Marge zum Vorjahr 2023 −6 Pp.: " + t("ebit_marge_vj-2023"))
    # Eintippen mit Apostroph speichert
    f = pg.locator("[data-qmfeld='umsatz-2025']"); f.fill("4'200'000"); f.press("Enter"); pg.wait_for_timeout(700)
    z = pg.evaluate("() => TEST.daten.qm_jahreswerte.filter(x => x.jahr === 2025 && x.schluessel === 'umsatz')")
    pruefe(len(z) == 1 and z[0]["wert"] == 4200000, "Umsatz 2025 gespeichert: %s" % z)
    f = pg.locator("[data-qmfeld='umsatz-2025']"); f.fill("4300000"); f.press("Enter"); pg.wait_for_timeout(700)
    z = pg.evaluate("() => TEST.daten.qm_jahreswerte.filter(x => x.jahr === 2025 && x.schluessel === 'umsatz')")
    pruefe(len(z) == 1 and z[0]["wert"] == 4300000, "Ändern überschreibt, keine doppelte Zeile: %s" % z)
    pg.click("#qm-frueher"); pg.wait_for_timeout(300)
    pruefe(pg.locator("[data-qmfeld='umsatz-2021']").count() == 1, "+ Jahr zeigt ein früheres Jahr")
    pg.screenshot(path=BILD + "/qm-zahlen.png", full_page=True)

    # Messgrössen: Vorschlag, Ziel, Ampel, Massnahme daraus
    pg.click("[data-qmreiter='messgroessen']"); pg.wait_for_selector("#qm-messgroessen")
    pg.click("#qm-vorschlag"); pg.wait_for_timeout(800)
    n = pg.evaluate("() => TEST.daten.qm_messgroessen.length")
    pruefe(n >= 15, "Vorschlag übernommen: %d Messgrössen" % n)
    mid = pg.evaluate("() => TEST.daten.qm_messgroessen.find(x => x.schluessel === 'ebit_marge_pct').id")
    pg.click(f"[data-mgbearb='{mid}']"); d = dialog(pg)
    d.locator("[id$='ziel']").fill("14"); d.locator("[id$='gelb']").fill("12")
    d.locator(".knopf--haupt").last.click(); pg.wait_for_timeout(800)
    zeile = pg.locator(f"[data-messgroesse='{mid}']")
    farben = zeile.locator("[data-ampel]").evaluate_all("l => l.map(x => x.dataset.ampel)")
    pruefe("gelb" in farben, "EBIT-Marge 13 bei Ziel 14 gelb: %s" % farben)
    # Von Hand: Kundenreklamationen eintippen
    kid = pg.evaluate("() => TEST.daten.qm_messgroessen.find(x => x.name === 'Kundenreklamationen').id")
    f = pg.locator(f"[data-qmfeld='mg-{kid}-2025']"); f.fill("3"); f.press("Enter"); pg.wait_for_timeout(700)
    pruefe(pg.evaluate(f"() => (TEST.daten.qm_jahreswerte.find(x => x.schluessel === 'mg:{kid}') || {{}}).wert") == 3, "Messwert von Hand gespeichert")
    pg.screenshot(path=BILD + "/qm-messgroessen.png", full_page=True)
    pg.click(f"[data-mgmassnahme='{mid}']"); d = dialog(pg)
    pruefe("EBIT" in d.locator("[id$='thema']").input_value(), "Massnahme aus Messgrösse vorausgefüllt")
    d.locator("[id$='massnahme']").fill("Stundensätze überprüfen")
    d.locator("[id$='wer']").fill("GL")
    d.locator(".knopf--haupt").last.click(); pg.wait_for_timeout(900)
    m = pg.evaluate("() => TEST.daten.qm_massnahmen[0]")
    pruefe(m and m["massnahme"] == "Stundensätze überprüfen" and m["messgroesse_id"] == mid and m["nr"] == 1, "Massnahme mit Messgrösse gespeichert: %s" % m)
    pruefe(pg.locator("#qm-kvp").count() == 1, "danach zurück in der KVP-Liste")
    pruefe(pg.locator(f"[data-massnahme='{m['id']}']").count() == 1, "Massnahme steht in der Liste")

    # Status auf erledigt: fällt aus „Offen“ heraus, steht unter „Wirksamkeit prüfen“
    pg.click(f"[data-massnahme='{m['id']}']"); d = dialog(pg)
    d.locator("[id$='status']").select_option("erledigt")
    d.locator(".knopf--haupt").last.click(); pg.wait_for_timeout(900)
    pruefe(pg.locator(f"[data-massnahme='{m['id']}']").count() == 0, "erledigt nicht mehr unter Offen")
    pg.click("[data-qmfilter='erledigt']"); pg.wait_for_timeout(300)
    pruefe(pg.locator(f"[data-massnahme='{m['id']}']").count() == 1, "erledigt unter Wirksamkeit prüfen")
    pg.screenshot(path=BILD + "/qm-kvp.png", full_page=True)

    # Dunkel und Handy kurz ansehen
    pg.evaluate("document.body.classList.add('dunkel')"); pg.screenshot(path=BILD + "/qm-kvp-dunkel.png")
    pg.evaluate("document.body.classList.remove('dunkel')")
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(400)
    breit = pg.evaluate("document.documentElement.scrollWidth")
    pruefe(breit <= 392, "Handy: Seite rollt nicht seitlich (%d)" % breit)
    pg.screenshot(path=BILD + "/qm-handy.png")
    pruefe(not pf, "keine Fehler auf der Seite: %s" % pf)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
