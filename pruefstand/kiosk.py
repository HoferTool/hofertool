# HOFERTIME Kiosk (1.816.0): Artikel kaufen, Konto belasten, Abrechnen mit
# Rechnung und QR-Einzahlungsschein, Verwalten nur für den Admin von HOFERTIME.
import time, json
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

ART = [{"id": "a1", "name": "Kaffee", "preis": 1.5, "zeichen": "☕", "aktiv": True, "sort": 10},
       {"id": "a2", "name": "Getränk", "preis": 2, "zeichen": "🥤", "aktiv": True, "sort": 20}]
KONTO = [{"id": 1, "daten": {"name": "Hofer + Co. Präzisionsdrehteile", "strasse": "Teststrasse 1", "plz": "4573", "ort": "Lohn-Ammannsegg", "land": "CH", "iban": "CH9300762011623852957"}}]
RPC = """
TEST.rpc.zeit_admin = () => %s;
TEST.rpc.kiosk_abrechnen = (a) => {
  const pid = a.p_person || 'u1';
  const offen = TEST.daten.kiosk_buchungen.filter(b => b.person_id === pid && !b.rechnung_id);
  const summe = offen.reduce((s, b) => s + b.preis * b.menge, 0);
  const r = { id: 'r' + Date.now(), nr: 1, person_id: pid, betrag: summe, erstellt_am: new Date().toISOString() };
  TEST.daten.kiosk_rechnungen.push(r); offen.forEach(b => b.rechnung_id = r.id); return r.id; };
TEST.rpc.kiosk_personen = () => [{ id: 'u1', name: 'Test' }];
"""

def start(p, admin):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e.stack)[:900]))
    body = FAKE + ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = 'admin';\n" + \
        "TEST.daten.zeit_stempel = []; TEST.daten.zeit_personen = []; TEST.daten.zeit_verlauf = [];\n" + \
        "TEST.daten.kiosk_artikel = %s; TEST.daten.kiosk_konto = %s; TEST.daten.kiosk_buchungen = []; TEST.daten.kiosk_rechnungen = [];\n" % (json.dumps(ART), json.dumps(KONTO)) + \
        "TEST.rpc.zeit_abwesenheiten = () => [];\n" + RPC % ("true" if admin else "false")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/hofertime/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt", state="attached"); pg.wait_for_timeout(1200)
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_selector("#ze-reiter-kiosk")
    return br, pg, pf

with sync_playwright() as p:
    br, pg, pf = start(p, False)
    pg.click("#ze-reiter-kiosk"); pg.wait_for_selector("[data-ki-artikel='Kaffee']")
    pruefe(pg.locator("#ki-teil-verwalten").count() == 0, "Nicht-Admin sieht Verwalten nicht")
    pg.click("[data-ki-artikel='Kaffee']"); pg.wait_for_timeout(500)
    pg.click("[data-ki-artikel='Getränk']"); pg.wait_for_timeout(500)
    pruefe("3.50" in pg.inner_text("#ki-offen"), "offen CHF 3.50: " + pg.inner_text("#ki-offen"))
    pruefe(pg.locator("#ki-offene [data-ki-weg]").count() == 2, "frische Käufe lassen sich zurücknehmen")
    pg.locator("#ki-offene [data-ki-weg]").first.click(); pg.wait_for_timeout(600)
    pruefe(pg.evaluate("TEST.daten.kiosk_buchungen.length") == 1, "Zurücknehmen löscht den Kauf")
    pg.click("#ki-abrechnen"); pg.wait_for_timeout(500)
    pg.locator(".dialog-huelle button", has_text="Abrechnen").last.click(); pg.wait_for_timeout(1500)
    pruefe(pg.evaluate("TEST.daten.kiosk_rechnungen.length") == 1, "Abrechnen legt Rechnung an")
    pruefe(pg.locator("#ki-rechnungen [data-ki-rechnung]").count() >= 1, "Rechnung steht in der Liste")
    pruefe(not pf, "keine Seitenfehler: " + "; ".join(pf)[:400])
    br.close()
    br, pg, pf = start(p, True)
    pg.click("#ze-reiter-kiosk"); pg.wait_for_selector("#ki-teil-verwalten"); pg.click("#ki-teil-verwalten")
    pg.wait_for_selector("#ki-konto")
    pruefe(pg.locator("#ki-artikel-liste [data-ki-verwalten]").count() == 2, "Admin sieht Artikelliste")
    pruefe(pg.locator("#ki-artikel-neu").count() == 1, "Knopf + Artikel da")
    pruefe(not pf, "keine Seitenfehler (Admin): " + "; ".join(pf)[:400])
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
