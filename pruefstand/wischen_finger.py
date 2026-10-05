# Planwand mit dem Finger (111.53.0, Wunsch Patrick 5. Oktober 2026):
# Waagrechtes Wischen folgt dem Finger und blättert danach um genau so
# viele Tage weiter, wie gewischt wurde, ohne Sprünge. Senkrecht scrollt
# die Tafel normal. Balken lassen sich mit dem Finger nicht verschieben,
# Tippen aufs Zustandssymbol öffnet weiter den Zustand.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)

def seite(br, w, h):
    ctx = br.new_context(viewport={"width": w, "height": h}, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:170]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**",
              "**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1600)
    return pg, f

ZUSTAND = """(() => { const r = document.querySelector('.pw-rolle'); const t = document.querySelector('.pw-tafel');
  const cs = getComputedStyle(t); const sp = parseFloat(cs.getPropertyValue('--pw-spalte'));
  const name = parseFloat(cs.getPropertyValue('--pw-name')); const sicht = +cs.getPropertyValue('--pw-sicht');
  return { erster: document.querySelector('[data-zelle]').dataset.zelle.split('|')[1],
    links: r.scrollLeft, oben: r.scrollTop, spalte: sp, finger: r.classList.contains('pw-rolle--finger'),
    passt: Math.abs(name + sp * sicht - r.clientWidth) < 2 }; })()"""
PLUS = """([d, n]) => { let x = new Date(d + 'T00:00:00'); let k = 0; const s = n < 0 ? -1 : 1;
  while (k !== n) { x.setDate(x.getDate() + s); if (x.getDay() % 6) k += s; }
  return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); }"""
JOB = "(id) => { const j = TEST.daten.jobs.find(x => x.id === id); return [j.planned_from, j.planned_days, j.machine_id]; }"
BALKEN = """() => { for (const el of document.querySelectorAll('.pw-balken[data-auftrag]')) { const r = el.getBoundingClientRect();
  if (r.width > 60 && r.x > 150 && r.right < innerWidth - 10 && r.y > 200 && r.y < innerHeight - 160) {
    const s = el.querySelector('.pw-balken__statusgross').getBoundingClientRect();
    return {id: el.dataset.auftrag, x: r.x + r.width * 0.6, y: r.y + r.height / 2, sx: s.x + s.width / 2, sy: s.y + s.height / 2}; } } return null; }"""

ok = {}; alle = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    for name, w, h in [("Handy", 430, 932), ("Tablet", 1180, 820)]:
        pg, f = seite(br, w, h)
        cdp = pg.context.new_cdp_session(pg)
        def touch(art, x=0, y=0):
            cdp.send("Input.dispatchTouchEvent", {"type": art,
                "touchPoints": [] if art == "touchEnd" else [{"x": x, "y": y, "id": 1}]})
        r = pg.evaluate("(() => { const b = document.querySelector('.pw-rolle').getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })()")
        cx, cy = r[0] + r[2] * 0.6, r[1] + r[3] * 0.5
        z0 = pg.evaluate(ZUSTAND)

        # 1) Langsam drei Spalten nach links: Tafel folgt, danach 3 Arbeitstage weiter
        touch("touchStart", cx, cy)
        for i in range(1, 16): touch("touchMove", cx - z0["spalte"] * 3 * i / 15, cy + (i % 2)); pg.wait_for_timeout(30)
        mitte = pg.evaluate(ZUSTAND)
        pg.wait_for_timeout(150); touch("touchEnd"); pg.wait_for_timeout(900)
        z1 = pg.evaluate(ZUSTAND)
        folgt = abs(mitte["links"] - z0["links"] - z0["spalte"] * 3) < 3
        soll = pg.evaluate(PLUS, [z0["erster"], 3])
        print(name, "langsam: Tafel folgt dem Finger", folgt, "| Beginn", z0["erster"], "->", z1["erster"], "soll", soll,
              "| feste Spalten passen:", z0["passt"], "| eigenes Wischen:", z0["finger"])
        ok[name + " langsam"] = folgt and z1["erster"] == soll and z0["passt"] and z0["finger"] and abs(z1["links"] - z0["links"]) < 2

        # 2) Schneller Wisch nach rechts: rollt aus, bleibt danach ruhig stehen
        touch("touchStart", cx - 100, cy)
        for i in range(1, 6): touch("touchMove", cx - 100 + 40 * i, cy); pg.wait_for_timeout(16)
        touch("touchEnd"); pg.wait_for_timeout(1500)
        z2 = pg.evaluate(ZUSTAND); pg.wait_for_timeout(800); z3 = pg.evaluate(ZUSTAND)
        print(name, "schnell: zurück", z1["erster"], "->", z2["erster"], "| steht danach still:", z2 == z3)
        ok[name + " schnell"] = z2["erster"] < z1["erster"] and z2 == z3

        # 3) Senkrecht: scrollt nach unten, Zeitraum bleibt
        touch("touchStart", cx, cy)
        for i in range(1, 10): touch("touchMove", cx + 2, cy - 25 * i); pg.wait_for_timeout(16)
        touch("touchEnd"); pg.wait_for_timeout(1200)
        z4 = pg.evaluate(ZUSTAND)
        print(name, "senkrecht: nach unten", z4["oben"] > z3["oben"], "| Zeitraum bleibt:", z4["erster"] == z3["erster"])
        ok[name + " senkrecht"] = z4["oben"] > z3["oben"] and z4["erster"] == z3["erster"]
        touch("touchStart", cx, cy)
        for i in range(1, 10): touch("touchMove", cx, cy + 40 * i); pg.wait_for_timeout(16)
        touch("touchEnd"); pg.wait_for_timeout(1000)

        # 4) Langes Drücken und Ziehen verschiebt keinen Balken
        b = pg.evaluate(BALKEN); vorher = pg.evaluate(JOB, b["id"])
        touch("touchStart", b["x"], b["y"]); pg.wait_for_timeout(700)
        for i in range(1, 8): touch("touchMove", b["x"] + 15 * i, b["y"] + 30 * (i > 4)); pg.wait_for_timeout(30)
        gehoben = pg.evaluate("!!document.querySelector('.pw-balken--zieht, .pw-balken--groesse')")
        touch("touchEnd"); pg.wait_for_timeout(1200)
        print(name, "Balken bleibt:", pg.evaluate(JOB, b["id"]) == vorher, "| angehoben:", gehoben)
        ok[name + " kein Verschieben"] = pg.evaluate(JOB, b["id"]) == vorher and not gehoben
        if pg.locator(".dialog-huelle").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

        # 5) Tablet mit Planrecht: Tippen aufs Symbol öffnet den Zustand
        if name == "Tablet":
            b = pg.evaluate(BALKEN)
            pg.touchscreen.tap(b["sx"], b["sy"]); pg.wait_for_timeout(900)
            text = pg.evaluate("(() => { const d = document.querySelector('.dialog-huelle'); return d ? d.textContent.slice(0, 40) : ''; })()")
            print(name, "Symbol tippen:", repr(text))
            ok[name + " Symbol"] = "Zustand" in text
        alle += f
        pg.context.close()
    print("Ergebnis:", ok)
    print("Fehler:", "keine" if all(ok.values()) and not alle else ([k for k, v in ok.items() if not v] + alle)[:4])
    br.close()
