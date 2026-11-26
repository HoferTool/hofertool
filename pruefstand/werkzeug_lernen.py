# Werkzeugwahl lernt (1.872.0): was früher zu einem alten Namen gewählt
# wurde, steht als „Könnte das sein?“ oben, auch wenn der Text gar nicht
# ähnlich ist; ein umbenannter Lieferant (SM Tools → Applitec) sucht
# beim neuen nach ähnlicher Nummer; Wählen lernt über werkzeug_lernen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLER ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""() => { TEST.orFiltern = true;
      TEST.daten.suppliers.push({ id: 'sap', name: 'Applitec' }, { id: 'ssm', name: 'SM Tools' });
      TEST.daten.articles.push(
        { id: 'ap1', article_number: 'ZX-4410', name: 'Platte', unit: 'Stück', description: 'Abstechplatte', supplier_id: 'sap', is_active: true },
        { id: 'ap2', article_number: '7710-600', name: 'Platte', unit: 'Stück', description: null, supplier_id: 'sap', is_active: true },
        { id: 'ap3', article_number: 'QQ-1', name: 'Bohrer', unit: 'Stück', description: null, supplier_id: 'sap', is_active: true });
      TEST.daten.werkzeug_gelernt = [
        { alt_norm: 'smtoolabst25', alt_text: 'SM Tool Abst 2.5', alt_hersteller: 'SM Tools', article_id: 'ap1', anzahl: 2, zuletzt_am: '2026-11-20T10:00:00Z' },
        { alt_norm: 'qq9', alt_text: 'QQ9', alt_hersteller: 'SM Tools', article_id: 'ap3', anzahl: 1, zuletzt_am: '2026-11-20T10:00:00Z' }];
      TEST.rpc.werkzeug_lernen = (a) => null; }""")
    pg.evaluate("location.hash='#bestellungen'")
    pg.wait_for_selector("#best-inhalt .bs-pos"); pg.wait_for_timeout(300)
    pg.click("#b-neu"); pg.wait_for_selector("#pd-such")
    pg.fill("#pd-such", "SM Tool Abst 2.5"); pg.wait_for_timeout(1000)
    t = pg.inner_text("#pd-vorschlag") if pg.locator("#pd-vorschlag").count() else ""
    pruefe("Gleicher alter Name schlägt vor", "ZX-4410" in t and "Könnte das sein" in t and "2× so gewählt" in t)
    pg.fill("#pd-such", "SM Tools 7710 600"); pg.wait_for_timeout(1000)
    t = pg.inner_text("#pd-vorschlag") if pg.locator("#pd-vorschlag").count() else ""
    pruefe("Umbenannter Lieferant sucht dort", "7710-600" in t and "heisst jetzt Applitec" in t)
    pg.screenshot(path="/tmp/claude-0/-home-user/a9a8f3b7-9082-5cb7-bc06-7760ff3612d6/scratchpad/lernen.png")
    pg.fill("#pd-such", "ganz anders"); pg.wait_for_timeout(1000)
    pruefe("Nichts Gelerntes, kein Vorschlag", pg.locator("#pd-vorschlag").count() == 0)
    pg.fill("#pd-such", "SM Tool Abst 2.5"); pg.wait_for_timeout(1000)
    pg.click("#pd-vorschlag [data-vorschlag='ap1']"); pg.wait_for_timeout(400)
    pruefe("Vorschlag gewählt", "ZX-4410" in pg.inner_text("#pd-gewaehlt"))
    rpc = pg.evaluate("TEST.protokoll.filter(x => x.art === 'rpc' && x.name === 'werkzeug_lernen').map(x => x.args)")
    pruefe("Wählen lernt", len(rpc) == 1 and rpc[0]["p_norm"] == "smtoolabst25" and rpc[0]["p_artikel"] == "ap1")
    br.close()
print("Fehler:", "keine" if not fehler else fehler)
