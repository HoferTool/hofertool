# Nach dem Neuladen steht alles wieder wie vorher (1.7.0, Wunsch
# 9. Oktober 2026): Auftragsfenster, Zeichnung, HOCO-Fenster mit Teil,
# Einstellungen mit Reiter, Reiter der Produktion, Bildlauf, Pad.
# Ein neuer Auftrag geht nicht wieder auf, Abmelden vergisst alles.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
# Ein Notizbuch dazu, wie in notizbuch_klein.py
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;",
                 "daten.notizbuecher = [{ id: 'nb1', name: 'Werkstatt', farbe: '#2e7d32', reihenfolge: 1, gesperrt: false, erstellt_am: '2026-10-07T08:00:00Z' }];\n"
                 "daten.notizbuch_seiten = [{ id: 'ns1', buch_id: 'nb1', titel: 'Spannzangen', reihenfolge: 1, erstellt_am: '2026-10-07T08:00:00Z', inhalt: [] }];\n"
                 "if (typeof window !== \"undefined\") window.TEST = TEST;")
f = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT ") + was)
    if not ok: f.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1400, "height": 900}).new_page()
    pg.on("pageerror", lambda e: f.append("SEITENFEHLER " + str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)

    def neu(sel):
        pg.reload(wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt", timeout=20000)
        if sel:
            try: pg.wait_for_selector(sel, timeout=8000)
            except Exception: pass
        pg.wait_for_timeout(800)
    zu = lambda: pg.evaluate("document.querySelectorAll('.dialog-huelle').forEach(h => { const k = h.querySelector('[data-zu]'); if (k) k.click(); else h.remove(); })") or pg.wait_for_timeout(400)

    # 1. Auftragsfenster
    jid = pg.evaluate("[...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => b.getBoundingClientRect().width > 40).dataset.auftrag")
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
    pruefe("Auftragsfenster offen", pg.locator(".dialog--auftrag").count() == 1)
    nr = pg.evaluate("(document.querySelector('.dialog--auftrag input') || {}).value || ''")
    neu(".dialog--auftrag")
    pruefe("Auftragsfenster nach Neuladen wieder offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("derselbe Auftrag (" + nr + ")", pg.evaluate("(document.querySelector('.dialog--auftrag input') || {}).value || ''") == nr)
    zu()
    neu(None)
    pruefe("geschlossen bleibt geschlossen", pg.locator(".dialog-huelle").count() == 0)

    # 2. Neuer Auftrag (Plus) geht nicht wieder auf
    pg.locator("#pw-neu, [data-pwneu]").first.click() if pg.locator("#pw-neu, [data-pwneu]").count() else None
    pg.wait_for_timeout(600)
    neu(None)
    pruefe("neuer Auftrag nicht wieder offen", pg.locator(".dialog--auftrag").count() == 0)
    zu()

    # 3. Zeichnung im Betrachter
    jz = pg.evaluate("(() => { const ids = new Set(TEST.daten.planwand.filter(j => j.drawing_url).map(j => j.id));"
                     " const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag) && b.getBoundingClientRect().width > 40);"
                     " return b && b.dataset.auftrag; })()")
    if jz:
        pg.locator(f".pw-balken[data-auftrag='{jz}']").first.click(); pg.wait_for_timeout(1200)
        t = pg.evaluate("(document.querySelector('.betrachter__titel') || {}).textContent || ''")
        pruefe("Zeichnung offen", pg.locator(".betrachter-huelle").count() == 1)
        neu(".betrachter-huelle")
        pruefe("Zeichnung nach Neuladen wieder offen", pg.locator(".betrachter-huelle").count() == 1
               and pg.evaluate("(document.querySelector('.betrachter__titel') || {}).textContent || ''") == t)
        zu()
    else: f.append("kein Balken mit Zeichnung")

    # 4. HOCO-Fenster mit offenem Teil
    erste = pg.evaluate("TEST.daten.hoco_parts[0].hoco_nr")
    pg.locator("#pw-hoco").click(); pg.wait_for_timeout(1000)
    pg.locator("[data-bereich='" + erste[:3] + "00']").click(); pg.wait_for_timeout(500)
    pg.locator("[data-kunde='" + erste[:5] + "']").click(); pg.wait_for_timeout(500)
    pg.locator("[data-hoco-auf='" + erste + "']").click(); pg.wait_for_timeout(1000)
    neu("#hoco-fensterinhalt")
    pruefe("HOCO-Fenster wieder offen", pg.locator("#hoco-fensterinhalt").count() == 1)
    pg.wait_for_timeout(800)
    pruefe("mit demselben Teil " + erste, erste in pg.inner_text("#hoco-fensterinhalt") and pg.locator("[data-hoco-auf]").count() == 0)
    zu()

    # 5. Einstellungen mit Reiter
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(600)
    pg.locator("[data-einst='fehler']").click(); pg.wait_for_timeout(400)
    neu(".dialog--einstellungen")
    pruefe("Einstellungen wieder offen", pg.locator(".dialog--einstellungen").count() == 1)
    pruefe("im Reiter Fehlerprotokoll", pg.locator("[data-einst='fehler'].aktiv").count() == 1)
    zu()

    # 6. Reiter der Produktion
    pg.evaluate("location.hash = '#produktion'"); pg.wait_for_timeout(1200)
    pg.evaluate("document.querySelector('#inhalt [data-ansicht=fortschritt]').click()"); pg.wait_for_timeout(800)
    neu(None)
    pruefe("Produktion im Reiter Fortschritt", pg.locator("#inhalt [data-ansicht=fortschritt].aktiv").count() == 1)

    # 6b. Notizbuch gross, dann klein
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_timeout(1500)
    pg.locator("#notizbuch-knopf").click(); pg.wait_for_timeout(700)
    pg.locator("[data-nbbuch='nb1']").click(); pg.wait_for_timeout(700)
    neu(".nb-huelle")
    pruefe("Notizbuch gross wieder offen", pg.locator(".dialog-huelle.nb-huelle").count() == 1)
    pg.locator("[data-nbumschalten]").click(); pg.wait_for_timeout(700)
    neu(".nb-schwebend")
    pruefe("Notizbuch klein wieder offen", pg.locator(".nb-schwebend .dialog.nb").count() == 1
           and pg.locator(".dialog-huelle").count() == 0)
    pg.locator(".nb-schwebend [data-zu]").first.click(); pg.wait_for_timeout(500)
    neu(None)
    pruefe("Notizbuch zu bleibt zu", pg.locator(".nb-schwebend").count() == 0)

    # 7. Bildlauf auf der Startseite (kleines Fenster, damit es rollt)
    pg.set_viewport_size({"width": 900, "height": 500})
    pg.evaluate("location.hash = '#dashboard'"); pg.wait_for_timeout(1500)
    pg.evaluate("window.scrollTo(0, 400)"); pg.wait_for_timeout(300)
    y = pg.evaluate("Math.round(scrollY)")
    neu(None); pg.wait_for_timeout(1500)
    y2 = pg.evaluate("Math.round(scrollY)")
    pruefe(f"Bildlauf wieder bei {y} (ist {y2})", y > 100 and abs(y2 - y) < 5)
    pg.set_viewport_size({"width": 1400, "height": 900})

    # 8. Pad: normales Neuladen bleibt auf dem Dashboard
    pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
    pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
    pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(1200)
    if pg.locator("#pad .pad-kachel--typ, #pad [data-typ]").count() and not pg.locator("#pad .pad-kachel--maschine").count():
        pg.locator("#pad .pad-kachel--typ, #pad [data-typ]").first.click(); pg.wait_for_timeout(900)
    pg.locator("#pad .pad-kachel--maschine").first.click(); pg.wait_for_timeout(1800)
    titel = lambda: pg.evaluate("(document.querySelector('#pad .pad__titel')||{}).textContent||'kein Pad'")
    vorher = titel()
    neu("#pad .pad__kopf--dash"); pg.wait_for_timeout(800)
    pruefe("Pad nach Strg+F5 auf derselben Maschine (" + vorher + ")", vorher != "kein Pad" and titel() == vorher)
    pg.screenshot(path="wiederherstellen_pad.png")

    # 9. Anderer Nutzer im selben Tab: nichts von vorher
    # Sichern beim Weggehen überschreibt den Test, darum direkt neu setzen
    pg.evaluate("""() => { const f = () => { const z = JSON.parse(sessionStorage.getItem('hofer.wiederherstellen'));
      z.nutzer = 'jemand-anders'; z.fenster = [{art:'einstellungen', daten:{}}];
      sessionStorage.setItem('hofer.wiederherstellen', JSON.stringify(z)); };
      window.addEventListener('pagehide', f); document.addEventListener('visibilitychange', f); }""")
    neu(None); pg.wait_for_timeout(800)
    pruefe("fremder Stand wird nicht übernommen", pg.locator(".dialog--einstellungen").count() == 0 and pg.locator("#pad").count() == 0)

    print("Fehler:", f[:5] if f else "keine")
    br.close()
