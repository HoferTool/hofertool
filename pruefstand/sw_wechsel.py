# Werkzeugwechsel bei SW (Wunsch Patrick 29. Oktober 2026): Karten je
# Werkzeug mit Stück seit Wechsel und realistischer Standzeit für den
# Tool Life Counter, darunter der Verlauf zum Ändern und Löschen
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

K = """daten.machine_types[0].name = 'SW-20';
daten.type_paths = [1, 2, 3].map(n => ({ id: 'p' + n, type_id: 't1', name: 'Path ' + n, nummer: n, sortierung: n, nr_mit_path: false }));
daten.type_slots = [['p1', 'T100'], ['p1', 'T200'], ['p3', 'T1100'], ['p3', 'T1600'], ['p2', 'T2100']].map(([p, t], i) =>
  ({ id: 'sl' + i, path_id: p, bezeichnung: null, kind_id: 'k1', platz_nr: i, tool_nr: t, werkzeuge: 1, hinweis: null, sortierung: i }));
daten.einrichtblatt_app = [];
daten.jobs.forEach(j => {
  daten.einrichtblatt_app.push({ id: 'eb' + j.id, hoco_nr: j.job_number, type_id: 't1',
    plaetze: { T100: { taetigkeit: 'Vordrehen' }, T1600: { taetigkeit: 'Bohren D3', standzeit: 600 }, T2100: { taetigkeit: 'Abstechen' } } });
  if (!/^m-l/.test(j.machine_id)) return;
  // T1600 hielt 500, 500, 480, 520 und einmal nur 60 (Bruch): sicher
  [0, 500, 1000, 1480, 2000, 2060].forEach((n, i) => daten.tool_changes.push({ id: 'tc-' + j.id + '-' + i,
    machine_id: j.machine_id, job_id: j.id, hoco_nr: j.job_number, tool_nr: 'T1600', bezeichnung: 'Path 3',
    stueckzahl: n, notiz: null, gewechselt_am: new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString() }));
  daten.tool_changes.push({ id: 'tc-' + j.id + '-a', machine_id: j.machine_id, job_id: j.id, hoco_nr: j.job_number,
    tool_nr: 'T100', bezeichnung: 'Path 1', stueckzahl: 2060, notiz: null, gewechselt_am: new Date(Date.UTC(2026, 9, 1, 8, 5)).toISOString() });
});"""
f = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1180, "height": 830}).new_page()
    fe = []
    pg.on("pageerror", lambda e: fe.append(str(e)))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=f))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**", "**://x.invalid/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl")
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-swkarte]", timeout=10000)
    karten = pg.locator("[data-swkarte]").evaluate_all("e => e.map(x => x.dataset.swkarte)")
    pruefe("Karten aus dem Blatt, Path 1, 3, 2 " + str(karten), karten == ["T100", "T1600", "T2100"])
    stand = pg.evaluate("() => Number(document.querySelector('[data-swstand]').textContent.replace(/'/g, ''))")
    zahl = pg.locator("[data-swkarte='T1600'] [data-swzahl]").get_attribute("data-swzahl")
    pruefe("T1600: Stück seit Wechsel / 600 aus dem EB " + zahl, zahl.endswith("/600"))
    pruefe("T100 ohne Standzeit", pg.locator("[data-swkarte='T100'] [data-swzahl]").get_attribute("data-swzahl").endswith("/"))
    pg.click("[data-swalle]"); pg.wait_for_timeout(300)
    pruefe("Alle Plätze: 5", pg.locator("[data-swkarte]").count() == 5)
    pg.click("[data-swalle]"); pg.wait_for_timeout(300)
    # Standzeit direkt ändern, sie kommt ins Einrichtblatt
    pg.click("[data-swstandzeit='T1600']"); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle .dialog").last.locator("input").first.fill("480")
    pg.locator("button:has-text('Speichern')").last.click(); pg.wait_for_timeout(900)
    sz = pg.evaluate("() => TEST.daten.einrichtblatt_app.map(b => b.plaetze.T1600 && b.plaetze.T1600.standzeit)")
    pruefe("Standzeit 480 im Einrichtblatt", 480 in sz)
    pruefe("Karte zeigt /480", pg.locator("[data-swkarte='T1600'] [data-swzahl]").get_attribute("data-swzahl").endswith("/480"))
    pg.screenshot(path="/tmp/claude-0/sw-karten.png")
    pruefe("Verlauf nicht sichtbar", pg.locator("[data-swrunde]").count() == 0)
    # Wechsel eintragen
    pg.click("[data-swkarte='T100']"); pg.click("[data-swkarte='T2100']")
    pg.click("[data-sweintragen]"); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle .dialog").last.locator("input").first.fill("3000")
    pg.locator("button:has-text('Wechsel eintragen')").last.click(); pg.wait_for_timeout(1500)
    stk = lambda n: pg.evaluate("n => TEST.daten.tool_changes.filter(z => z.stueckzahl === n).map(z => z.tool_nr + ':' + z.bezeichnung).sort()", n)
    pruefe("zwei neu mit Path " + str(stk(3000)), stk(3000) == ["T100:Path 1", "T2100:Path 2"])
    pg.click("[data-swverlauf]"); pg.wait_for_selector("[data-swrunde]")
    pruefe("Karten im Verlauf weg", pg.locator("[data-swkarte]").count() == 0)
    pruefe("Verlauf zeigt den neuen oben", "3'000" in pg.locator("[data-swrunde]").first.inner_text())
    pg.screenshot(path="/tmp/claude-0/sw-wechsel.png", full_page=True)
    # Werkzeug aus dem Wechsel nehmen
    pg.locator("[data-swrunde]").first.locator("[data-swchip='T2100']").click(); pg.wait_for_timeout(900)
    pruefe("T2100 aus dem Wechsel", stk(3000) == ["T100:Path 1"])
    # Werkzeug nachträglich dazu
    pg.locator("[data-swrunde]").first.locator("[data-swdazu]").click(); pg.wait_for_selector(".statuswahl [data-w='T200']")
    pg.locator(".statuswahl [data-w='T200']").click(); pg.wait_for_timeout(900)
    pruefe("T200 dazu", stk(3000) == ["T100:Path 1", "T200:Path 1"])
    # Stückzahl ändern
    pg.locator("[data-swrunde]").first.locator("[data-swaendern]").click(); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle .dialog").last.locator("input").first.fill("3100")
    pg.locator("button:has-text('Speichern')").last.click(); pg.wait_for_timeout(900)
    pruefe("Stückzahl geändert", len(stk(3100)) == 2 and not stk(3000))
    # Direkt löschen
    pg.locator("[data-swrunde]").first.locator("[data-swweg]").click(); pg.wait_for_selector("[data-ja]")
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1200)
    pruefe("Wechsel gelöscht", not stk(3100))
    # Historie öffnet bei SW dasselbe Fenster, ohne Liste
    pg.click(".dialog-huelle [data-zu]"); pg.wait_for_timeout(400)
    pruefe("keine Liste", pg.locator("[data-wzweg], [data-wzliste]").count() == 0)
    pruefe("keine Seitenfehler " + str(fe), not fe)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
