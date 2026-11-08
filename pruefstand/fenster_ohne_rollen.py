# Fenster ohne Abschneiden und ohne seitliches Rollen (1.452.0, Wunsch Patrick
# 8. November 2026): Unterlagen im Pad an PC, iPad hoch und quer, Handy.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
OUT = os.environ.get("FENSTER_BILDER", "/tmp")
fehler = []
PRUEF = """() => { const d = document.querySelector('#unterlagen'); if (!d) return 'kein';
  const r = d.getBoundingClientRect(); const aus = [];
  for (const e of d.querySelectorAll('*')) { const q = e.getBoundingClientRect(); if (q.width && (q.right > r.right + 1 || q.left < r.left - 1)) aus.push(e.className || e.tagName); 
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible') aus.push('scroll:' + e.className); }
  const h2 = d.querySelector('h2').getBoundingClientRect().height;
  return {breite: Math.round(r.width), aus: aus.slice(0, 8), h2: Math.round(h2), vw: innerWidth}; }"""
GR = [("pc", 1280, 860, False), ("ipadhoch", 820, 1180, True), ("ipadquer", 1180, 820, True), ("handy", 390, 844, True)]
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for name, w, h, touch in GR:
        pg = br.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=(name=="handy")).new_page()
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1200)
        pg.evaluate("""() => { TEST.daten.maschinen_unterlagen = TEST.daten.machines.flatMap((m, i) => [
          {id:'u1'+i, art:'handbuch', titel:'SW-20 Handbuch DE (1-0)', machine_id:m.id, url:'x.pdf', groesse: 20000000, dateiname:'a.pdf'},
          {id:'u2'+i, art:'sonstiges', titel:'SW20 korrigieren nach Stückzahl und noch ein bisschen länger', machine_id:m.id, url:'y.pdf', groesse: 102000, dateiname:'b.pdf'}]); }""")
        pg.evaluate("document.getElementById('pad-knopf').click()"); pg.wait_for_timeout(900)
        pg.click("[data-padwo='parks']"); pg.wait_for_timeout(900)
        els = pg.query_selector_all("#pad [data-park]")
        if els: els[0].click()
        pg.wait_for_timeout(1000)
        pg.locator("#pad .pad-kachel--maschine").first.click(); pg.wait_for_timeout(1800)
        pg.locator("[data-padunterlagen]").click(); pg.wait_for_selector("#unterlagen"); pg.wait_for_timeout(700)
        e = pg.evaluate(PRUEF); print(name, e)
        if e["aus"]: fehler.append(name + ": ragt hinaus " + str(e["aus"]))
        if e["h2"] > 80: fehler.append(name + ": Titel zu hoch %d" % e["h2"])
        if name != "handy" and e["breite"] < min(760, e["vw"] - 30): fehler.append(name + ": Fenster zu schmal %d" % e["breite"])
        pg.screenshot(path=os.path.join(OUT, f"ul-{name}.png"))
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
