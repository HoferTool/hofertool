# Pad Mode in React: Park → Maschine, Stückzahl über den Zifferblock
# eintragen, Wochen und Monate umschalten, Zustand ändern, Zurück
# Schritt für Schritt, Schliessen baut die Seite darunter wieder auf.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width":1400,"height":950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.on("console", lambda m: fehler.append(m.type + ": " + m.text[:160])
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    # Maschine mit laufendem Auftrag
    kachel = pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first
    kachel.click(); pg.wait_for_selector("#pad .pad-stk-zahl")
    jid = pg.evaluate("""() => { const nr = document.querySelector('#pad .pad-wert--gross').textContent;
        const j = TEST.daten.jobs.find(x => x.job_number === nr && !x.ended_at); return j && j.id; }""")
    # Stückzahl eintragen
    pg.click("#pad [data-padfeld='stand']"); pg.wait_for_selector("[data-zbja]")
    pg.click("[data-zb='C']") if pg.locator("[data-zb='C']").count() else None
    for t in "4321": pg.click(f"[data-zb='{t}']")
    # Erste Zahl heute: Frage „Wurde heute schon produziert?“ → Ja
    pg.click("[data-zbja]"); pg.wait_for_timeout(600); pg.locator(".dialog-huelle [data-w='ja']").click() if pg.locator(".dialog-huelle [data-w='ja']").count() else None; pg.wait_for_timeout(1800)
    if pg.inner_text("#pad .pad-stk-zahl").replace("’", "'") != "4'321":
        fehler.append("Stückzahl nicht angezeigt: " + pg.inner_text("#pad .pad-stk-zahl"))
    if not pg.evaluate("TEST.daten.production_records.some(z => z.quantity === 4321)"):
        fehler.append("Stückzahl nicht gespeichert")
    # Wochen und Monate: nur Balken und Fuss wechseln, kein Zifferblock
    pg.click("#pad [data-stkansicht='woche']"); pg.wait_for_timeout(300)
    if pg.locator(".zifferblock").count(): fehler.append("Umschalten öffnet den Zifferblock")
    if pg.locator("#pad .pad-tag").count() != 8: fehler.append("Wochen zeigen nicht 8 Balken")
    if "letzte 8 Wochen" not in pg.inner_text("#pad-stk-fuss"): fehler.append("Fuss Wochen falsch")
    if not pg.locator("#pad-stk-verlauf[hidden]").count(): fehler.append("Verlauf bei Wochen sichtbar")
    pg.click("#pad [data-stkansicht='monat']"); pg.wait_for_timeout(300)
    if pg.locator("#pad .pad-tag").count() != 6: fehler.append("Monate zeigen nicht 6 Balken")
    pg.click("#pad [data-stkansicht='tag']"); pg.wait_for_timeout(300)
    if pg.locator("#pad .pad-tag").count() != 7: fehler.append("Tage zeigen nicht 7 Balken")
    # Zustand ändern
    pg.click("#pad [data-padstatus]"); pg.wait_for_selector(".dialog-huelle [data-w='qs']")
    pg.click(".dialog-huelle [data-w='qs']"); pg.wait_for_timeout(1500)
    if pg.evaluate(f"TEST.daten.jobs.find(j => j.id === '{jid}').plan_status") != "qs": fehler.append("Zustand nicht gesetzt")
    if "QS" not in pg.inner_text("#pad [data-padstatus]").upper(): fehler.append("Zustandsknopf nicht aufgefrischt")
    pg.screenshot(path="pad.png")
    # Zurück Schritt für Schritt, dann Schliessen
    pg.click("#pad [data-padzurueck]"); pg.wait_for_selector("#pad .pad-kachel--maschine")
    pg.click("#pad [data-padzurueck]"); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.click("#pad [data-padzurueck]"); pg.wait_for_timeout(800)
    if not pg.locator("#pad [data-park]").count(): fehler.append("Zurück landet nicht bei den Parks")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(1500)
    if pg.locator("#pad").count(): fehler.append("Pad bleibt offen")
    if not pg.locator("#inhalt h1, #inhalt .karte").count(): fehler.append("Seite darunter leer")
    # Nochmals öffnen: frisch auf dem Start
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padzu]"); pg.wait_for_timeout(800)
    br.close()
print("Pad | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
