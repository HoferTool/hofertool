# Materialfarbe überall wie der Balken (1.72.2, Wunsch Patrick
# 16. Oktober 2026): Ein Auftrag mit V4A, aber im Auftragsfenster rosa
# gewählt, ist auch im QS Check, auf der Materialkachel im Pad und in der
# Schnellvorschau rosa, nicht grau wie die Werkstoffgruppe.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    ctx = br.new_context(viewport={"width": 1500, "height": 950}, timezone_id="Europe/Zurich")
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-10-13T14:00:00+02:00")
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt")
    pg.evaluate("""() => TEST.daten.jobs.forEach(j => {
      j.material_bez = 'X2CrNiMo17-12-2 rd 12 mm h9'; j.color = 'rosa'; })""")
    hg = lambda sel: pg.evaluate("(s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null }", sel)

    pg.evaluate("location.hash='#/planwand'")
    pg.wait_for_selector(".pw-balken:not(.pw-balken--fertig)"); pg.wait_for_timeout(800)
    balken = pg.evaluate("""() => [...document.querySelectorAll('.pw-balken')]
      .filter(e => !/fertig/.test(e.className)).map(e => e.style.background)[0]""")
    soll = pg.evaluate("(b) => { const d = document.createElement('div'); d.style.background = b; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c }", balken)
    print("Balken:", soll)
    # Schnellvorschau: Punkt bei der Werkstoffgruppe
    el = pg.locator(".pw-balken:not(.pw-balken--fertig)").first
    el.hover(); pg.wait_for_selector(".pw-info .ws-farbe", timeout=5000)
    v = hg(".pw-info .ws-farbe")
    if v != soll: fehler.append(f"Schnellvorschau {v} statt {soll}")

    pg.evaluate("location.hash='#dashboard'"); pg.wait_for_timeout(800)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='qs']")
    pg.click("#pad [data-padwo='qs']"); pg.wait_for_selector("#pad .pad-ak__karte[style*='--ak-grund']")
    pg.wait_for_timeout(500)
    v = hg("#pad .pad-ak__karte[style*='--ak-grund']")
    if v != soll: fehler.append(f"QS Check {v} statt {soll}")
    pg.click("#pad [data-padzurueck]"); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-karte2--material"); pg.wait_for_timeout(500)
    v = hg("#pad .pad-karte2--material")
    if v != soll: fehler.append(f"Materialkachel {v} statt {soll}")
    br.close()

print("Fehler:", "keine" if not fehler else "\n" + "\n".join(fehler))
