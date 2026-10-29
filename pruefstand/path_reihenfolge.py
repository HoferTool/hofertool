# Werkzeugwechsel im Pad: Path 1, 3, 2 nur bei SW-Typen, sonst 1, 2, 3
# (Wunsch Patrick 16. Oktober 2026)
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def reihenfolge(br, typname):
    k = """daten.type_paths.push({ id: 'pa9', type_id: 't1', name: 'Path 2', nummer: 2, sortierung: 3, nr_mit_path: false });
daten.type_slots.push({ id: 'sl9', path_id: 'pa9', bezeichnung: 'Gegenspindel', kind_id: 'k1', platz_nr: 1, tool_nr: 'T2100', werkzeuge: 1, hinweis: null, sortierung: 1 });
daten.machine_types.find(t => t.id === 't1').name = %r;""" % typname
    f = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", k + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
    pg = br.new_context(viewport={"width": 1180, "height": 830}).new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=f))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**",
              "**://api.open-meteo.com/**", "**://x.invalid/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(1500)
    pg.locator("button:has-text('Pad Mode')").first.click(); pg.wait_for_selector("#pad [data-padwo='parks']")
    pg.click("#pad [data-padwo='parks']"); pg.wait_for_selector("#pad [data-park]")
    pg.locator("#pad [data-park]").filter(has_text="Lang").first.click(); pg.wait_for_timeout(800)
    if pg.locator("#pad [data-padtyp]").count(): pg.locator("#pad [data-padtyp]").first.click(); pg.wait_for_timeout(800)
    pg.locator("#pad .pad-kachel--maschine").filter(has_not_text="kein Auftrag").first.click()
    pg.wait_for_selector("#pad .pad-stk-zahl")
    pg.locator(".pad-knopf--wz").click(); pg.wait_for_selector("[data-tool], [data-swkarte]")
    # SW hat seit 1.273.0 ein eigenes Fenster mit Karten je Path
    namen = pg.locator(".wz-path__name, .sw-path__name").all_inner_texts()
    pg.context.close()
    print(typname, namen)
    return namen

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pruefe("Index: 1, 2, 3", reihenfolge(br, "Index") == ["Path 1", "Path 2", "Path 3"])
    pruefe("SW-20: 1, 3, 2", reihenfolge(br, "SW-20") == ["Path 1", "Path 3", "Path 2"])
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
