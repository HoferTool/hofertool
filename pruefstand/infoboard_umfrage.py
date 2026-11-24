# Umfrage mit QR-Code auf der Anzeige (1.762.0, Wunsch Patrick 24. November 2026:
# „Umfragen direkt auf die Anzeige … mit dem QR-Code, da das Infoboard kein Touch ist“)
import time
from pruefstand import server_starten, FAKE, CH, PORT, tagsueber
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
SP = "/tmp/claude-0/-home-user/b4de6780-b9b6-56fd-b3ec-af0e4ff596b0/scratchpad/"
DAZU = """
TEST.daten.umfragen = [{ id: "11111111-2222-3333-4444-555555555555", titel: "Wohin geht der Ausflug?", beschreibung: "Bis Freitag",
  bild_url: null, mehrfach: false, offen: true, qr: false, sort: 0, erstellt_am: "2026-11-17T10:00:00Z" }];
TEST.rpc = TEST.rpc || {};
const BILD = "data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%2240%22 fill=%22orange%22/></svg>";
TEST.rpc.umfrage_qr_lesen = (a) => ({ id: a.p_umfrage, titel: "Wohin geht der Ausflug?", beschreibung: "Bis Freitag",
  mehrfach: false, offen: true, leute: 7, vorschlaege: [{ id: "v-1", text: "Europapark", stimmen: 5, bild_url: BILD }, { id: "v-2", text: "Bowling", stimmen: 2, bild_url: null }], bild_url: BILD });
"""
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 1000}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + DAZU))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    tagsueber(pg)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/infoboard'"); pg.wait_for_selector(".ib-gestalten"); pg.wait_for_timeout(800)
    pruefe(pg.locator("[data-ib='neu-umfrage']").count() == 1, "Knopf „Umfrage mit QR-Code“")
    pg.click("[data-ib='neu-umfrage']"); pg.wait_for_selector("[data-w='hoch']", timeout=5000)
    pg.click("[data-w='hoch']"); pg.wait_for_timeout(1500)
    t = pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'haupt').aufbau.teile.find(t => t.art === 'umfrage')")
    pruefe(t and t["umfrage"] == "11111111-2222-3333-4444-555555555555", "Teil gespeichert: %s" % t)
    pruefe(pg.evaluate("TEST.daten.umfragen[0].qr") is True, "Umfrage per QR erreichbar gemacht")
    sel = f".ib-gestalten [data-ibteil='{t['id']}']"
    pg.wait_for_selector(sel + " .ib-umf__code svg", timeout=5000)
    pruefe(pg.locator(sel + " .ib-umf__liste li").count() == 2, "zwei Vorschläge mit Balken")
    pruefe("7 Personen" in pg.inner_text(sel), "Zahl der Leute")
    pruefe(t["h"] > t["w"], "im Hochformat eingefügt: %s × %s" % (t["w"], t["h"]))
    pz = pg.eval_on_selector_all(sel + " [data-ib-umf-prozent]", "l => l.map(e => e.dataset.ibUmfProzent)")
    pruefe(pz == ["71", "29"], "Prozent am Ganzen: %s" % pz)
    pruefe("71 %" in pg.inner_text(sel), "Prozent steht da")
    pruefe(pg.locator(sel + " .ib-umf__titelbild").count() == 1, "Bild der Umfrage")
    pruefe(pg.locator(sel + " img.ib-umf__vbild").count() == 1, "Bild beim Vorschlag")
    pg.locator(sel).screenshot(path=SP + "infoboard_umfrage_hoch.png")
    pg.click("[data-ib='umfrage-lage']"); pg.wait_for_timeout(1200)
    t2 = pg.evaluate("() => TEST.daten.infoboard.find(z => z.id === 'haupt').aufbau.teile.find(t => t.art === 'umfrage')")
    pruefe(t2["w"] > t2["h"], "auf quer umgestellt: %s × %s" % (t2["w"], t2["h"]))
    pruefe(pg.locator(sel + " .ib-umf__titel").inner_text() == "Wohin geht der Ausflug?", "Frage steht da")
    pg.screenshot(path=SP + "infoboard_umfrage.png")
    pg.locator(sel).screenshot(path=SP + "infoboard_umfrage_teil.png")
    pruefe(not pf, "keine Seitenfehler: %s" % pf)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
