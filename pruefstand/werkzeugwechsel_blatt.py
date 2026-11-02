# Werkzeugwechsel im Pad: Steht das Einrichtblatt in der App, sind nur
# dessen Werkzeuge zur Wahl, „Alle Plätze“ holt die übrigen dazu
# (Wunsch Patrick 26. Oktober 2026)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def oeffnen(br, mitBlatt, zusatz=""):
    k = zusatz + """daten.einrichtblatt_app = [];
if (%s) daten.jobs.forEach(j => daten.einrichtblatt_app.push({ id: 'eb' + j.id, hoco_nr: j.job_number, type_id: 't1',
  plaetze: { T200: { taetigkeit: 'Abstechen', werkzeug: 'Stecher 2 mm' }, T100: {} } }));""" % ("true" if mitBlatt else "false")
    f = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", k + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
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
    return pg, fe

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg, fe = oeffnen(br, False)
    tools = pg.locator("[data-tool]").evaluate_all("e => e.map(x => x.dataset.tool)")
    pruefe("ohne Blatt alle Plätze " + str(tools), tools == ["T100", "T200", "T3100"])
    pruefe("ohne Blatt kein Knopf Alle", pg.locator("[data-wzalle]").count() == 0)
    pg.context.close()

    pg, fe = oeffnen(br, True)
    tools = pg.locator("[data-tool]").evaluate_all("e => e.map(x => x.dataset.tool)")
    pruefe("mit Blatt nur T200 " + str(tools), tools == ["T200"])
    pruefe("Tätigkeit aus dem Blatt", "Abstechen" in pg.locator("[data-tool='T200']").inner_text())
    pg.wait_for_timeout(600); pg.screenshot(path="/tmp/claude-0/wz-blatt.png")
    pg.click("[data-tool='T200']")
    pg.click("[data-wzalle]"); pg.wait_for_timeout(200)
    tools = pg.locator("[data-tool]").evaluate_all("e => e.map(x => x.dataset.tool)")
    pruefe("Alle Plätze " + str(tools), tools == ["T100", "T200", "T3100"])
    pg.click("[data-tool='T3100']")
    pg.click("[data-wzalle]"); pg.wait_for_timeout(200)
    pg.click("[data-wzweiter]")
    pg.wait_for_selector(".dialog input[name='stk'], .dialog input")
    pg.locator(".dialog input").first.fill("1234")
    # Ohne Kürzel geht es nicht (Wunsch Patrick 2. November 2026)
    pg.locator(".dialog button:has-text('Wechsel eintragen')").click(); pg.wait_for_timeout(500)
    pruefe("ohne Kürzel nichts eingetragen", pg.evaluate("(TEST.daten.tool_changes || []).length") == 0)
    pg.locator(".dialog input").nth(1).fill("j")
    pg.locator(".dialog button:has-text('Wechsel eintragen')").click(); pg.wait_for_timeout(500)
    pruefe("ein Buchstabe reicht nicht", pg.evaluate("(TEST.daten.tool_changes || []).length") == 0)
    pruefe("Stückzahl bleibt stehen", pg.locator(".dialog input").first.input_value() == "1234")
    pg.locator(".dialog input").nth(1).fill("jpf")
    pg.screenshot(path="/tmp/claude-0/wz-kuerzel-dialog.png")
    pg.locator(".dialog button:has-text('Wechsel eintragen')").click(); pg.wait_for_timeout(800)
    k = pg.evaluate("TEST.daten.tool_changes.map(z => z.kuerzel)")
    pruefe("Kürzel gross gespeichert " + str(k), k == ["JPF", "JPF"])
    z = pg.evaluate("TEST.daten.tool_changes.map(z => z.tool_nr + '|' + (z.bezeichnung || ''))")
    pruefe("beide eingetragen mit Path " + str(z), sorted(z) == ["T200|Path 1", "T3100|Path 3"])
    # Historie beim Star zeigt das Blatt wie das PDF
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-wzhistorie]")
    pg.click("[data-wzhistorie]"); pg.wait_for_selector(".wzb-star", timeout=10000); pg.wait_for_timeout(500)
    pruefe("Star-Historie als Blatt mit X", pg.locator(".wzb-star [data-wzbx]").count() == 2)
    pruefe("Visum zeigt Kürzel", pg.locator(".wzb-star td[data-wzkuerzel]").first.inner_text().strip() == "JPF")
    pg.locator("[data-wzbneu]").first.click(); pg.click("[data-wzbeintragen]"); pg.wait_for_timeout(400)
    pg.locator(".dialog-huelle .dialog").last.locator("input").first.fill("1500")
    pg.locator(".dialog-huelle .dialog").last.locator("input").nth(1).fill("SH")
    pg.locator("button:has-text('Wechsel eintragen')").last.click(); pg.wait_for_timeout(1500)
    pruefe("Star: neuer Wechsel aus dem Blatt", pg.locator(".wzb-star tbody tr:not(.wzb-neu)").count() == 2)
    pg.screenshot(path="/tmp/claude-0/star-historie.png")
    vis = pg.locator(".wzb-star td[data-wzkuerzel]").evaluate_all("e => e.map(x => x.innerText.trim())")
    pruefe("beide Kürzel im Blatt " + str(vis), sorted(vis) == ["JPF", "SH"])
    # Visum antippen ändert das Kürzel (Wunsch Patrick 2. November 2026)
    pg.locator(".wzb-star td[data-wzbwer]").filter(has_text="SH").click(); pg.wait_for_timeout(400)
    d = pg.locator(".dialog-huelle .dialog").last
    pruefe("Visum öffnet Fenster mit Kürzel", d.locator("input").nth(1).input_value() == "SH")
    d.locator("input").nth(1).fill("et"); d.locator("button:has-text('Speichern')").click(); pg.wait_for_timeout(1200)
    vis = pg.locator(".wzb-star td[data-wzkuerzel]").evaluate_all("e => e.map(x => x.innerText.trim())")
    pruefe("Kürzel über Visum geändert " + str(vis), sorted(vis) == ["ET", "JPF"])
    pruefe("keine Seitenfehler " + str(fe), not fe)
    pg.context.close()

    # Liste (Typ ohne Blatt-Historie): Wer antippen ändert den Eintrag
    pg, fe = oeffnen(br, False, "daten.machine_types.forEach(t => { t.name = 'Fraese X'; });\n"
      + "daten.tool_changes = [{ id: 'tc1', machine_id: daten.machines[0].id, tool_nr: 'T100', stueckzahl: 500, kuerzel: 'AB', gewechselt_am: '2026-11-01T08:00:00Z' }];\n")
    pg.click("[data-wzhistorie]"); pg.wait_for_timeout(1500)
    if pg.locator("td[data-wzwer]").count():
        pg.locator("td[data-wzwer]").first.click(); pg.wait_for_timeout(400)
        d = pg.locator(".dialog-huelle .dialog").last
        d.locator("input").nth(1).fill("jpf"); d.locator("input").first.fill("700")
        d.locator("button:has-text('Speichern')").click(); pg.wait_for_timeout(1200)
        z = pg.evaluate("TEST.daten.tool_changes.map(z => z.kuerzel + '|' + z.stueckzahl)")
        pruefe("Liste: Eintrag geändert " + str(z), "JPF|700" in z)
        pruefe("Liste zeigt neues Kürzel", "JPF" in pg.locator("td[data-wzwer]").first.inner_text())
        pg.screenshot(path="/tmp/claude-0/wz-liste.png")
    else:
        pg.screenshot(path="/tmp/claude-0/wz-liste.png")
        pruefe("Liste mit Wer-Spalte da", False)
    pruefe("keine Seitenfehler Liste " + str(fe), not fe)
    pg.context.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
