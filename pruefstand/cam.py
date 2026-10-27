# CAM unter Rechner (1.224.0): Reiter Shortcuts und CAM, Aufbau eines
# SW-Typs (M-Befehl eintragen), Abweichung an einer Maschine („Hier
# anders“ bei Hochdruck an der 121), Programm hochladen und lesen,
# CAM im Typ-Fenster nur bei SW.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright

ZUSATZ = """
;(() => {
  const d = TEST.daten, park = d.machine_parks[0].id;
  d.machine_types.push({ id: "t-sw", name: "SW-20", beschreibung: null, is_active: true, blatt_url: null });
  d.machines.push({ id: "m-sw1", park_id: park, name: "Star SW-20", machine_number: "121", sort_order: 30, is_active: true, type_id: "t-sw" },
                  { id: "m-sw2", park_id: park, name: "Star SW-20", machine_number: "122", sort_order: 31, is_active: true, type_id: "t-sw" });
  d.type_paths.push({ id: "pa-sw1", type_id: "t-sw", name: "Path 1", nummer: 1, sortierung: 1 },
                    { id: "pa-sw2", type_id: "t-sw", name: "Path 2", nummer: 2, sortierung: 2 },
                    { id: "pa-sw3", type_id: "t-sw", name: "Path 3", nummer: 3, sortierung: 3 });
  const platz = (pa, von, bis) => { for (let n = von, i = 1; n <= bis; n += 100, i++)
    d.type_slots.push({ id: "sl-" + n, path_id: pa, bezeichnung: "T" + n, platz_nr: i, tool_nr: "T" + n, werkzeuge: 1, sortierung: i }); };
  platz("pa-sw1", 100, 700); platz("pa-sw2", 2100, 2800); platz("pa-sw3", 1100, 1900);
  d.cam_aufbau = []; d.cam_programme = [];
})();
"""

PROGRAMM = """%
O1234 (10841-0009 FEDERFUEHRUNG)
$1
G50 S6000
M08
T100
G0 X12. Z-0.5
M68 (HOCHDRUCK)
M30
$2
T2100
M200
%
"""

