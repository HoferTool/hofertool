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
    # Seit 1.311.0 kein Reiter mehr: Karte auf der Startseite nach den
    # Problemen, nächste zwei Wochen, je Eintrag nur einmal; Tipp öffnet
    # das Fenster zum Verwalten (Wunsch Patrick 30. Oktober 2026)
    pg, pf = seite(br, "#/dashboard")
    pg.wait_for_selector("#db-kalender .karte", timeout=15000); pg.wait_for_timeout(800)
    k = pg.inner_text("#db-kalender")
    pruefe(k.count("Kehrichtabfuhr") == 1 and "jede Woche" in k, "wöchentlicher Termin nur einmal auf Start: %r" % k)
    reihe = pg.evaluate("""() => [...document.querySelectorAll('#db-probleme, #db-kalender, #db-status')].map(e => e.id)""")
    pruefe(reihe[:2] == ["db-probleme", "db-kalender"], "Kalender direkt nach den Problemen: %s" % reihe)
    pruefe(pg.locator("[data-nav='kalender']").count() == 0, "kein Reiter Kalender im Menü")
    pg.click("#db-kalender .karte"); pg.wait_for_selector("#kal-fenster #kal-alle")
    pruefe("Kehrichtabfuhr" in pg.inner_text("#kal-alle"), "Eintrag im Fenster")
    # Neuer Termin, alle 2 Wochen
    pg.click("#kal-neu"); pg.wait_for_function("document.querySelectorAll('.dialog-huelle').length >= 2")
    d = pg.locator(".dialog-huelle").last
    d.locator("input").first.fill("Papierkörbe leeren")
    d.locator("input[type=date]").fill((heute + timedelta(days=3)).isoformat())
    d.locator("select").select_option("2wochen")
    d.locator(".knopf--haupt").last.click(); pg.wait_for_timeout(800)
    z = pg.evaluate("() => TEST.daten.kalender.find(x => x.titel === 'Papierkörbe leeren')")
    pruefe(z and z["wiederholung"] == "2wochen" and z["datum"] == (heute + timedelta(days=3)).isoformat(), "Termin gespeichert: %s" % z)
    pruefe("Papierkörbe leeren" in pg.inner_text("#kal-alle"), "Termin in der Liste")
    pg.click("#kal-fenster [data-zu]"); pg.wait_for_timeout(800)
    k = pg.inner_text("#db-kalender")
    pruefe("Papierkörbe leeren" in k, "nach dem Schliessen neu auf Start")
    import os
    if os.environ.get("BILD0"): pg.locator("#db-kalender").screenshot(path=os.environ["BILD0"])
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
    # Geburtstage nur so breit wie nötig, der Rest für die Termine (seit 1.241.1)
    br2 = pg.evaluate("""() => { const g = document.querySelector("[data-ib='band-geburtstage']"), t = document.querySelector("[data-ib='band-termine']");
      const ab = [...g.querySelectorAll('.ib-band__was')].some((e) => e.scrollWidth > e.clientWidth + 1);
      const w = g.querySelector('.ib-band__was'), n = g.querySelector('.ib-band__wann');
      return [g.offsetWidth, t.offsetWidth, ab, n.getBoundingClientRect().left - w.getBoundingClientRect().right]; }""")
    pruefe(br2[0] < br2[1] and not br2[2] and br2[3] < 40, "Geburtstage schmal, Termine breit, nichts abgeschnitten: %s" % br2)
    import os
    if os.environ.get("BILD"): pg.locator("[data-ib='band']").screenshot(path=os.environ["BILD"])
    # Jeder Bereich nur so hoch wie seine Einträge (Wunsch Patrick 28. Oktober 2026)
    hoch = pg.evaluate("""() => [...document.querySelectorAll('.ib-band__teil')].map(t =>
      [t.offsetHeight, t.scrollHeight, t.parentElement.clientHeight])""")
    pruefe(all(h[0] <= h[1] + 1 for h in hoch) and hoch[0][0] < hoch[0][2], "Bereiche nur so hoch wie nötig: %s" % hoch)
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    pg.close()

    # Wächst das Band, rutschen die Dokumente darunter mit (seit 1.243.0,
    # Wunsch Patrick 28. Oktober 2026): acht Termine, Teile direkt bei 622
    viele = ",".join("{ id: 'v%d', titel: 'Termin %d', datum: '%s', wiederholung: 'nie' }"
                     % (i, i, (heute + timedelta(days=i + 1)).isoformat()) for i in range(8))
    MIT += """;
TEST.daten.kalender = [%s];
TEST.daten.infoboard = [{ id: 'haupt', geaendert_am: '2026-10-28T06:00:00Z', aufbau: { frei: true, teile: [
  { id: 'a', art: 'text', html: 'Oben', x: 12, y: 630, w: 344, h: 486 },
  { id: 'b', art: 'text', html: 'Unten', x: 724, y: 1420, w: 344, h: 486 } ] } }];
""" % viele
    pg, pf = seite(br, "?bildschirm=infoboard")
    pg.wait_for_selector("#infoboard [data-ib='band']", timeout=15000); pg.wait_for_timeout(1500)
    z = pg.locator("[data-ib='band-termine'] .ib-band__zeile").count()
    pruefe(z == 8, "acht Termine im Band: %d" % z)
    l = pg.evaluate("""() => { const b = document.querySelector('.ib-band'), bl = document.querySelector('.ib-blatt');
      const t = [...document.querySelectorAll('[data-ibteil]')].map(e => [e.offsetTop, e.offsetTop + e.offsetHeight, e.offsetLeft]);
      return { band: b.offsetTop + b.offsetHeight, teile: t, hoehe: bl.offsetHeight,
        abgeschnitten: [...b.querySelectorAll('.ib-band__teil')].some(x => x.scrollHeight > x.clientHeight + 1) }; }""")
    pruefe(l["band"] > 622 and not l["abgeschnitten"], "Band gewachsen, nichts abgeschnitten: %s" % l)
    pruefe(all(t[0] >= l["band"] for t in l["teile"]), "kein Dokument über dem Band: %s" % l)
    pruefe(all(t[1] <= l["hoehe"] for t in l["teile"]), "Dokumente bleiben auf der Tafel: %s" % l)
    if os.environ.get("BILD2"): pg.screenshot(path=os.environ["BILD2"])
    pruefe(not pf, "keine Skriptfehler: %s" % pf[:2])
    br.close()
print("Fehler: " + ("keine" if not fehler else "; ".join(fehler)))
