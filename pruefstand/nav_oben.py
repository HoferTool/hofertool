# 1.711.0 (Wunsch Patrick 22. November 2026): am Computer keine Kopfzeile,
# oben in der Leiste Logo, ☰ (Menü ↔ Todos), Pad Mode und Bild. Todos für
# alle ausser Externen; Nicht-Admins sehen dort nur Todos, keine Meldungen.
import time, os
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
BILD = os.environ.get("NAV_BILDER", "/tmp")
fehler = []
def pruefe(ok, text):
    print(("ok   " if ok else "FEHLT") + " " + text)
    if not ok: fehler.append(text)

def daten(rolle):
    return """;
(function(){
  TEST.navTodos = true; TEST.ohneKopf = true;
  TEST.daten.profiles[0].role = '%s';
  if (TEST.daten.profiles[0].role === 'admin') TEST.daten.profiles[0].einstellungen = Object.assign({}, TEST.daten.profiles[0].einstellungen || {}, { neuerLook: true });
  const J = TEST.daten.jobs; J[0].problem = 'Spindel klemmt';
  TEST.daten.planer_todos = [
    { id: 't1', text: 'Mein eigenes Todo', sicht: 'ich', fuer_alle: false, erstellt_von: 'u1', erledigt_am: null, erstellt_am: '2026-11-12T08:00:00Z' },
    { id: 't2', text: 'Für alle sichtbar', sicht: 'alle', fuer_alle: true, erstellt_von: 'x', erledigt_am: null, erstellt_am: '2026-11-12T08:00:00Z' },
    { id: 't3', text: 'Nur Admins', sicht: 'admins', fuer_alle: true, erstellt_von: 'x', erledigt_am: null, erstellt_am: '2026-11-12T08:00:00Z' },
    { id: 't4', text: 'Fremd privat', sicht: 'ich', fuer_alle: false, erstellt_von: 'x', erledigt_am: null, erstellt_am: '2026-11-12T08:00:00Z' }];
})();
""" % rolle

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for rolle in ("mechaniker", "admin"):
        ctx = br.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page(); pf = []
        pg.on("pageerror", lambda e: pf.append(str(e)[:300]))
        d = daten(rolle)
        ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + d))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            ctx.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
        pg.wait_for_selector("#nav-todo .pl-todo__eintrag", timeout=20000); pg.wait_for_timeout(800)
        # Neuer Look ohne Kopfzeile vorerst nur für Admins (seit 1.712.0)
        if rolle == "admin":
            pruefe(not pg.locator("header.kopf").is_visible(), rolle + ": keine Kopfzeile")
            for sel in (".nav__logo", "#nav-klapp2", "#nav-pad", "#nav-ich"):
                pruefe(pg.locator(sel).is_visible(), rolle + ": " + sel + " sichtbar")
        else:
            pruefe(pg.locator("header.kopf").is_visible(), rolle + ": Kopfzeile wie bisher")
            pruefe(not pg.locator(".nav__logo").is_visible(), rolle + ": kein Logo in der Leiste")
        t = pg.inner_text("#nav-todo")
        pruefe("Mein eigenes Todo" in t and "Für alle sichtbar" in t and "Fremd privat" not in t, rolle + ": eigene und für alle")
        if rolle == "admin":
            pruefe("Nur Admins" in t and "Probleme offen" in t, "admin: alles wie bisher")
        else:
            pruefe("Nur Admins" not in t and "Probleme offen" not in t and "Spindel" not in t, "mechaniker: nur Todos")
        pg.screenshot(path=BILD + f"/nav-oben-{rolle}.png")
        # ☰ zeigt das Menü, nochmals zurück zu den Todos; nie eingeklappt
        pruefe(not pg.locator(".nav__punkt").first.is_visible(), rolle + ": zuerst Todos")
        pg.click("#nav-klapp2" if rolle == "admin" else "#nav-klapp"); pg.wait_for_timeout(1800)
        pruefe(pg.locator(".nav__punkt").first.is_visible(), rolle + ": ☰ zeigt Menü")
        pruefe(not pg.evaluate("document.body.classList.contains('nav--schmal')"), rolle + ": nicht eingeklappt")
        pg.screenshot(path=BILD + f"/nav-oben-{rolle}-menue.png")
        pg.click("#nav-klapp2" if rolle == "admin" else "#nav-klapp"); pg.wait_for_timeout(1500)
        pruefe(not pg.locator(".nav__punkt").first.is_visible(), rolle + ": ☰ zurück zu Todos")
        if rolle == "mechaniker":
            pg.click("#pl-todo-neu"); pg.wait_for_selector(".dialog textarea")
            opts = pg.eval_on_selector_all(".dialog select option", "o => o.map(x => x.value)")
            pruefe(pg.eval_on_selector(".dialog select", "s => s.value") == "ich" and opts == ["ich", "alle"], "mechaniker: Vorgabe nur für mich, Wahl für alle")
            pg.keyboard.press("Escape")
        pruefe(not pf, rolle + ": keine Fehler im Browser " + str(pf))
        ctx.close()
        # Handy hochkant (seit 1.713.0): neuer Look mit eigener Kopfleiste
        ctx = br.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        pg = ctx.new_page(); pf = []
        pg.on("pageerror", lambda e: pf.append(str(e)[:300]))
        ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE + d))
        for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
            ctx.route(u, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html#/planwand", wait_until="domcontentloaded")
        pg.wait_for_selector("header.kopf", timeout=20000); pg.wait_for_timeout(1500)
        if rolle == "admin":
            pruefe(pg.locator("#kopf-todos").is_visible() and pg.locator("#kopf-pad").is_visible(), "handy admin: Todos und Pad in der Kopfleiste")
            pruefe(not pg.locator("#pad-knopf").is_visible(), "handy admin: kein Schild Pad Mode")
            pg.click("#kopf-todos"); pg.wait_for_selector("#kopf-todo-liste .pl-todo__eintrag", timeout=10000)
            pruefe("Mein eigenes Todo" in pg.inner_text("#kopf-todo-liste"), "handy admin: Todos im Blatt")
            pg.screenshot(path=BILD + "/nav-oben-handy-todos.png")
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            pruefe(pg.locator(".kopf-todos").count() == 0, "handy admin: Escape schliesst das Blatt")
        else:
            pruefe(not pg.locator("#kopf-todos").is_visible() and not pg.locator("#kopf-pad").is_visible(), "handy mechaniker: Kopfzeile wie bisher")
        pruefe(not pf, rolle + " handy: keine Fehler im Browser " + str(pf))
        ctx.close()
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
