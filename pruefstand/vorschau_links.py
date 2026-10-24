# Vorschau der Planwand fest links neben den Maschinennamen über der
# Seitenleiste, senkrecht mittig; ohne Platz dort (Handy) rechts neben den
# Namen (1.165.1, Wunsch Patrick 24. Oktober 2026).
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)
BILD = os.environ.get("BILDER")

def lauf(br, name, vp, touch):
    ctx = br.new_context(viewport=vp, has_touch=touch, is_mobile=touch and vp["width"] < 700)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(900)
    # zwei verschiedene Balken: die Vorschau steht beide Male am selben Ort
    ziele = pg.evaluate("""() => [...document.querySelectorAll('.pw-balken[data-auftrag]')].map(b => b.getBoundingClientRect())
      .filter(r => r.width > 30 && r.y > 150 && r.bottom < innerHeight - 40 && r.right < innerWidth - 10 && r.x > 0)
      .map(r => ({x: r.x + Math.min(r.width/2, 20), y: r.y + r.height/2}))""")
    pruefe(name + ": Balken gefunden", len(ziele) >= 2)
    orte = []
    for z in [ziele[0], ziele[-1]]:
        if touch:
            pg.evaluate("""([x, y]) => { const el = document.elementFromPoint(x, y);
              const t = new Touch({identifier: 1, target: el, clientX: x, clientY: y});
              el.dispatchEvent(new TouchEvent('touchstart', {touches: [t], bubbles: true})); }""", [z["x"], z["y"]])
            pg.wait_for_timeout(700)
        else:
            pg.mouse.move(1, 1); pg.wait_for_timeout(100)
            pg.mouse.move(z["x"], z["y"]); pg.wait_for_timeout(400)
        r = pg.evaluate("""() => { const f = document.querySelector('.pw-info'); if (!f) return null;
          const a = f.getBoundingClientRect(); const n = document.querySelector('.pw-tafel .pw-name').getBoundingClientRect();
          return {l: a.left, r: a.right, t: a.top, b: a.bottom, w: a.width, namen: n.right, nl: n.left, h: innerHeight, vw: innerWidth}; }""")
        pruefe(name + ": Vorschau offen", bool(r))
        if not r: continue
        orte.append(round(r["l"]))
        if r["nl"] - 16 >= 180:
            pruefe(name + ": links neben den Maschinennamen", abs(r["r"] - (r["nl"] - 8)) < 2 and r["l"] >= 7)
        elif r["vw"] - r["namen"] - 16 >= r["w"]: pruefe(name + ": rechts neben den Maschinennamen", abs(r["l"] - (r["namen"] + 8)) < 2)
        else: pruefe(name + ": im Bildschirm (zu wenig Platz)", r["l"] >= 8 and r["l"] + r["w"] <= r["vw"] - 7)
        pruefe(name + ": senkrecht mittig", abs((r["t"] + r["b"]) / 2 - r["h"] / 2) < 2 or r["t"] == 8)
        if BILD and len(orte) == 1: pg.screenshot(path=f"{BILD}/vorschau-{name}.png")
    pruefe(name + ": immer gleich weit links", len(orte) == 2 and orte[0] == orte[1])
    ctx.close()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH)
    lauf(br, "pc", {"width": 1600, "height": 950}, False)
    lauf(br, "tablet", {"width": 1180, "height": 820}, True)
    lauf(br, "handy", {"width": 390, "height": 844}, True)
    lauf(br, "handy-quer", {"width": 844, "height": 390}, True)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
