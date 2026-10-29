# Werkzeugwechsel-Protokoll beim Index (Wunsch Patrick 29. Oktober 2026):
# nur Plätze aus dem Einrichtblatt, sechs Spalten je Blatt, neuer FA mit
# Trennlinie, nur die letzten drei Blätter bleiben
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
daten.jobs.forEach(j => {
  daten.einrichtblatt_app.push({ id: 'eb' + j.id, hoco_nr: j.job_number, type_id: 't1',
    plaetze: { 'R1-T3': { taetigkeit: 'SCHLICHTER', hersteller: 'Utilis' }, 'R2-T2': { taetigkeit: 'ECO CUT D8' }, 'R3-T4': { taetigkeit: 'SCHLICHTER' }, 'R3-T5': {} } });
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
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-tool]")
    tools = pg.locator("[data-tool]").evaluate_all("e => e.map(x => x.dataset.tool)")
    pruefe("Werkzeugwechsel wie vorher, nur Plätze aus dem Blatt " + str(tools), tools == ["T3", "T2", "T4"])
    pg.locator(".wz-path").filter(has_text="Revolver 1").locator("[data-tool='T3']").click()
    pg.locator(".wz-path").filter(has_text="Revolver 3").locator("[data-tool='T4']").click()
    pg.click("[data-wzweiter]")
    pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle input").first.fill("2500")
    pg.locator("button:has-text('Wechsel eintragen')").last.click(); pg.wait_for_timeout(1500)
    hoco = pg.evaluate("() => TEST.daten.tool_changes.find(z => z.stueckzahl === 2500).hoco_nr")
    tc = pg.evaluate("h => TEST.daten.tool_changes.filter(z => z.hoco_nr === h)", hoco)
    neu = [z for z in tc if z["stueckzahl"] == 2500]
    pruefe("zwei neu mit Revolver " + str([(z["tool_nr"], z["bezeichnung"]) for z in neu]),
           sorted((z["tool_nr"], z["bezeichnung"]) for z in neu) == [("T3", "Revolver 1"), ("T4", "Revolver 3")])
    runden = len(set((z["gewechselt_am"], z["stueckzahl"]) for z in tc))
    pruefe("älteste Blatt gelöscht, 13 Runden übrig: " + str(runden), runden == 13)

    # Historie bleibt, ihr PDF ist beim Index das Protokoll
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-wzhistorie]")
    pg.click("[data-wzhistorie]"); pg.wait_for_selector("[data-wzpdf]")
    with pg.context.expect_page() as neu_seite:
        pg.click("[data-wzpdf]")
    blatt = neu_seite.value
    blatt.wait_for_selector(".seite", timeout=15000); blatt.wait_for_timeout(500)
    pruefe("drei Blätter im PDF", blatt.locator(".seite").count() == 3)
    pruefe("Titel Werkzeugwechselprotokoll", "Werkzeugwechselprotokoll" in blatt.locator("h1").first.inner_text())
    pruefe("nur Plätze mit Werkzeug", blatt.locator(".seite").first.locator("td.nr").all_inner_texts() == ["T3", "T2", "T4"])
    lab = blatt.locator(".neu").all_inner_texts()
    pruefe("Neuer FA über der Linie " + str(lab), len(lab) == 1 and lab[0].startswith("Neuer FA "))
    pruefe("Spalten je Blatt 6", blatt.locator(".seite").first.locator("thead tr").nth(1).locator("th.sp").count() == 6)
    blatt.set_viewport_size({"width": 1200, "height": 900})
    blatt.screenshot(path="/tmp/claude-0/ixp-pdf.png", full_page=True)
    pruefe("keine Seitenfehler " + str(fe), not fe)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
