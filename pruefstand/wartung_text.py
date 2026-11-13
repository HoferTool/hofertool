# Wartung mit Text statt Bild oder PDF (1.517.0, Wunsch Patrick 13. November
# 2026): „+ Text“ im Wartungsfenster des Pads, Leiste mit Farben, Dünn/Fett
# und Grösse für markierten Text (dieselbe wie im Einrichtblatt), Ablegen
# mit Termin, Vorschau, „Text ändern“, Bildschirmschoner zeigt den Text.
import sys, time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
K = """(() => { daten.machines.forEach((m) => { if (/^m-l/.test(m.id)) m.type_id = "t1"; }); })();"""
FAKE = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
AB = os.environ.get("BILDER_ORDNER", "/tmp")
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c63f8cf80000000030001a5f2bd6f0000000049454e44ae426082")
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
def warten(pg, ms):
    pg.clock.fast_forward(ms); pg.wait_for_timeout(1300)
SCHONER = "[data-wartung-schoner]"

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.clock.install()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(800)

    pg.locator(".pad-karte2--wartung").click(); pg.wait_for_selector("#wartung")
    pg.click("#wartung-text-neu"); pg.wait_for_timeout(1500)
    pg.wait_for_selector("#wartung-schreiben")
    pruefe("Leiste mit Farben da", pg.locator("#wartung-schreiben [data-markierleiste] [data-pf-geofarbe]").count() == 5)
    pruefe("Weiter gesperrt ohne Text", pg.locator("#wartung-schreiben-ok").is_disabled())
    pg.fill("#wartung-schreiben-titel", "Öl nachfüllen")
    pg.click("#wartung-schreiben-text"); pg.keyboard.type("Achtung Öl nur Sorte HLP 46 verwenden")
    # „Achtung“ markieren und rot, fett, grösser
    pg.evaluate("""() => { const el = document.querySelector('#wartung-schreiben-text'); const t = el.firstChild;
      const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 7);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    pg.wait_for_timeout(100)
    pg.click("#wartung-schreiben [data-pf-geofarbe='#e03030']")
    pg.click("#wartung-schreiben [data-pf-geodicke='fett']")
    pg.click("#wartung-schreiben [data-pf-geogr='plus']"); pg.click("#wartung-schreiben [data-pf-geogr='plus']")
    h = pg.inner_html("#wartung-schreiben-text")
    pruefe("markierter Text rot, fett, 22px", "e03030" in h.lower() or "224, 48, 48" in h)
    pruefe("Grösse 22", "22px" in h)
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-text-schreiben.png"))
    pg.click("#wartung-schreiben-ok"); pg.wait_for_timeout(400)
    pg.evaluate("""() => { const d = new Date(Date.now() - 60000), z = (n) => String(n).padStart(2, '0');
      const el = document.querySelector('.dialog-huelle:nth-last-child(1 of .dialog-huelle) input[type=datetime-local]');
      el.value = d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+'T'+z(d.getHours())+':'+z(d.getMinutes());
      el.dispatchEvent(new Event('input', {bubbles: true})); }""")
    pg.click(".dialog-huelle:nth-last-child(1 of .dialog-huelle) [data-ja]"); pg.wait_for_timeout(800)
    z = pg.evaluate("TEST.daten.wartung_plan || []")
    pruefe("Text-Wartung gespeichert", len(z) == 1 and z[0]["art"] == "text" and z[0]["titel"] == "Öl nachfüllen"
           and "HLP 46" in (z[0].get("inhalt") or "") and "font-weight:700" in (z[0].get("inhalt_fmt") or "")
           and not z[0].get("url") and bool(z[0].get("termin")))
    pruefe("Vorschau zeigt den Text", "HLP 46" in pg.locator("#wartung .wartung__vorschau-inhalt").inner_text())
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-text-fenster.png"))
    pg.locator("[data-wartung-textaendern]").first.click(); pg.wait_for_timeout(1500); pg.wait_for_selector("#wartung-schreiben")
    pruefe("Text ändern zeigt Formatierung", "font-weight" in pg.inner_html("#wartung-schreiben-text"))
    pg.click("#wartung-schreiben-text"); pg.keyboard.press("End"); pg.keyboard.type(" Danke")
    pg.click("#wartung-schreiben-ok"); pg.wait_for_timeout(800)
    pruefe("Änderung gespeichert, Formatierung bleibt", "Danke" in pg.evaluate("TEST.daten.wartung_plan[0].inhalt")
           and "font-weight:700" in pg.evaluate("TEST.daten.wartung_plan[0].inhalt_fmt || ''"))
    pg.click("#wartung [data-zu]"); pg.wait_for_timeout(500)
    warten(pg, 61000)
    pruefe("Schoner zeigt den Text", pg.locator(SCHONER + " .pad-schoner__text").count() == 1
           and "HLP 46" in pg.locator(SCHONER).inner_text())
    if len(sys.argv) > 1: pg.screenshot(path=os.path.join(AB, "wartung-text-schoner.png"))
    pg.click("[data-wartung-erledigt-schoner]"); pg.wait_for_timeout(800)
    pruefe("Erledigt quittiert", pg.locator(SCHONER).count() == 0 and len(pg.evaluate("TEST.daten.wartung_erledigt || []")) == 1)
    pruefe("keine Fehler auf der Seite", not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
