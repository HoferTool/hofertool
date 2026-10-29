# Statistik, Wahl der Maschinen (1.263.0). Vorlage aus statistik.py
# Statistik (1.159.0): Ausstoss, Produktionszeit aus Stückzeit,
# Auslastung (10 h = 100 %), Übergang vom Beenden zum nächsten
# laufenden Auftrag und Werkzeug aus den Bestellungen. Externe sehen
# die Seite nicht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []

DATEN = """(() => {
  const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  // Ein Werktag Di bis Fr vor heute, damit der Vortag auch ein Werktag ist
  let d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - 1);
  while (d.getDay() < 2 || d.getDay() > 5) d.setDate(d.getDate() - 1);
  const vor = new Date(d); vor.setDate(vor.getDate() - 1);
  const um = (t, h) => { const x = new Date(t); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const D = TEST.daten;
  const vorlage = D.jobs.find(j => j.machine_id === 'm-k1');
  D.jobs.forEach(j => { if (j.machine_id === 'm-k1') { j.started_at = null; j.ended_at = null; j.plan_status = 'geplant'; } });
  D.jobs.push({ ...vorlage, id: 'sA', job_number: '10111-0001', fa_nr: '4711', plan_status: 'fertig',
    started_at: um(vor, 7), ended_at: um(d, 10), target_quantity: 800 });
  // Lief schon vor dem ersten Eintrag: dessen Stand ist die Startmenge (1.160.0)
  D.jobs.push({ ...vorlage, id: 'sC', job_number: '10333-0003', plan_status: 'fertig',
    started_at: um(new Date(vor.getTime() - 30 * 864e5), 7), ended_at: um(new Date(vor.getTime() - 20 * 864e5), 6), target_quantity: 90000 });
  D.jobs.push({ ...vorlage, id: 'sB', job_number: '10222-0002', plan_status: 'laeuft',
    started_at: um(d, 12), ended_at: null, target_quantity: 1000 });
  D.production_records = D.production_records.filter(z => z.machine_id !== 'm-k1');
  D.production_records.push(
    { id: 's1', machine_id: 'm-k1', job_id: 'sA', record_date: iso(vor), quantity: 500 },
    { id: 's2', machine_id: 'm-k1', job_id: 'sA', record_date: iso(d), quantity: 800 },
    { id: 's3', machine_id: 'm-k1', job_id: 'sB', record_date: iso(d), quantity: 200 },
    { id: 's0', machine_id: 'm-k1', job_id: 'sC', record_date: iso(vor), quantity: 50000 });
  // 72 s und 36 s: Vortag 500 × 72 = 10 h, Tag 300 × 72 + 200 × 36 = 8 h
  D.hoco_type_data.push({ hoco_nr: '10111-0001', type_id: 't2', stueckzeit_s: 72 },
                        { hoco_nr: '10222-0002', type_id: 't2', stueckzeit_s: 36 },
                        { hoco_nr: '10333-0003', type_id: 't2', stueckzeit_s: 60 });
  D.articles.push({ id: 'a9', article_number: 'BOHR-42', name: 'Bohrer 4.2', unit: 'Stück', supplier_id: 's1', is_active: true });
  D.order_items.push({ id: 'o9', article_id: 'a9', supplier_id: 's1', quantity: 12, status: 'bestellt',
    ziel_art: 'maschine', ziel_text: 'Tornos M1 K-2001', created_at: um(vor, 8), ordered_at: um(d, 9) });
  D.qs_ausschuss = [{ id: 'q1', machine_id: 'm-k1', job_id: 'sB', hoco_nr: '10222-0002', stueck: 50,
    notiz: 'Grat', erstellt_am: um(d, 14), erstellt_name: 'Saheesan' }];
  return iso(d);
})()"""

