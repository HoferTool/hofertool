# Produktion → Infos zum Richten: Maschinen mit dem Auftrag, der dran
# ist, Stand des Einrichtblatts, Bearbeiten öffnet das Blatt gleich zum
# Ändern, ein Excel wird vorher eingelesen, andere HOCO Nr. öffnen,
# seit 1.181.0 Suche oben nach HOCO Nr., Maschinen nach Park und Typ.
import time, base64, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
HIER = os.path.dirname(os.path.abspath(__file__))
XL = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + base64.b64encode(
    open(os.path.join(HIER, "einrichtblatt-app-beispiel.xlsx"), "rb").read()).decode()
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1500, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""(XL) => {
      const D = TEST.daten;
      const m = D.machines.find(x => x.id === 'm-k1'); m.type_id = 't1';
      D.jobs = D.jobs.filter(j => j.machine_id !== 'm-k1');
      D.jobs.push({ id: 'rH', job_number: '10000-0301', machine_id: 'm-k1', plan_status: 'laeuft', ended_at: null,
        planned_days: 3, target_quantity: 1000, planned_from: new Date().toISOString().slice(0, 10) });
      D.hoco_type_data.push({ hoco_nr: '10000-0301', type_id: 't1', blatt_url: XL, stueckzeit_s: null });
      D.einrichtblatt_app = [{ id: 'eo', hoco_nr: '10000-0999', type_id: 't1', programme: {}, plaetze: {}, kopf: {},
        seiten: [], bemerkung: 'Fabrik-Auftr. Nr.: 2023/5189\\nAbgreifen mit Zange', gut_am: null, geaendert_am: new Date().toISOString() }];
      D.artikel_bild = []; D.eb_bilder = [];
    }""", XL)
    pg.evaluate("location.hash='#produktion'"); pg.wait_for_timeout(1200)
    pg.click("[data-unter='produktion/richten']"); pg.wait_for_selector("[data-richten]"); pg.wait_for_timeout(1000)
    pruefe("Keine Liste „An den Maschinen“ mehr", pg.locator("[data-richten-maschine]").count() == 0)
    pruefe("Keine Liste „Noch nicht bestätigt“ mehr", "Noch nicht bestätigt" not in pg.inner_text("[data-richten]"))
    pruefe("Suche ganz oben", pg.evaluate("document.querySelector('[data-richten]').firstElementChild.querySelector('[data-richten-suche]') !== null"))
    pruefe("Zuletzt bearbeitet nach Park und Typ", pg.locator("[data-richten-letzte] [data-richten-park] [data-richten-typ-gruppe='t1'] [data-richten-letzt='10000-0999']").count() >= 1)
    # Filter nach Typ (1.183.0)
    knoepfe = pg.eval_on_selector_all("[data-richten-typfilter]", "l => l.map(e => e.dataset.richtenTypfilter)")
    pruefe("Typfilter da " + str(knoepfe), "t1" in knoepfe and len(knoepfe) >= 3)
    anderer = [k for k in knoepfe if k and k != "t1"][0]
    pg.click(f"[data-richten-typfilter='{anderer}']"); pg.wait_for_timeout(300)
    pruefe("Anderer Typ blendet t1 aus", pg.locator("[data-richten-letzt='10000-0999']").count() == 0)
    pg.click("[data-richten-typfilter='t1']"); pg.wait_for_timeout(300)
    pruefe("Typ t1 zeigt sein Blatt", pg.locator("[data-richten-letzt='10000-0999']").count() >= 1
           and pg.locator(f"[data-richten-typ-gruppe='{anderer}']").count() == 0)
    pg.screenshot(path="produktion_richten_typ.png")
    pg.click("[data-richten-typfilter='']"); pg.wait_for_timeout(300)
    # Suche ohne Bindestrich findet die HOCO Nr. mit ihren Blättern
    pg.fill("[data-richten-suche]", "10000 0999"); pg.wait_for_timeout(900)
    t = pg.locator("[data-richten-hoco-treffer='10000-0999']")
    pruefe("Suche findet HOCO Nr. mit Blatt", t.count() == 1 and "noch nicht bestätigt" in t.inner_text())
    pruefe("Bei der Suche keine Liste der letzten", pg.locator("[data-richten-letzte]").count() == 0)
    pg.screenshot(path="produktion_richten_suche.png")
    pg.fill("[data-richten-suche]", "0301"); pg.wait_for_timeout(900)
    t = pg.locator("[data-richten-hoco-treffer='10000-0301']")
    pruefe("Treffer zeigt Maschine und Excel", t.count() == 1 and "Nur Excel" in t.inner_text() and "läuft auf" in t.inner_text())
    pg.focus("[data-richten-suche]"); pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    pruefe("Escape leert die Suche " + pg.evaluate("location.hash"), pg.input_value("[data-richten-suche]") == "" and pg.locator("[data-richten]").count() == 1)
    pg.wait_for_timeout(500)
    pg.screenshot(path="produktion_richten.png")
    # Dunkler Modus: Auswahlfelder dunkel mit heller Schrift (war weiss auf weiss)
    pg.evaluate("document.body.classList.add('dunkel')"); pg.wait_for_timeout(200)
    f = pg.evaluate("""() => { const s = getComputedStyle(document.querySelector('[data-richten-suche]'));
      return [s.backgroundColor, s.color]; }""")
    pruefe("Dunkel: Auswahlfeld lesbar " + str(f), f[0] != "rgb(255, 255, 255)" and f[1] == "rgb(255, 255, 255)")
    pg.screenshot(path="produktion_richten_dunkel.png")
    pg.evaluate("document.body.classList.remove('dunkel')")

    pg.fill("[data-richten-suche]", "10000-0301"); pg.wait_for_timeout(900)
    pg.locator("[data-richten-hoco-treffer='10000-0301'] [data-richten-bearbeiten]").click(); pg.wait_for_selector("[data-eba-seite]")
    # Seit 1.178.0 liest das Blatt das Excel selbst vor, gespeichert wird mit Speichern
    pg.wait_for_selector("[data-eba-vorgelesen]:has-text('Aus dem Excel vorgelesen')")
    pruefe("Gleich im Bearbeiten", pg.locator("[data-eba-speichern]").count() == 1)
    pg.click("[data-eba-speichern]"); pg.wait_for_timeout(1000)
    pruefe("Excel eingelesen", pg.evaluate("TEST.daten.einrichtblatt_app.some(b => b.hoco_nr === '10000-0301' && b.type_id === 't1')"))
    pg.click(".eba-fenster [data-zu]"); pg.wait_for_timeout(1500)
    pruefe("Stand neu: in der App, nicht bestätigt", "noch nicht bestätigt" in pg.inner_text("[data-richten-hoco-treffer='10000-0301']"))
    pg.fill("[data-richten-suche]", ""); pg.wait_for_timeout(900)
    pruefe("Gespeichertes Blatt bei den letzten", pg.locator("[data-richten-letzt='10000-0301']").count() >= 1)

    # Die FA-Zeile fällt beim Bearbeiten aus der Bemerkung (1.183.1)
    pg.locator("[data-richten-letzt='10000-0999'] [data-richten-bearbeiten]").first.click(); pg.wait_for_selector("[data-eba-seite]")
    v = pg.input_value("[data-eba-feld='blatt:bemerkung']")
    pruefe("Bemerkung ohne FA: " + repr(v), v == "Abgreifen mit Zange")
    pg.click("[data-eba-abbrechen]"); pg.wait_for_timeout(300)
    if pg.locator(".eba-fenster [data-zu]").count(): pg.click(".eba-fenster [data-zu]")
    pg.wait_for_timeout(1200)
    # Andere HOCO Nr. ohne Blatt: über die Suche ein leeres Blatt zum Ausfüllen
    pg.fill("[data-richten-suche]", "10000-0302"); pg.wait_for_timeout(900)
    pg.select_option("[data-richten-neu='10000-0302']", "t1"); pg.wait_for_selector("[data-eba-seite]"); pg.wait_for_timeout(500)
    pruefe("Andere HOCO Nr.: neues Blatt im Bearbeiten", "10000-0302" in pg.inner_text(".eba-fenster .betrachter__titel")
           and pg.locator("[data-eba-speichern]").count() == 1)
    br.close()
print("Fehler:", fehler[:4] if fehler else "keine")
