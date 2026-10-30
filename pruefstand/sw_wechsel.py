# Werkzeugwechsel bei SW wie bei den SB-Maschinen (Wunsch Patrick
# 30. Oktober 2026: „mach wieder SW wie bei SB“): normale Platzwahl,
# Historie als Blatt wie beim Star, Wechsel direkt im Blatt löschen
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
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-tool]", timeout=10000)
    pruefe("normale Platzwahl, keine eigene SW-Ansicht", pg.locator("[data-swkarte]").count() == 0)
    tools = pg.locator("[data-tool]").evaluate_all("e => e.map(x => x.dataset.tool)")
    pruefe("Plätze aus dem Blatt, Path 1, 3, 2 " + str(tools), tools == ["T100", "T1600", "T2100"])
    pg.click("[data-wzhistorie]"); pg.wait_for_selector(".wzb-star", timeout=10000); pg.wait_for_timeout(500)
    pruefe("Historie als Star-Blatt", pg.locator(".wzb-star").count() == 1)
    pruefe("keine Liste", pg.locator("[data-wzliste]").count() == 0)
    zeilen = pg.locator(".wzb-star tbody tr:not(.wzb-neu)").count()
    pruefe("Wechsel als Zeilen (" + str(zeilen) + ")", zeilen >= 6)
    pg.screenshot(path="/tmp/claude-0/sw-historie.png")
    vorher = pg.evaluate("TEST.daten.tool_changes.length")
    pg.locator(".wzb-star [data-wzbweg]").last.click(); pg.wait_for_selector("[data-ja]")
    pg.locator(".dialog-huelle [data-ja]").last.click(); pg.wait_for_timeout(1500)
    pruefe("Wechsel direkt gelöscht", pg.evaluate("TEST.daten.tool_changes.length") < vorher)
    pruefe("keine Seitenfehler " + str(fe), not fe)
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
