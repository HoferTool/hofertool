# Verschieben auf der Planwand mit dem Finger (111.50.0):
# langes Drücken in der Balkenmitte und ziehen verschiebt um genau so
# viele Tage, wie der Finger fährt; ein schneller Zug blättert die Wand
# nicht weiter; der Griff ändert die Dauer nach kurzem Halten, ein
# Wischen über den Griff nicht; langes Drücken auf das Zustandssymbol
# zieht, Tippen darauf öffnet den Zustand; kein Infofenster beim Ziehen.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)

def seite(br):
    ctx = br.new_context(viewport={"width": 1180, "height": 820}, has_touch=True, is_mobile=True)
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

# Ein ganzer, sichtbarer Balken mit mindestens drei Tagen, mitten auf der Tafel
BALKEN = """(ausser) => { for (const el of document.querySelectorAll('.pw-balken[data-auftrag]')) {
    if (ausser.includes(el.dataset.auftrag)) continue;
    const r = el.getBoundingClientRect(); if (r.y < 200 || r.y > innerHeight - 150) continue;
    if (r.x < 300 || r.right > innerWidth - 200 || +el.dataset.dauer < 3) continue;
    if (el.dataset.angeschnitten !== '0') continue;
    const s = el.querySelector('.pw-balken__statusgross').getBoundingClientRect();
    return { id: el.dataset.auftrag, x: r.x + r.width * 0.6, y: r.y + r.height / 2,
      sx: s.x + s.width / 2, sy: s.y + s.height / 2,
      spalte: r.width / +el.dataset.dauer }; } return null; }"""
JOB = "(id) => { const j = TEST.daten.jobs.find(x => x.id === id); return [j.planned_from, j.planned_days]; }"
TAG0 = "document.querySelector('[data-zelle]').dataset.zelle.split('|')[1]"
PLUS = """([d, n]) => { let x = new Date(d + 'T00:00:00'); let k = 0; const s = n < 0 ? -1 : 1;
  while (k !== n) { x.setDate(x.getDate() + s); if (x.getDay() % 6) k += s; }
  return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); }"""

