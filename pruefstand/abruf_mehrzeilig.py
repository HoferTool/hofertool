# Auftragsfenster (Wunsch Patrick 9. Oktober 2026): Abrufinformation
# mehrzeilig mit Shift + Enter, Enter allein gibt keine Zeile. Das Feld
# wächst, die Notiz wird kleiner, reicht es nicht, rollt nur die linke
# Seite. Die Siegel stehen ganz rechts. Bilder nach /tmp/abruf_<breite>x<hoehe>.png
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

def oeffnen(pg):
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate("""() => { const ids = new Map(TEST.daten.planwand.map(j => [j.id, j]));
      TEST.daten.planwand.forEach(j => { if (!('abruf_info' in j)) j.abruf_info = ''; });
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 30 && b.getBoundingClientRect().left > 0
        && b.getBoundingClientRect().right < innerWidth);
      return b ? b.dataset.auftrag : null; }""")
    if not jid: return None
    # neu laden, damit die Spalte abruf_info im Plan steht
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(1000)
    return jid if pg.locator(".dialog--auftrag").count() == 1 else None

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for (bw, bh) in [(1920, 1080), (1366, 768), (1280, 720), (1024, 768), (768, 1024), (390, 844)]:
        pg = br.new_context(viewport={"width": bw, "height": bh}).new_page()
        pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            pg.route(u, lambda r: r.abort())
        if not oeffnen(pg):
            pruefe(f"{bw}x{bh}: Auftragsfenster offen", False); pg.context.close(); continue
        f = pg.locator("#pl-abruf")
        pruefe(f"{bw}x{bh}: Abrufinformation ist mehrzeilig", f.evaluate("e => e.tagName") == "TEXTAREA")
        if f.evaluate("e => e.readOnly"):
            # Auf dem Handy ist die Planwand nur zum Ansehen
            pg.screenshot(path=f"/tmp/abruf_{bw}x{bh}.png"); pg.context.close(); continue
        h0 = f.evaluate("e => e.getBoundingClientRect().height")
        f.click(); f.fill("")
        pg.keyboard.type("je 1'000"); pg.keyboard.press("Shift+Enter"); pg.keyboard.type("KW 44")
        pg.keyboard.press("Enter"); pg.keyboard.type(" 45")
        pruefe(f"{bw}x{bh}: Shift+Enter neue Zeile, Enter nicht", f.input_value() == "je 1'000\nKW 44 45")
        h1 = f.evaluate("e => e.getBoundingClientRect().height")
        pruefe(f"{bw}x{bh}: Feld wächst ({h0:.0f} → {h1:.0f})", h1 > h0 + 10)
        # Siegel ganz rechts in der Zeile, bündig mit dem Rand der linken Spalte
        s = pg.evaluate("""() => { const k = [...document.querySelectorAll('.auf-planer .planerknopf')];
          const sp = document.querySelector('.auf-zweier--abruf').getBoundingClientRect();
          return k.length ? { rechts: Math.max(...k.map(x => x.getBoundingClientRect().right)), rand: sp.right,
                              links: Math.min(...k.map(x => x.getBoundingClientRect().left)), start: sp.left } : null; }""")
        if s:
            if bw > 560: pruefe(f"{bw}x{bh}: Siegel ganz rechts {s}", abs(s["rechts"] - s["rand"]) < 2)
        else: pruefe(f"{bw}x{bh}: Siegel-Knöpfe da", False)
        if bw >= 1200:
            v0 = pg.evaluate("document.querySelector('#pl-vorschau').getBoundingClientRect().top")
            f.fill("\n".join(f"Zeile {i}" for i in range(12)))
            pg.locator("#pl-notiz").fill("\n".join(f"Notiz {i}" for i in range(4)))
            pg.wait_for_timeout(100)
            r = pg.evaluate("""() => { const l = document.querySelector('.auf-spalte--links');
              const r = document.querySelector('.auf-raster');
              l.scrollTop = 9999;
              return { links: l.scrollHeight > l.clientHeight + 1, lTop: l.scrollTop,
                       raster: r.scrollHeight > r.clientHeight + 1,
                       notiz: document.querySelector('#pl-notiz').getBoundingClientRect().height,
                       fensterU: document.querySelector('.dialog--auftrag').getBoundingClientRect().bottom,
                       vorschau: document.querySelector('#pl-vorschau').getBoundingClientRect().top }; }""")
            pruefe(f"{bw}x{bh}: Notiz bleibt brauchbar ({r['notiz']:.0f}px)", r["notiz"] >= 60)
            pruefe(f"{bw}x{bh}: Fenster bleibt im Bildschirm", r["fensterU"] <= bh + 1)
            pruefe(f"{bw}x{bh}: Raster rollt nicht als Ganzes", not r["raster"])
            pruefe(f"{bw}x{bh}: Zeichnung rechts bleibt stehen", abs(r["vorschau"] - v0) < 1)
            if r["links"]: pruefe(f"{bw}x{bh}: linke Seite rollt", r["lTop"] > 0)
            print(f"   {bw}x{bh}: links rollt" if r["links"] else f"   {bw}x{bh}: passt ohne Rollen")
            pg.evaluate("document.querySelector('.auf-spalte--links').scrollTop = 0")
        pg.screenshot(path=f"/tmp/abruf_{bw}x{bh}.png")
        pg.context.close()
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
