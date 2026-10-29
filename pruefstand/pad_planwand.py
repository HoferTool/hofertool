# Pad: Tipp auf die HOCO Nr. (Dashboard und QS Check) öffnet die Planwand
# als Fenster, der Balken ist angewählt, das Auftragsfenster bleibt zu
# (Wunsch Patrick 29. Oktober 2026). Escape schliesst nur das Fenster.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
BILDER = os.environ.get("PW_BILDER", "")
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for name, vp in [("pc", {"width": 1400, "height": 900}), ("ipad", {"width": 1180, "height": 820})]:
        pg = br.new_context(viewport=vp).new_page()
        f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
                  "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
        pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
        pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
        pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
        if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
        pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
        pg.wait_for_selector("#pad .pad-stk-zahl")
        nr = pg.inner_text("#pad [data-padplanwand]")
        pg.click("#pad [data-padplanwand]")
        try:
            pg.wait_for_selector(".pad-pw .pw-balken", timeout=8000)
        except Exception:
            pruefe(name + ": Planwand-Fenster geht auf", False); pg.context.close(); continue
        pg.wait_for_timeout(1500)
        an = pg.locator(".pad-pw .pw-balken--angewaehlt")
        pruefe(name + ": Balken angewählt", an.count() == 1 and nr in an.first.inner_text())
        pruefe(name + ": kein Auftragsfenster", pg.locator(".dialog--auftrag").count() == 0)
        sicht = pg.evaluate("""(() => { const el = document.querySelector('.pad-pw .pw-balken--angewaehlt');
          if (!el) return false; const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; })()""")
        pruefe(name + ": Balken sichtbar", sicht)
        pruefe(name + ": Pad bleibt darunter", pg.locator("#pad").count() == 1)
        if BILDER: pg.screenshot(path=f"{BILDER}/pad-planwand-{name}.png")
        pg.mouse.move(5, 5); pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
        pruefe(name + ": Escape schliesst nur das Fenster", pg.locator(".pad-pw").count() == 0 and pg.locator("#pad .pad-stk-zahl").count() == 1)
        # Zurück, dann QS Check
        pg.evaluate("document.querySelector('#pad [data-padzurueck]').click()"); pg.wait_for_timeout(400)
        while pg.locator("#pad [data-padzurueck]").count():
            pg.locator("#pad [data-padzurueck]").first.click(); pg.wait_for_timeout(400)
        pg.click("#pad [data-padwo='qs']") if pg.locator("#pad [data-padwo='qs']").count() else None
        pg.wait_for_selector("#pad [data-qsauftrag]", timeout=5000)
        knopf = pg.locator("#pad [data-qsauftrag]").first
        jid = knopf.get_attribute("data-qsauftrag"); knopf.click()
        pg.wait_for_selector(".pad-pw .pw-balken", timeout=8000); pg.wait_for_timeout(1500)
        pruefe(name + ": QS Check → Balken angewählt", pg.locator(f".pad-pw .pw-balken--angewaehlt[data-auftrag='{jid}']").count() == 1)
        pruefe(name + ": QS Check → kein Auftragsfenster", pg.locator(".dialog--auftrag").count() == 0)
        pg.click(".pad-pw__zu"); pg.wait_for_timeout(400)
        pruefe(name + ": X schliesst", pg.locator(".pad-pw").count() == 0 and pg.locator("#pad").count() == 1)
        fehler += f
        pg.context.close()
    br.close()
print("Fehler:", fehler if fehler else "keine")