ok = {}
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg, f = seite(br)
    cdp = pg.context.new_cdp_session(pg)
    def touch(art, x=0, y=0):
        cdp.send("Input.dispatchTouchEvent", {"type": art,
            "touchPoints": [] if art == "touchEnd" else [{"x": x, "y": y, "id": 1}]})
    def lueckeJa():
        pg.wait_for_timeout(500)
        if pg.locator("[data-ja]").count(): pg.locator("[data-ja]").first.click(); pg.wait_for_timeout(800)
    benutzt = []

    # 1) In der Mitte packen, zwei Spalten nach links: zwei Arbeitstage früher.
    #    Der Finger zittert beim Halten (bis 10 Pixel), das soll nicht abbrechen.
    b = pg.evaluate(BALKEN, benutzt); benutzt.append(b["id"])
    vorher = pg.evaluate(JOB, b["id"]); s0 = pg.evaluate(TAG0)
    touch("touchStart", b["x"], b["y"]); pg.wait_for_timeout(150)
    touch("touchMove", b["x"] + 7, b["y"] + 3); pg.wait_for_timeout(150)
    touch("touchMove", b["x"] - 3, b["y"] - 4); pg.wait_for_timeout(350)
    info = pg.evaluate("!!document.querySelector('.pw-info, .balken-info, .pw-vorschaufenster')")
    gehoben = pg.evaluate("!!document.querySelector('.pw-balken--zieht')")
    x = b["x"]
    for i in range(10):
        x -= b["spalte"] * 2 / 10; touch("touchMove", x, b["y"]); pg.wait_for_timeout(20)
    pg.wait_for_timeout(100)
    vorschau = pg.evaluate("(() => { const v = document.querySelector('.pw-vorschau'); return v && v.textContent; })()")
    touch("touchEnd"); lueckeJa()
    nachher = pg.evaluate(JOB, b["id"]); soll = pg.evaluate(PLUS, [vorher[0], -2])
    print("Mitte packen, 2 Spalten links:", vorher[0], "->", nachher[0], "| soll", soll,
          "| trotz Zittern gehoben:", gehoben, "| Vorschau:", vorschau, "| Infofenster:", info)
    ok["mitte"] = nachher[0] == soll and gehoben and bool(vorschau) and not info and pg.evaluate(TAG0) == s0

    # 2) Schneller Zug nach dem Halten: der Balken wandert, die Wand blättert nicht
    b = pg.evaluate(BALKEN, benutzt); benutzt.append(b["id"])
    vorher = pg.evaluate(JOB, b["id"]); s0 = pg.evaluate(TAG0)
    touch("touchStart", b["x"], b["y"]); pg.wait_for_timeout(450)
    for i in range(1, 6): touch("touchMove", b["x"] + b["spalte"] * 3 * i / 5, b["y"]); pg.wait_for_timeout(16)
    touch("touchEnd"); lueckeJa()
    nachher = pg.evaluate(JOB, b["id"]); s1 = pg.evaluate(TAG0)
    print("Schneller Zug: Wand", s0, "->", s1, "| Balken", vorher[0], "->", nachher[0])
    ok["schnell"] = s0 == s1 and nachher[0] == pg.evaluate(PLUS, [vorher[0], 3])

    # 3) Griff: halten, dann ziehen ändert die Dauer
    b = pg.evaluate(BALKEN, benutzt); benutzt.append(b["id"])
    vorher = pg.evaluate(JOB, b["id"])
    g = pg.evaluate("(id) => { const r = document.querySelector('.pw-balken[data-auftrag=\"'+id+'\"] [data-griff=rechts]').getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; }", b["id"])
    touch("touchStart", g["x"], g["y"]); pg.wait_for_timeout(350)
    for i in range(1, 11): touch("touchMove", g["x"] + b["spalte"] * 2 * i / 10, g["y"]); pg.wait_for_timeout(20)
    waehrend = pg.evaluate("!!document.querySelector('.pw-balken--groesse')")
    touch("touchEnd"); pg.wait_for_timeout(1200)
    nachher = pg.evaluate(JOB, b["id"])
    print("Griff gehalten: Dauer", vorher[1], "->", nachher[1], "| sichtbar beim Ziehen:", waehrend)
    ok["griff"] = nachher[1] == vorher[1] + 2 and nachher[0] == vorher[0] and waehrend

    # 4) Wischen, das auf dem Griff beginnt, ändert nichts
    vorher = pg.evaluate(JOB, b["id"])
    g = pg.evaluate("(id) => { const r = document.querySelector('.pw-balken[data-auftrag=\"'+id+'\"] [data-griff=rechts]').getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; }", b["id"])
    touch("touchStart", g["x"], g["y"]); pg.wait_for_timeout(40)
    for i in range(1, 8): touch("touchMove", g["x"] + 15 * i, g["y"]); pg.wait_for_timeout(16)
    touch("touchEnd"); pg.wait_for_timeout(900)
    print("Wischen über den Griff ändert nichts:", pg.evaluate(JOB, b["id"]) == vorher)
    ok["griffwisch"] = pg.evaluate(JOB, b["id"]) == vorher

    # 5) Langes Drücken auf das Zustandssymbol verschiebt den Balken
    # Das Wischen eben hat die Wand weitergeblättert: frisch anfangen
    alt = f; pg.context.close(); pg, f = seite(br); f += alt
    cdp = pg.context.new_cdp_session(pg)
    b = pg.evaluate(BALKEN, [])
    vorher = pg.evaluate(JOB, b["id"])
    touch("touchStart", b["sx"], b["sy"]); pg.wait_for_timeout(500)
    for i in range(1, 11): touch("touchMove", b["sx"] + b["spalte"] * 2 * i / 10, b["sy"]); pg.wait_for_timeout(20)
    touch("touchEnd"); lueckeJa()
    nachher = pg.evaluate(JOB, b["id"])
    dialog = pg.evaluate("!!document.querySelector('.dialog-huelle')")
    print("Symbol lange drücken: Balken", vorher[0], "->", nachher[0], "| kein Zustandsfenster:", not dialog)
    ok["symbolziehen"] = nachher[0] == pg.evaluate(PLUS, [vorher[0], 2]) and not dialog
    if dialog: pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 6) Kurz aufs Symbol tippen: Zustand wählen, keine Zeichnung
    b = pg.evaluate(BALKEN, [])
    pg.touchscreen.tap(b["sx"], b["sy"]); pg.wait_for_timeout(900)
    text = pg.evaluate("(() => { const d = document.querySelector('.dialog-huelle'); return d ? d.textContent.slice(0, 60) : ''; })()")
    print("Symbol tippen öffnet:", repr(text))
    ok["symboltipp"] = "Zustand" in text
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 7) Gewöhnliches Wischen über einen Balken verschiebt nichts
    b = pg.evaluate(BALKEN, []); vorher = pg.evaluate(JOB, b["id"])
    touch("touchStart", b["x"], b["y"])
    for i in range(1, 9): touch("touchMove", b["x"] - 20 * i, b["y"]); pg.wait_for_timeout(16)
    touch("touchEnd"); pg.wait_for_timeout(900)
    print("Wischen verschiebt nichts:", pg.evaluate(JOB, b["id"]) == vorher)
    ok["wischen"] = pg.evaluate(JOB, b["id"]) == vorher

    print("Ergebnis:", ok)
    alle = all(ok.values())
    print("Fehler:", "keine" if alle and not f else ([k for k, v in ok.items() if not v] + f)[:4])
    br.close()
