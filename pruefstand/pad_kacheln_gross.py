# Pad Mode (1.893.0): Ist Platz übrig, werden die Kacheln grösser und
# füllen den freien Platz, ohne dass gerollt werden muss (Patrick
# 27. November 2026: „diese felder dürfen schon etwas grösser sein“).
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT, tagsueber
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)


def messen(pg):
    return pg.evaluate("""() => {
      const w = document.querySelector('#pad .pad__wahl, #pad .pad__start');
      const b = [...w.querySelectorAll('.pad__kacheln > button')].map(e => e.getBoundingClientRect());
      const r = w.getBoundingClientRect();
      return { rollt: w.scrollHeight - w.clientHeight > 1, breit: Math.round(b[0].width), hoch: Math.round(b[0].height),
        rechts: Math.max(...b.map(x => x.right)) <= r.right + 1, links: Math.min(...b.map(x => x.left)) >= r.left - 1,
        unten: Math.max(...b.map(x => x.bottom)), flaeche: r.bottom };
    }""")

def lauf(br, w, h, name):
    F = FAKE
    ctx = br.new_context(viewport={"width": w, "height": h}, has_touch=True)
    pg = ctx.new_page(); f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    tagsueber(pg)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode'):visible").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.wait_for_timeout(700)
    m = messen(pg); pruefe(f"{name}: Startbild ohne Rollen {m}", not m["rollt"] and m["rechts"])
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]"); pg.wait_for_timeout(700)
    m = messen(pg); pruefe(f"{name}: Parks ohne Rollen {m}", not m["rollt"] and m["rechts"])
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count():
        m = messen(pg); pruefe(f"{name}: Typen ohne Rollen {m}", not m["rollt"] and m["rechts"])
        pg.locator("#pad [data-padtyp]").last.click(); pg.wait_for_timeout(800)
    m = messen(pg)
    pruefe(f"{name}: Maschinen ohne Rollen {m}", not m["rollt"] and m["rechts"] and m["links"])
    pruefe(f"{name}: Maschinen grösser als vorher (180 breit)", m["breit"] >= 230)
    if len(sys.argv) > 1: pg.screenshot(path=f"{sys.argv[1]}-{name}.png")
    pruefe(f"{name}: keine Fehler", not f); ctx.close()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    lauf(br, 1180, 820, "iPad quer")
    lauf(br, 820, 1180, "iPad hoch")
    lauf(br, 1500, 640, "PC")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
