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

def oeffnen(br, mitBlatt):
    k = """daten.einrichtblatt_app = [];
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
    pg.locator(".dialog button:has-text('Wechsel eintragen')").click(); pg.wait_for_timeout(800)
    z = pg.evaluate("TEST.daten.tool_changes.map(z => z.tool_nr + '|' + (z.bezeichnung || ''))")
    pruefe("beide eingetragen mit Path " + str(z), sorted(z) == ["T200|Path 1", "T3100|Path 3"])
    pruefe("keine Seitenfehler " + str(fe), not fe)
    pg.context.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
