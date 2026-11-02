# Häkchen „Notiz bearbeiten“ (1.333.0, Wunsch Patrick 2. November 2026:
# „Tristan darf das bearbeiten“): wer es hat, ändert im Auftragsfenster
# die Notiz für die Maschine, den Materialplatz aber nicht.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

ROLLE = '''role: "admin", is_active: true, geburtstag: null, bild_url: null, parks: [],
      darf_bearbeiten: true,'''
assert ROLLE in FAKE
MIT = FAKE.replace(ROLLE, '''role: "langdreher", is_active: true, geburtstag: null, bild_url: null, parks: [],
      darf_bearbeiten: false, darf_notiz: true,''')

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH)
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MIT))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("""(() => { const t = setInterval(() => { if (window.TEST && TEST.daten) {
      TEST.daten.planwand.forEach(j => { j.material_platz = 'Regal 1'; j.plan_note = 'alt'; });
      clearInterval(t); } }, 5); })();""")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate("""() => { const ids = new Set(TEST.daten.planwand.filter(j => !j.ended_at && j.plan_status !== 'fertig').map(j => j.id));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 40); return b && b.dataset.auftrag; }""")
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
    pruefe("Fenster offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("Notiz bearbeitbar", not pg.evaluate("document.querySelector('#pl-notiz').readOnly"))
    pruefe("Materialplatz gesperrt", pg.evaluate("document.querySelector('#pl-matort').readOnly"))
    pg.fill("#pl-notiz", "KW45 2500 Stk.")
    pg.evaluate("""() => { const e = document.querySelector('#pl-matort');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, 'Anderswo');
      e.dispatchEvent(new Event('input', { bubbles: true })); }""")
    pg.click("#pl-ja"); pg.wait_for_timeout(1300)
    j = pg.evaluate("(id) => JSON.parse(JSON.stringify(TEST.daten.planwand.find(x => x.id === id)))", jid)
    pruefe("Notiz gespeichert", "KW45 2500 Stk." in (j.get("plan_note") or ""))
    pruefe("Platz unverändert", j.get("material_platz") == "Regal 1")
    br.close()
print("Fehler: " + (", ".join(fehler) if fehler else "keine"))
