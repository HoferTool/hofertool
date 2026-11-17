# Pad Mode: „Neu beim Einrichtblatt“ (1.614.0). An Maschinen, deren
# Einrichtblatt-Vorlage T3400 hat (SB-20RG, SB-20C), kommt am Dashboard
# einmal je Gerät ein Fenster zur Option T3421–T3423. Andere Typen nie.
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT, tagsueber
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
AN = "if (typeof window !== \"undefined\") window.TEST = TEST;"
AN_NEU = "TEST.neuHinweis = true;\n" + AN

def dashboard(pg):
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(1500)

def lauf(br, typname, bild=None):
    F = FAKE.replace('name: "Star SR-32J"', 'name: "' + typname + '"').replace(AN, AN_NEU)
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
    pg = ctx.new_page(); f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    tagsueber(pg)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    dashboard(pg)
    return ctx, pg, f

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx, pg, f = lauf(br, "SB-20RG")
    d = pg.locator("[data-pad-neu='eb-front34']")
    pruefe("SB-20RG: Fenster „Neu beim Einrichtblatt“", d.count() == 1)
    pruefe("Text nennt T3421 und das Häkchen", "T3421" in d.inner_text() and "Frontangetrieben" in d.inner_text())
    if len(sys.argv) > 1: pg.screenshot(path=sys.argv[1])
    pg.click("[data-pad-neu-ok]"); pg.wait_for_timeout(500)
    pruefe("Verstanden schliesst", pg.locator("[data-pad-neu]").count() == 0)
    pruefe("gemerkt am Gerät", pg.evaluate("!!localStorage.getItem('hofer.pad.neu.eb-front34')"))
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(2500)
    if pg.locator("#pad .pad-stk-zahl").count() == 0:
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_timeout(1500)
    pruefe("kommt danach nicht mehr", pg.locator("[data-pad-neu]").count() == 0)
    pruefe("keine Fehler", not f); ctx.close()

    ctx, pg, f = lauf(br, "Star SR-32J")
    pruefe("SR-32: kein Fenster", pg.locator("[data-pad-neu]").count() == 0)
    pruefe("keine Fehler (SR-32)", not f); ctx.close()
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
