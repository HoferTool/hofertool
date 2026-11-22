# HOFERCAM (seit 1.695.0): Bibliothek reale Werkzeuge aus den Artikeln mit
# kleinem 3D-Bild, Ergänzen, Übernehmen im Fenster Werkzeug; Vorlagen G83
# stehend / angetrieben (Lochkreis + C oder X/Y) und G87 frei geteilt mit Z.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
ART = """() => {
  TEST.daten.articles.push(
    { id: "w1", article_number: "DCMT 11T304-PF 4325", name: "Wendeplatte", description: "Sandvik Wendeplatte", supplier_id: "s1", is_active: true },
    { id: "w2", article_number: "HSS-3.2", name: "Bohrer", description: "Spiralbohrer Ø3.2 HSS", supplier_id: "s2", is_active: true },
    { id: "w3", article_number: "XYZ-999", name: "Wendeplatte", description: "Unbekannt", supplier_id: "s1", is_active: true },
    { id: "w4", article_number: "MTEC 660125-R K10", name: "Ausdrehwerkzeug", description: "Ifanger Ausdreher", supplier_id: "s1", is_active: true });
  TEST.daten.cam_werkzeuge = [];
  TEST.rpc.cam_wz_nutzung = () => [];
}"""
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate(ART)
    pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")

    # Bibliothek als Fenster
    pg.click("#cam-bibliothek-auf")
    pg.wait_for_selector("[data-cam-bib-liste]")
    zeilen = pg.locator("[data-cam-bib-eintrag]")
    pruefe("Alle fünf Werkzeug-Artikel in der Liste", zeilen.count() == 5)
    aus = pg.text_content("[data-cam-bib-eintrag='a:w4'] [data-cam-bib-wz]") or ""
    pruefe("Ausdreher als Bohrstange " + aus, "Bohrstange ab Ø6" in aus and "Schaft Ø6" in aus)
    pg.locator("[data-cam-bib-eintrag='a:w4']").screenshot(path="cam_bib_ausdreher.png")
    st = {pg.text_content(f"[data-cam-bib-eintrag='a:{i}'] [data-cam-bib-nr]"): pg.get_attribute(f"[data-cam-bib-eintrag='a:{i}'] [data-cam-bib-status]", "data-cam-bib-status") for i in ("w1", "w2", "w3")}
    print(st)
    pruefe("DCMT erkannt", st.get("DCMT 11T304-PF 4325") in ("erkannt", "teilweise"))
    pruefe("Unbekannte nur geschätzt", st.get("XYZ-999") == "teilweise")
    wz = pg.text_content("[data-cam-bib-eintrag='a:w1'] [data-cam-bib-wz]") or ""
    pruefe("DCMT mit Kante und Dicke " + wz, "D" in wz and "R0.4" in wz and "Dicke" in wz)
    pruefe("3D-Bild gezeichnet", pg.locator("[data-cam-bib-eintrag='a:w1'] canvas[data-cam-mini3d]").count() == 1)
    pg.fill("[data-cam-bib-such]", "bohrer"); pg.wait_for_timeout(100)
    pruefe("Suche findet Bohrer", zeilen.count() == 1)
    pg.fill("[data-cam-bib-such]", ""); pg.click("[data-cam-bib-filter='teilweise']"); pg.wait_for_timeout(100)
    pruefe("Filter teilweise", zeilen.count() >= 2 and pg.locator("[data-cam-bib-eintrag='a:w1']").count() == 0)
    pg.click("[data-cam-bib-ergaenzen='a:w3']")
    pg.wait_for_selector("[data-cam-bib-edit]")
    pg.click("[data-cam-bib-kein]"); pg.wait_for_timeout(400)
    pruefe("Als kein Werkzeug gespeichert", any(x.get("kein") for x in pg.evaluate("TEST.daten.cam_werkzeuge")))
    pg.click("[data-cam-bib-filter='kein']"); pg.wait_for_timeout(100)
    pruefe("Filter kein Werkzeug", zeilen.count() == 1)
    pruefe("Kein Werkzeug zeigt Fragezeichen", pg.locator("[data-cam-bib-eintrag='a:w3'] [data-cam-mini3d='leer']").count() == 1)
    pg.click("[data-cam-bib-zu]")

    # Übernehmen im Fenster Werkzeug
    pg.click("#cam-neu-dreh"); pg.click("[data-camwz-auf='0']")
    pg.click("[data-camwz-bib]"); pg.wait_for_selector("[data-camwz-bibliste] [data-cam-bib-waehlen]")
    pruefe("Nur Drehwerkzeuge zur Wahl", pg.locator("[data-camwz-bibliste] [data-cam-bib-waehlen='a:w2']").count() == 0
        and pg.locator("[data-camwz-bibliste] [data-cam-bib-waehlen='a:w3']").count() == 0 and pg.locator("[data-camwz-bibliste] [data-cam-bib-waehlen='a:w1']").count() == 1)
    pg.click("[data-cam-bib-waehlen='a:w1']"); pg.wait_for_timeout(150)
    pruefe("Artikel am Werkzeug", "DCMT" in (pg.text_content("[data-camwz-artikel]") or ""))
    pruefe("Kantenlänge übernommen", float(pg.input_value("[data-camwz='l']") or 0) > 10)
    pruefe("Dicke übernommen", float(pg.input_value("[data-camwz='dicke']") or 0) > 3)
    pruefe("Mini 3D im Fenster", pg.locator("[data-camwz-gross] canvas[data-cam-mini3d]").count() == 1)
    pruefe("Knopf nennt Art.", "Art. DCMT" in (pg.text_content("[data-camwz-auf='0']") or ""))

    # Vorlagen
    def wahl(vid):
        if pg.locator("[data-camvorlage-zurueck]").count(): pg.click("[data-camvorlage-zurueck]")
        pg.click(f"[data-camvorlage-bild='{vid}']")
    def setz(n, v): pg.fill(f"[data-camvorlage-feld='{n}']", v)
    vs = lambda: pg.text_content("[data-camvorlage-vorschau]") or ""
    pg.click("[data-camvorlage-auf='0']"); wahl("g83")
    pruefe("Stehend ohne X/Y-Felder", pg.locator("[data-camvorlage-feld='D']").count() == 0 and pg.locator("[data-camvorlage-feld='XY']").count() == 0)
    for n, v in (("W", "10"), ("Q", "1"), ("F", "0.05"), ("Z", "5")): setz(n, v)
    pruefe("Stehend in der Mitte", vs().split("\n") == ["G0Z5.", "G83W10.Q1000F0.05", "G80"])
    pruefe("Drehwerkzeug fest stehend", pg.locator("[data-camvorlage-fest='art:stehend']").count() == 1)
    pg.click("[data-camvorlage] .cam-vorlage__kopf button[title='Schliessen']")
    pg.click("#cam-neu-seite"); pg.click("[data-camvorlage-auf='1']"); wahl("g83")
    pruefe("Querangetrieben fest angetrieben", pg.locator("[data-camvorlage-fest='art:an']").count() == 1
        and pg.locator("[data-camvorlage-wahl='art:stehend']").count() == 0)
    for n, v in (("W", "10"), ("Q", "1"), ("F", "0.05"), ("Z", "5")): setz(n, v)
    setz("D", "12"); setz("N", "4"); setz("C", "15")
    pruefe("Lochkreis mit C", vs().split("\n") == ["G0Z5.", "G0X12.C15.", "G83W10.Q1000F0.05", "C105.", "C195.", "C285.", "G80"])
    setz("CF", "0; 45; 200")
    pruefe("Freie Winkel", "C45.\nC200." in vs() and "G0X12.C0." in vs())
    pg.click("[data-camvorlage-wahl='lage:xy']")
    setz("XY", "6/0; 0/3")
    pruefe("X/Y Positionen", vs().split("\n") == ["G0Z5.", "G0X6.Y0.", "G83W10.Q1000F0.05", "X0.Y3.", "G80", "G0Y0."])
    wahl("g87")
    for n, v in (("XA", "10"), ("X", "2"), ("F", "0.01"), ("CF", "0;90;135"), ("ZL", "-3;-5;-7")): setz(n, v)
    v = vs()
    pruefe("G87 frei mit Z je Bohrung", "G0C90.(BOHRUNG 2)\nG0Z-5." in v and v.count("G87X2.") == 3 and "WHILE" not in v)
    setz("ZL", "-3;-5")
    pruefe("Falsche Anzahl Z meldet", "3 Bohrungen" in (pg.text_content("[data-camvorlage]") or ""))
    setz("ZL", ""); setz("CF", "")
    pruefe("Ohne freie Werte die Schleife", "WHILE[#102GE#0]DO1" in vs() and "G0C0.(START C)" in vs())
    pg.screenshot(path="cam_bibliothek.png")
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
