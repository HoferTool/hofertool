# HOFERTIME (1.626.0): Kommen / Gehen, Tage mit Ist, Soll, Gleitzeit,
# Ferien, Fehlermeldungen, Nachtragen, Konto nur für HOFERTIME, eigene
# App-Adresse ?app=hofertime und Stempel-Terminal.
import time, os, json
from datetime import date, timedelta, datetime
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("ZEIT_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

# Vorgeschichte: letzte Woche ein Tag ohne Gehen
heute = date.today()
d = heute - timedelta(days=1)
while d.weekday() >= 5: d -= timedelta(days=1)
tag_fehlt = d.isoformat()
def iso(tag, hm): return datetime.fromisoformat(tag + "T" + hm).astimezone().isoformat()
STEMPEL = [{"id": "s1", "person_id": "u1", "art": "kommen", "zeit": iso(tag_fehlt, "07:00:00"), "quelle": "pc"}]
EINST = [{"person_id": "u1", "lohnart": "monat", "soll_woche_h": 42.5, "pensum": 100, "saldo_start_tag": (heute - timedelta(days=10)).isoformat(),
          "saldo_start_min": 120, "ferien_tage_jahr": 25, "ferien_uebertrag": 0}]
FERIEN = [{"person": "x", "von": (heute + timedelta(days=20)).isoformat(), "tage": 5, "abwesenheit": "ferien"}]

def start(p, rolle, adresse="hofertime/index.html", extra="", breite=1440, hoehe=900):
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    pg = br.new_context(viewport={"width": breite, "height": hoehe}).new_page()
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e.stack)[:900]))
    body = FAKE + (";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).role = '%s';\n" % rolle) + \
        "TEST.daten.zeit_stempel = %s; TEST.daten.zeit_personen = %s; TEST.daten.zeit_verlauf = [];\n" % (json.dumps(STEMPEL), json.dumps(EINST)) + \
        "TEST.rpc.zeit_abwesenheiten = () => %s; TEST.funktionen = TEST.funktionen || {};\n" % json.dumps(FERIEN) + \
        "TEST.rpc.zeit_umbuchen = (a) => { const b = { id: 'b' + Date.now(), person_id: a.p_person, datum: a.p_datum, tage: a.p_tage, minuten: Math.round(-a.p_tage * 510), notiz: a.p_notiz }; (TEST.daten.zeit_buchungen = TEST.daten.zeit_buchungen || []).push(b); return b; };\n" + \
        "TEST.rpc.zeit_umbuchung_loeschen = (a) => { TEST.daten.zeit_buchungen = (TEST.daten.zeit_buchungen || []).filter(x => x.id !== a.p_id); return true; };\n" + \
        "TEST.funktionen['zeit-konto'] = (b) => { TEST.daten.profiles.push({ id: 'z9', email: 'z@x', full_name: b.name, role: 'mitarbeiter', is_active: true, nur_zeit: true }); return { id: 'z9' }; };\n" + extra
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/{adresse}", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt", state="attached"); pg.wait_for_timeout(1200)
    return br, pg, pf


with sync_playwright() as p:
    br, pg, pf = start(p, "admin", extra="window.__zeitAdmin = true;")
    pg.evaluate("location.hash='#/zeit'"); pg.wait_for_timeout(1200)
    if pg.locator("#ze-gesicht-knopf").count():
        pg.click("#ze-gesicht-knopf"); pg.wait_for_selector("#ze-gesicht")
        pg.wait_for_timeout(4000)
        pruefe(pg.locator(".ze-gesicht__punkt").count() == 8, "8 Punkte für die Fotos")
        pruefe("Foto 1 von 8" in pg.inner_text("#ze-gesicht-auftrag"), "Anweisung Foto 1: " + pg.inner_text("#ze-gesicht-auftrag"))
        pruefe(pg.locator("#ze-gesicht-auf").is_disabled(), "Knopf gesperrt ohne gutes Gesicht")
        pruefe(pg.locator(".ze-gesicht__bild--nein").count() == 1 or pg.locator(".ze-gesicht__hinweis").count() == 1, "Rahmen rot oder Hinweis zur Kamera")
        print("Text:", pg.locator("#ze-gesicht-text").inner_text() if pg.locator("#ze-gesicht-text").count() else pg.inner_text(".ze-gesicht__hinweis"))
        pg.screenshot(path=BILD + "/zeit-gesicht.png")
    else:
        pruefe(False, "Knopf Gesicht fehlt")
    pruefe(not pf, "keine Fehler im Browser: " + str(pf)[:300])
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