def neu(br, rolle=None, breite=1500, hoehe=950, dunkel=False):
    ctx = br.new_context(viewport={"width": breite, "height": hoehe}, timezone_id="Europe/Zurich",
                         color_scheme="dark" if dunkel else "light")
    pg = ctx.new_page()
    # Feste Uhr nach dem Stichtag (STATISTIK_AB), damit die Beispieltage
    # immer gezählt werden, egal an welchem Tag der Test läuft
    pg.clock.set_fixed_time("2026-11-05T12:00:00+01:00")
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    # m-l2 steht in einem externen Park: die Statistik lässt sie weg (1.192.0)
    body = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
        "daten.machine_parks.push({ id: 'p-ext', name: 'Extern', is_active: true });\n"
        "daten.machines.find(m => m.id === 'm-l2').park_id = 'p-ext';\n"
        "if (typeof window !== \"undefined\") window.TEST = TEST;")
    if rolle:
        body = body.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
            "daten.profiles[0].role = '" + rolle + "';\nif (typeof window !== \"undefined\") window.TEST = TEST;")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**",
              "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    return pg

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = neu(br)
    pg.evaluate(DATEN); pg.wait_for_timeout(800)
    pg.evaluate("location.hash='#/statistik'")
    pg.wait_for_selector("#st-auslastung", timeout=15000); pg.wait_for_timeout(500)
    alle = pg.locator("#st-maschinen-tabelle tr[data-stmaschine]").count()
    if "alle" not in pg.inner_text("#st-wahl-knopf"): fehler.append("Knopf nicht auf alle: " + pg.inner_text("#st-wahl-knopf"))
    pg.click("#st-wahl-knopf"); pg.wait_for_selector("#st-wahl")
    pg.screenshot(path="statistik-wahl.png", full_page=True)
    # m-k1 abwählen
    m = pg.locator(".st-wahl__m", has_text="K-2001").locator("input")
    m.uncheck(); pg.wait_for_timeout(400)
    if pg.locator("#st-maschinen-tabelle tr[data-stmaschine='m-k1']").count(): fehler.append("m-k1 trotz Abwahl in der Tabelle")
    n = pg.locator("#st-maschinen-tabelle tr[data-stmaschine]").count()
    if n != alle - 1: fehler.append(f"{n} Maschinen statt {alle - 1}")
    if "1'000" in pg.inner_text("#st-k-ausstoss"): fehler.append("Ausstoss zählt m-k1 noch: " + pg.inner_text("#st-k-ausstoss"))
    knopf = pg.inner_text("#st-wahl-knopf")
    if f"{alle - 1} von {alle}" not in knopf: fehler.append("Knopf zeigt " + knopf)
    teil = pg.evaluate("[...document.querySelectorAll('.st-wahl__parkname input')].some(i => i.indeterminate)")
    if not teil: fehler.append("Park nicht als teilweise gewählt markiert")
    pg.screenshot(path="statistik-wahl-ohne.png", full_page=True)
    # Werkzeug: Bestellung für K-2001 fällt weg
    pg.evaluate("document.querySelector('#inhalt [data-streiter=werkzeug]').click()"); pg.wait_for_selector("#st-wz-artikel"); pg.wait_for_timeout(300)
    if "Positionen mit Ziel einer gewählten" not in pg.inner_text("#inhalt"): fehler.append("Hinweis im Werkzeug fehlt")
    if "BOHR-42" in pg.inner_text("#st-wz-artikel"): fehler.append("Bohrer trotz Abwahl im Werkzeug")
    # Gemerkt nach Neuladen
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(1500)
    pg.evaluate("location.hash='#/statistik'"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#inhalt [data-streiter=maschinen]').click()"); pg.wait_for_selector("#st-auslastung", timeout=15000); pg.wait_for_timeout(400)
    if pg.locator("#st-maschinen-tabelle tr[data-stmaschine='m-k1']").count(): fehler.append("Wahl nach Neuladen nicht gemerkt")
    # Keine, dann Alle
    pg.click("#st-wahl-knopf"); pg.wait_for_selector("#st-wahl")
    pg.click("[data-stwahl='keine']"); pg.wait_for_timeout(300)
    if not pg.locator("#st-keine").count(): fehler.append("Kein Hinweis ohne Maschine")
    pg.click("[data-stwahl='alle']"); pg.wait_for_timeout(300)
    if pg.locator("#st-maschinen-tabelle tr[data-stmaschine]").count() != alle: fehler.append("Alle bringt nicht alle zurück")
    # Handy
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
    breit = pg.evaluate("document.documentElement.scrollWidth")
    if breit > 392: fehler.append(f"Handy rollt seitlich: {breit}")
    pg.screenshot(path="statistik-wahl-handy.png", full_page=True)
    br.close()

print("Fehler:", "keine" if not fehler else "\n" + "\n".join(fehler))
