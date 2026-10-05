# Materialplatz als eigenes Feld im Auftragsfenster (111.41.0).
# Ohne SQL steht er wie bisher als Zeile "Material: …" in der Notiz,
# mit der Spalte material_platz dort und nicht mehr in der Notiz.
# Ein Langdreher ohne Planrecht darf ihn ebenfalls ändern.
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
LANG = FAKE.replace(ROLLE, '''role: "langdreher", is_active: true, geburtstag: null, bild_url: null, parks: [],
      darf_bearbeiten: false,''')

def lauf(br, fake, spalte, titel):
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=fake))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    if spalte:
        # So sieht die Datenbank aus, nachdem sql/materialplatz.sql lief
        pg.add_init_script("""(() => { const t = setInterval(() => { if (window.TEST && TEST.daten) {
          TEST.daten.planwand.forEach(j => { if (!('material_platz' in j)) j.material_platz = null; });
          clearInterval(t); } }, 5); })();""")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)
    jid = pg.evaluate("""() => { const ids = new Set(TEST.daten.planwand.filter(j => !j.ended_at && j.plan_status !== 'fertig').map(j => j.id));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 40); return b && b.dataset.auftrag; }""")
    pruefe(titel + ": Balken gefunden", bool(jid))
    if spalte:
        pg.evaluate("(id) => { const j = TEST.daten.planwand.find(x => x.id === id); j.plan_note = 'Spannzange prüfen'; }", jid)
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
    pruefe(titel + ": Fenster offen", pg.locator(".dialog--auftrag").count() == 1)
    lab = pg.locator("#pl-ortfeld > span").first.inner_text() if pg.locator("#pl-ortfeld").count() else ""
    pruefe(titel + ": Feld heisst Materialplatz", lab.strip() == "Materialplatz")
    pg.fill("#pl-matort", "Regal 4 oben")
    if titel.startswith("admin"): pg.screenshot(path="/tmp/materialplatz.png")
    pg.click("#pl-ja"); pg.wait_for_timeout(1300)
    j = pg.evaluate("(id) => JSON.parse(JSON.stringify(TEST.daten.planwand.find(x => x.id === id)))", jid)
    note = j.get("plan_note") or ""
    if spalte:
        pruefe(titel + ": in Spalte gespeichert", j.get("material_platz") == "Regal 4 oben")
        pruefe(titel + ": Notiz ohne Materialzeile", "Material:" not in note)
        pruefe(titel + ": Notiz bleibt", "Spannzange prüfen" in note)
    else:
        pruefe(titel + ": in Notiz gespeichert", "Material: Regal 4 oben" in note)
    # Wieder öffnen zeigt den Platz
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(600)
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)
    pruefe(titel + ": wieder geöffnet zeigt Platz", pg.input_value("#pl-matort") == "Regal 4 oben")
    pruefe(titel + ": Notizfeld ohne Materialzeile", "Material:" not in pg.input_value("#pl-notiz"))
    # Nochmals speichern darf die Zeile nicht verdoppeln
    pg.click("#pl-ja"); pg.wait_for_timeout(1300)
    note = pg.evaluate("(id) => TEST.daten.planwand.find(x => x.id === id).plan_note || ''", jid)
    pruefe(titel + ": höchstens eine Materialzeile", note.count("Material:") <= (0 if spalte else 1))
    pg.close()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    lauf(br, FAKE, False, "admin ohne SQL")
    lauf(br, FAKE, True, "admin mit SQL")
    lauf(br, LANG, True, "langdreher mit SQL")
    lauf(br, LANG, False, "langdreher ohne SQL")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
