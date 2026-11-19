# „Protokoll WW“ bei der HOCO Nr. wird frisch aus den Wechseln gerechnet,
# nicht die alte abgelegte Datei gezeigt (Patrick 19. November 2026:
# „warum ist das leer“, „nicht das typische von Index“)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

K = """daten.machine_types[0].name = 'Index';
daten.type_paths = [1, 2, 3].map(n => ({ id: 'rv' + n, type_id: 't1', name: 'Revolver ' + n, nummer: n, sortierung: n, nr_mit_path: true }));
daten.type_slots = [];
[1, 2, 3].forEach(n => { for (let t = 1; t <= 10; t++) daten.type_slots.push({ id: 's' + n + '-' + t, path_id: 'rv' + n,
  bezeichnung: null, kind_id: 'k1', platz_nr: t, tool_nr: 'T' + t, werkzeuge: 1, hinweis: null, sortierung: t }); });
daten.einrichtblatt_app = [];
daten.jobs.forEach(j => { if (/^m-l/.test(j.machine_id)) j.wz_historie_url = 'https://x.invalid/alt.html'; });
daten.jobs.forEach(j => {
  daten.einrichtblatt_app.push({ id: 'eb' + j.id, hoco_nr: j.job_number, type_id: 't1',
    plaetze: { 'R1-T1': { taetigkeit: 'ANSCHLAG' }, 'R1-T3': { taetigkeit: 'SCHLICHTER', hersteller: 'Utilis' }, 'R2-T2': { taetigkeit: 'ECO CUT D8' }, 'R3-T4': { taetigkeit: 'SCHLICHTER' }, 'R3-T5': {} } });
  if (!/^m-l/.test(j.machine_id)) return;
  const anderer = daten.jobs.find(x => x.id !== j.id && /^m-k/.test(x.machine_id));
  for (let i = 0; i < 18; i++) {
    const wann = new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString();
    daten.tool_changes.push({ id: 'tc-' + j.id + '-' + i, machine_id: j.machine_id, job_id: i < 12 ? anderer.id : j.id,
      hoco_nr: j.job_number, tool_nr: i % 2 ? 'T3' : 'T2', bezeichnung: i % 2 ? 'Revolver 1' : 'Revolver 2',
      stueckzahl: 100 * i, notiz: null, gewechselt_am: wann });
  }
});"""
f = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=f))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**", "**://x.invalid/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    hoco = pg.evaluate("() => TEST.daten.jobs.find(j => j.wz_historie_url).job_number")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1200)
    pg.fill("#hoco-such", hoco); pg.wait_for_timeout(500)
    pg.locator(f"[data-hoco-auf='{hoco}']").first.click(); pg.wait_for_timeout(1500)
    knopf = pg.locator(".hocoteil__anhang--wz").first
    pruefe("Knopf Protokoll WW da", knopf.count() == 1)
    with ctx.expect_page() as neu:
        knopf.click()
    w = neu.value; w.wait_for_timeout(2500)
    html = w.content()
    pruefe("Index-Protokoll statt Plattenwechsel", "Werkzeugwechselprotokoll" in html and "Plattenwechsel" not in html)
    pruefe("ausgefüllt mit Wechseln", w.locator("td.sp b").count() > 0)
    w.screenshot(path="/tmp/claude-0/protokoll_ww.png")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
