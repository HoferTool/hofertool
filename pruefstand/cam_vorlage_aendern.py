# HOFERCAM (seit 1.732.0): eine eingefügte Vorlage (z.B. Einstich) wieder
# öffnen, wenn die Schreibmarke in ihren Zeilen steht, und ersetzen.
# Mehrere gleiche Vorlagen je Bearbeitung, bleibt nach Speichern und Öffnen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def einstich(pg, d):
    pg.click("[data-camvorlage-auf='0']")
    pg.click("[data-camvorlage-bild='einstich']")
    for n, v in [("D", d), ("Z", "5"), ("B", "3"), ("T", "1.5"), ("PB", "1.5"), ("PL", "3"), ("PR", "0.1")]:
        pg.fill(f"[data-camein='{n}']", v)
    pg.click("[data-camvorlage-einfuegen]"); pg.wait_for_timeout(150)

def code(pg): return pg.input_value("[data-block='0'] [data-camblock='code']")

def marke_bei(pg, text):
    pg.evaluate("""(t) => { const a = document.querySelector("[data-block='0'] [data-camblock='code']");
      a.focus(); const i = a.value.indexOf(t); a.setSelectionRange(i, i);
      document.dispatchEvent(new Event('selectionchange')); }""", text)
    pg.wait_for_timeout(150)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        ctx.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#nc'")
    pg.wait_for_selector("[data-unter='nc/cam']"); pg.click("[data-unter='nc/cam']")
    pg.wait_for_selector("#cam-kanaele")
    pg.fill("[data-cam='nr']", "458")
    pg.click("#cam-neu-dreh"); pg.wait_for_timeout(200)
    pg.fill("[data-block='0'] [data-camblock='code']", "G0X20.\nG1X10.F0.1")
    marke_bei(pg, "G1X10.")
    einstich(pg, "12")
    pg.evaluate("""() => { const a = document.querySelector("[data-block='0'] [data-camblock='code']"); a.focus(); a.setSelectionRange(a.value.length, a.value.length); }""")
    pg.keyboard.press("End"); pg.wait_for_timeout(100)
    einstich(pg, "10")
    c = code(pg)
    pruefe("Zwei Einstiche eingefügt", "(EINSTICH MANTEL D12." in c and "(EINSTICH MANTEL D10." in c)
    marke_bei(pg, "G0X20.")
    pruefe("Ausserhalb kein Knopf", pg.locator("[data-camvorlage-aendern]").count() == 0)
    marke_bei(pg, "(EINSTICH MANTEL D10.")
    pruefe("Im zweiten Einstich Knopf", pg.locator("[data-camvorlage-aendern='0']").count() == 1)
    pg.click("[data-camvorlage-aendern='0']")
    pruefe("Öffnet mit D 10", pg.input_value("[data-camein='D']") == "10")
    pruefe("Knopf heisst Ersetzen", "Ersetzen" in (pg.text_content("[data-camvorlage-einfuegen]") or ""))
    pg.fill("[data-camein='D']", "11"); pg.click("[data-camvorlage-einfuegen]"); pg.wait_for_timeout(150)
    c = code(pg)
    pruefe("Ersetzt, erster bleibt", "(EINSTICH MANTEL D12." in c and "(EINSTICH MANTEL D11." in c and "D10." not in c
           and c.count("(EINSTICH MANTEL") == 2 and c.startswith("G0X20.\nG1X10.F0.1\n(EINSTICH MANTEL D12."))
    marke_bei(pg, "(EINSTICH MANTEL D12.")
    pg.click("[data-camvorlage-aendern='0']")
    pruefe("Erster öffnet mit D 12", pg.input_value("[data-camein='D']") == "12")
    pg.click("[data-camvorlage] button[title='Schliessen']")
    # Von Hand geändert: Verbindung weg
    # Speichern und Öffnen
    pg.evaluate("TEST.daten.nc_programme = TEST.daten.nc_programme || []")
    pg.click("#camab-speichern"); pg.wait_for_selector(".dialog input")
    pg.fill(".dialog input", "PROBE-V"); pg.click(".dialog .knopf--haupt"); pg.wait_for_timeout(300)
    gesp = pg.evaluate("TEST.daten.nc_programme.filter(z => z.art === 'cam')[0].daten.bloecke[0].vorlagen")
    pruefe("Werte gespeichert", len(gesp) == 2)
    pg.click("#camab-neu"); pg.wait_for_timeout(200)
    pg.click("#camab-oeffnen"); pg.wait_for_selector("[data-ncgesp='PROBE-V']")
    pg.click("[data-ncgesp='PROBE-V'] .kt-gesp__name"); pg.wait_for_timeout(200)
    if pg.locator("[data-camblock-auf='0']").count(): pg.click("[data-camblock-auf='0']")
    marke_bei(pg, "(EINSTICH MANTEL D11.")
    pg.click("[data-camvorlage-aendern='0']")
    pruefe("Nach Öffnen D 11", pg.input_value("[data-camein='D']") == "11")
    pg.click("[data-camvorlage] button[title='Schliessen']")
    # Zeile im Einstich von Hand ändern: dann kein Knopf mehr
    a = code(pg).replace("(EINSTICH MANTEL D11.", "(EINSTICH MANTEL D99.")
    pg.fill("[data-block='0'] [data-camblock='code']", a)
    marke_bei(pg, "(EINSTICH MANTEL D99.")
    pruefe("Von Hand geändert: kein Knopf", pg.locator("[data-camvorlage-aendern]").count() == 0)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
