# Suchtreffer in der Mitte, Zeitregler ganz unten (1.25.0, Wunsch Patrick
# 12. Oktober 2026). Am PC, auf dem iPad quer und auf dem Handy.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
GERAETE = [("pc", 1440, 900, False), ("ipad", 1180, 820, True), ("handy", 390, 844, True)]
f = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for name, w, h, finger in GERAETE:
        pg = br.new_context(viewport={"width": w, "height": h}, has_touch=finger,
                            is_mobile=name == "handy").new_page()
        pg.on("pageerror", lambda e: f.append(name + ": " + str(e)[:200]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
        pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
        r = pg.evaluate("""() => { const s = document.getElementById('pw-zeitschicht');
          const regler = s && !s.hidden && s.querySelector('#pw-zeit');
          const ro = document.querySelector('#pw-inhalt .pw-rolle').getBoundingClientRect();
          const rr = regler && regler.getBoundingClientRect();
          return { regler: !!regler, unten: rr ? Math.round(innerHeight - rr.bottom) : null,
                   unterTafel: rr ? rr.top >= ro.bottom - 1 : null,
                   imKopf: !!document.querySelector('.pw-kopfblock .pw-zeitregler, #pw-zeitplatz') }; }""")
        if name == "handy":
            print("ok " if not r["regler"] else "FEHLT", name, "kein Zeitregler wie bisher")
        else:
            gut = r["regler"] and r["unterTafel"] and r["unten"] is not None and r["unten"] < 30 and not r["imKopf"]
            print("ok " if gut else "FEHLT", name, "Zeitregler ganz unten", r)
            if not gut: f.append(name + ": Regler")
        pg.locator("#kopf-suche").click(); pg.wait_for_timeout(500)
        pg.fill("#su-text", "Star SR3"); pg.locator("#su-ja").click(); pg.wait_for_timeout(1500)
        for schritt in range(3):
            m = pg.evaluate("""() => { const el = document.querySelector('.pw-balken--treffer');
              const ro = document.querySelector('#pw-inhalt .pw-rolle');
              const r = el.getBoundingClientRect(), o = ro.getBoundingClientRect();
              const tag = document.querySelector('.pw-tafel').style.getPropertyValue('--pw-name');
              const links = o.left + parseFloat(tag), rechts = o.left + ro.clientWidth;
              return { mitte: Math.round(r.left + r.width / 2), sicht: Math.round((links + rechts) / 2),
                       spalte: parseFloat(document.querySelector('.pw-tafel').style.getPropertyValue('--pw-spalte')),
                       breit: r.width > rechts - links - 4,
                       senkrecht: Math.round(r.top + r.height / 2 - (o.top + o.height / 2)) }; }""")
            gut = m["breit"] or abs(m["mitte"] - m["sicht"]) <= m["spalte"]
            print("ok " if gut else "FEHLT", name, "Treffer", schritt + 1, "waagrecht in der Mitte", m)
            if not gut: f.append(name + ": Mitte")
            if schritt == 0:
                pg.screenshot(path=os.path.join(os.environ.get("SCHUSS", "."), f"suche-mitte-{name}.png"))
            pg.locator("#su-weiter").click(); pg.wait_for_timeout(1200)
        leiste = pg.evaluate("document.querySelector('.su-leiste').getBoundingClientRect().bottom")
        s = pg.evaluate("(() => { const x = document.querySelector('#pw-zeit'); return x ? x.getBoundingClientRect().top : 99999; })()")
        print("ok " if leiste <= s else "FEHLT", name, "Suchleiste deckt den Regler nicht zu")
        if leiste > s: f.append(name + ": Leiste")
        pg.context.close()
    br.close()
print("Fehler:", f if f else "keine")
