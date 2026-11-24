# Pad Mode (1.755.1): Startbild, Parks, Typen und Maschinen passen am
# iPad quer und hochkant ohne Rollen auf den Bildschirm, auch mit zehn
# Parks (Patrick 24. November 2026: „soll überall nicht scrollen müssen“).
import sys, time
from pruefstand import server_starten, FAKE, CH, PORT, tagsueber
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

NAMEN = ["Index", "Multitasking", "SB-20RG", "SW-20", "SB-16", "SB-20", "SR-10", "SR-32", "Hanwha", "Extern"]
MEHR = "machine_parks: [\n" + "".join(
    f'    {{ id: "pz{i}", name: "{n}", is_active: true }},\n' for i, n in enumerate(NAMEN))

def rollt(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('#pad .pad__start, #pad .pad__wahl')]
        .some(e => e.scrollHeight - e.clientHeight > 1)""")

def lauf(br, w, h, name):
    F = FAKE.replace("machine_parks: [\n", MEHR, 1)
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
    pruefe(f"{name}: Startbild ohne Rollen", not rollt(pg))
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]"); pg.wait_for_timeout(700)
    pruefe(f"{name}: alle Parks da", pg.locator("#pad [data-park]").count() >= 10)
    pruefe(f"{name}: Parks ohne Rollen", not rollt(pg))
    if len(sys.argv) > 1: pg.screenshot(path=f"{sys.argv[1]}-{name}.png")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count():
        pruefe(f"{name}: Typen ohne Rollen", not rollt(pg))
        pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pruefe(f"{name}: Maschinen ohne Rollen", not rollt(pg))
    pruefe(f"{name}: keine Fehler", not f); ctx.close()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    lauf(br, 1180, 820, "iPad quer")
    lauf(br, 820, 1180, "iPad hoch")
    lauf(br, 1024, 700, "klein quer")
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
