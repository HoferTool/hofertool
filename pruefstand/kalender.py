# Kalender (1.240.0, Wunsch Patrick 28. Oktober 2026): eigene Seite im Menü
# für Termine wie Kehrichtabfuhr, auch wiederkehrend, und auf dem Infoboard
# unter der Solaranlage ein Band mit Geburtstagen und den nächsten Terminen.
import time
from datetime import datetime, timedelta
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

heute = datetime.now().date()
MIT = FAKE + """;
TEST.daten.kalender = [{ id: 'k1', titel: 'Kehrichtabfuhr', datum: '%s', wiederholung: 'woche', notiz: 'bis 7 Uhr' }];
TEST.daten.profiles.forEach((x, i) => { x.geburtstag = i === 0 ? '1985-%s' : i === 1 ? '1990-%s' : null; });
""" % ((heute - timedelta(days=14)).isoformat(), heute.strftime("%m-%d"), (heute + timedelta(days=60)).strftime("%m-%d"))

def seite(p, url):
    pg = p.new_page(viewport={"width": 1080, "height": 1920})
    pf = []; pg.on("pageerror", lambda e: pf.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html" + url, wait_until="domcontentloaded")
    return pg, pf

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg, pf = seite(br, "#/kalender")
    pg.wait_for_selector("#kal-naechste"); pg.wait_for_timeout(800)
    t = pg.inner_text("#kal-naechste")
    pruefe("Heute" in t and "Kehrichtabfuhr" in t, "wöchentliche Abfuhr heute in den nächsten Tagen")
    pruefe(t.count("Kehrichtabfuhr") >= 8, "jede Woche einmal in 60 Tagen: %d" % t.count("Kehrichtabfuhr"))
    pruefe("wird 41" in t, "Geburtstag steht im Kalender")
    pruefe(pg.locator("[data-nav='kalender']").count() > 0, "Kalender im Menü")
    # Neuer Termin, alle 2 Wochen
    pg.click("#kal-neu"); pg.wait_for_selector(".dialog-huelle input")
    pg.locator(".dialog-huelle input").first.fill("Papierkörbe leeren")
    pg.locator(".dialog-huelle input[type=date]").fill((heute + timedelta(days=3)).isoformat())
    pg.locator(".dialog-huelle select").select_option("2wochen")
    pg.locator(".dialog-huelle .knopf--haupt").last.click(); pg.wait_for_timeout(800)
    z = pg.evaluate("() => TEST.daten.kalender.find(x => x.titel === 'Papierkörbe leeren')")
    pruefe(z and z["wiederholung"] == "2wochen" and z["datum"] == (heute + timedelta(days=3)).isoformat(), "Termin gespeichert: %s" % z)
    pruefe("Papierkörbe leeren" in pg.inner_text("#kal-alle"), "Termin in der Liste")
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    pg.close()

    # Infoboard: Band unter der Solaranlage
    MIT += ";\n(TEST.daten.profiles.find(x => x.id === 'u1') || {}).andere_nutzer = true;\n"
    pg, pf = seite(br, "?bildschirm=infoboard")
    pg.wait_for_selector("#infoboard [data-ib='band']", timeout=15000); pg.wait_for_timeout(1500)
    b = pg.inner_text("[data-ib='band']")
    pruefe("Kehrichtabfuhr" in b and "bis 7 Uhr" in b, "Termine auf dem Infoboard")
    pruefe(b.count("Kehrichtabfuhr") == 1, "je Termin nur der nächste Tag")
    pruefe("Heute" in b and "wird 41" in b, "Geburtstag heute auf dem Infoboard")
    gz = pg.locator("[data-ib='band-geburtstage'] .ib-band__zeile").count()
    pruefe(gz == 1, "nur Geburtstage der nächsten 30 Tage, nicht in 60 Tagen: %d" % gz)
    lage = pg.evaluate("""() => { const t = document.querySelector('.ib-blatt'), k = document.querySelector('.ib-kopf'), b = document.querySelector('.ib-band');
      return [k.offsetTop + k.offsetHeight, b.offsetTop, b.offsetTop + b.offsetHeight, b.scrollHeight <= b.clientHeight + 1]; }""")
    pruefe(lage[0] <= lage[1] and lage[2] <= 622 and lage[3], "Band unter dem Kopf, passt in seinen Platz: %s" % lage)
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler: " + ("keine" if not fehler else "; ".join(fehler)))