server_starten(); time.sleep(0.4)
fehler = []
def pruefe(t, ok):
    if not ok: fehler.append(t)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160]) if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE + ZUSATZ))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**",
              "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#rechner'")
    pg.wait_for_selector("[data-rech-oben='shortcuts']", state="attached"); pg.wait_for_timeout(300)

    pruefe("Shortcuts zeigt Drehzahl", pg.locator("#r-d").count() == 1)
    pruefe("Unterreiter da", pg.locator("[data-rech='gravur']").count() == 1)
    pg.click("[data-unter='rechner/cam']"); pg.wait_for_selector("#cam-aufbau")
    pruefe("nur SW-Typ zur Wahl", pg.locator("[data-cam-typ]").count() == 1)
    pruefe("Maschinen 121 und 122", pg.locator("[data-cam-maschine]").count() == 2)
    pruefe("Paths des Typs", pg.locator("#cam-paths tr").count() == 3)
    pruefe("Skizze mit 24 Plätzen", pg.locator("[data-sk-platz]").count() == 24)
    pruefe("Vorschlag gestrichelt", pg.locator(".cam-sk-platz--vorschlag").count() == 24)
    pg.locator("#cam-skizze").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    pg.locator(".cam-skizze-huelle").screenshot(path="cam-skizze.png")
    pg.click("[data-sk-platz='T1300']"); pg.wait_for_selector("[data-w='ang_front3']")
    pg.click("[data-w='ang_front3']"); pg.wait_for_timeout(500)
    pruefe("Platz gewählt", pg.evaluate("TEST.daten.cam_aufbau[0].daten.plaetze.T1300.art") == "ang_front3")
    pruefe("nicht mehr Vorschlag", pg.locator("[data-sk-platz='T1300'].cam-sk-platz--vorschlag").count() == 0)

    # Hochdruck beim Typ eintragen
    feld = pg.locator("[data-m='hd_ein'] .cam-code input")
    feld.fill("M68"); feld.press("Enter"); pg.wait_for_timeout(400)
    zeilen = pg.evaluate("TEST.daten.cam_aufbau.filter(z => z.type_id === 't-sw')")
    pruefe("Typ gespeichert", len(zeilen) == 1 and any(m["id"] == "hd_ein" and m["code"] == "M68" for m in zeilen[0]["daten"]["mbefehle"]))
    # Aufgabe eines Paths
    f2 = pg.locator("[data-path='pa-sw1'] input"); f2.fill("Kammsupport vorne"); f2.press("Tab"); pg.wait_for_timeout(400)
    pruefe("Path-Aufgabe gespeichert", pg.evaluate("TEST.daten.cam_aufbau[0].daten.paths['pa-sw1'].aufgabe") == "Kammsupport vorne")
    pruefe("Platz bleibt nach weiterem Speichern", pg.evaluate("TEST.daten.cam_aufbau[0].daten.plaetze.T1300.art") == "ang_front3")

    # Programm hochladen und ansehen
    with pg.expect_file_chooser() as fc:
        pg.click("#cam-programm-hoch")
    fc.value.set_files(files=[{"name": "O1234.txt", "mimeType": "text/plain", "buffer": PROGRAMM.encode()}])
    pg.wait_for_selector("[data-programm]")
    pruefe("HOCO Nr. erkannt", "10841-0009" in pg.inner_text("#cam-programme"))
    pg.click(".cam-liste__name"); pg.wait_for_selector("#cam-gelesen")
    gelesen = pg.inner_text("#cam-gelesen")
    pruefe("Paths gelesen", "$1" in gelesen and "$2" in gelesen)
    pruefe("M-Befehle gelesen", "M08" in gelesen and "M68" in gelesen and "M200" in gelesen)
    pruefe("Werkzeuge gelesen", "T100" in gelesen and "T2100" in gelesen)
    pg.screenshot(path="cam-programm.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 121: Hochdruck ist anders
    pg.click("[data-cam-maschine='121']"); pg.wait_for_selector("#cam-maschine")
    pruefe("Typ-Code sichtbar", "M68" in pg.inner_text("[data-m='hd_ein']"))
    pg.check("[data-anders='hd_ein']"); pg.wait_for_timeout(400)
    f3 = pg.locator("[data-m='hd_ein'] .cam-anders__felder input").first
    f3.fill("M78"); f3.press("Enter"); pg.wait_for_timeout(400)
    m = pg.evaluate("TEST.daten.cam_aufbau.find(z => z.machine_id === 'm-sw1')")
    pruefe("Abweichung gespeichert", m and m["daten"]["anders"]["hd_ein"]["code"] == "M78")
    pruefe("Zeile markiert", pg.locator("[data-m='hd_ein'].cam-anders").count() == 1)
    pg.screenshot(path="cam-maschine.png", full_page=True)

    # Seite Maschinen: Abweichungen an der 121, nicht an anderen Typen
    pg.evaluate("location.hash='#maschinen'"); pg.wait_for_timeout(800)
    park = pg.evaluate("TEST.daten.machine_parks[0].id")
    pg.click(f"[data-mpark='{park}']"); pg.wait_for_timeout(500)
    pg.click("[data-mtyp-einst='t-sw']"); pg.wait_for_selector("#typ-fenster #cam-aufbau")
    pruefe("Typ-Fenster SW zeigt Hochdruck", pg.input_value("#typ-fenster [data-m='hd_ein'] .cam-code input") == "M68")
    pg.wait_for_timeout(500); pg.screenshot(path="cam-typ-fenster.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.click("[data-mtyp-einst='t1']"); pg.wait_for_selector("#typ-fenster")
    pg.wait_for_timeout(600)
    pruefe("anderer Typ ohne CAM", pg.locator("#typ-fenster #cam-aufbau").count() == 0)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    if not pg.locator("[data-mtyp-auf='t-sw'][aria-expanded='true']").count(): pg.click("[data-mtyp-auf='t-sw']"); pg.wait_for_timeout(300)
    pg.click("[data-mmaschine='m-sw1']"); pg.wait_for_selector("#cam-maschine")
    pruefe("Maschinenseite zeigt Abweichung", pg.locator("[data-m='hd_ein'].cam-anders").count() == 1)
    pg.locator("#cam-maschine").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    pg.screenshot(path="cam-maschinen-seite.png")

    # Typ-Fenster: CAM nur bei SW
    pg.evaluate("location.hash='#rechner'"); pg.wait_for_selector("#cam")
    pruefe("CAM-Reiter gemerkt", pg.locator("[data-rech-oben='cam'].aktiv").count() == 1)
    pg.click("[data-unter='rechner/shortcuts']"); pg.wait_for_selector("#r-d")
    pruefe("Shortcuts wieder da", pg.locator("[data-rech='drehzahl'].aktiv").count() == 1)
    br.close()

print("Fehler:", "keine" if not fehler else "\n  " + "\n  ".join(fehler))
