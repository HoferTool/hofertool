# Vorbereiten (seit 1.272.0, Wunsch Patrick 29. Oktober 2026): Knopf neben
# „Problem“ im Auftragsfenster öffnet eine Checkliste fürs Rüsten:
# Material (was und ob vorhanden/bestellt/nichts), ein Punkt Spannmittel,
# Werkzeuge aus dem Einrichtblatt mit T-Nr., HD und Beschreibung.
# Häkchen landen in auftrag_vorbereiten, wieder weg = Zeile weg.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FEHLT") + " " + was)
    if not ok: fehler.append(was)

def oeffnen(pg, jid):
    el = pg.locator(f".pw-balken[data-auftrag='{jid}']").first
    el.scroll_into_view_if_needed()
    el.click(); pg.wait_for_timeout(80); el.click(); pg.wait_for_timeout(900)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1600, "height": 950}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://esm.sh/**","**://*.supabase.co/**","**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate("location.hash='#planwand'")
    pg.wait_for_selector(".pw-balken"); pg.wait_for_timeout(800)

    # Ein sichtbarer offener Auftrag, seine Maschine bekommt den Typ Star SR-32J
    jid = pg.evaluate("""() => { const ids = new Set(TEST.daten.planwand.filter(j => !j.ended_at && j.plan_status !== 'fertig').map(j => j.id));
      const b = [...document.querySelectorAll('.pw-balken[data-auftrag]')].find(b => ids.has(b.dataset.auftrag)
        && b.getBoundingClientRect().width > 40); return b && b.dataset.auftrag; }""")
    pruefe("Balken gefunden", bool(jid))
    pg.evaluate("""(id) => { const D = TEST.daten; const j = D.planwand.find(x => x.id === id);
      const m = D.machines.find(x => x.id === j.machine_id); m.type_id = 't1';
      j.material_bez = '11SMnPb37 rd 018 mm h9'; j.material_menge = ''; j.created_at = '2026-10-28T08:00:00Z';
      D.articles = (D.articles || []).concat([{ id: 'a-wz1', article_number: 'MTEC 42510', name: 'Ausdrehwerkzeug', description: 'Ausdreher Bohrung ab Ø2.5' }]);
      D.einrichtblatt_app = [{ id: 'eb1', hoco_nr: j.job_number, type_id: 't1', gut_am: '2026-10-28T08:00:00Z', kopf: {}, programme: {},
        plaetze: { T1100: { taetigkeit: 'Bohren', werkzeug: '30200350', bezeichnung: 'Bohrer Ø3.50' },
                   T200: { taetigkeit: 'Drehen', hd: true, werkzeug: 'MTEC 42510', article_id: 'a-wz1', hersteller: 'Ifanger' },
                   T100: { taetigkeit: 'Abstechen', hd: true, werkzeug: 'ISC6011372' },
                   T300: {} } }];
      D.auftrag_vorbereiten = []; }""", jid)

    oeffnen(pg, jid)
    pruefe("Auftragsfenster offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("Vorbereiten-Knopf neben Problem", pg.evaluate("""() => { const p = document.querySelector('#pl-problem-eigen'), v = document.querySelector('#pl-vorbereiten');
      return !!p && !!v && p.nextElementSibling === v; }"""))
    pg.click("#pl-vorbereiten"); pg.wait_for_timeout(700)
    pruefe("Checkliste offen", pg.locator("#vorbereiten").count() == 1)
    pruefe("Auftragsfenster bleibt offen", pg.locator(".dialog--auftrag").count() == 1)
    pruefe("Material mit rd", "11SMnPb37 rd 018 mm h9" in pg.inner_text("#vorbereiten"))
    pruefe("Material: nichts", pg.locator("[data-vb-mat='nichts']").count() == 1)
    pruefe("Ein Punkt Spannmittel", pg.locator("[data-vb='spannmittel']").count() == 1)
    nrs = pg.evaluate("[...document.querySelectorAll('#vorbereiten .vb-tnr')].map(e => e.textContent)")
    pruefe("Werkzeuge der Reihe nach, leere weg: " + str(nrs), nrs == ["T100", "T200", "T1100"])
    pruefe("Beschreibung aus dem Artikel", "Ausdreher Bohrung ab Ø2.5" in pg.inner_text("#vorbereiten"))
    pruefe("Ohne Artikel keine Beschreibung, nur die Nummer", "Bohrer Ø3.50" not in pg.inner_text("#vorbereiten") and "30200350" in pg.inner_text("#vorbereiten"))
    z = pg.evaluate("[...document.querySelector(\"[data-vb='wz:T200']\").closest('li').querySelectorAll('.vb-bez > span')].map(e => e.className + ':' + e.textContent)")
    pruefe("Drei Zeilen: Lieferant, Artikel-Nr., Beschreibung " + str(z), z == ["vb-her:Ifanger", "vb-wznr:MTEC 42510HD", "vb-beschr:Ausdreher Bohrung ab Ø2.5"])
    pruefe("Zweimal HD", pg.locator("#vorbereiten .vb-hd").count() == 2)
    txt = pg.inner_text("#vorbereiten")
    pruefe("Kein Fortschritt, keine Länge, keine Hinweise", not any(w in txt for w in ["erledigt", "Länge", "Hinweise", "Bereit"]))

    pg.click("[data-vb='wz:T200']"); pg.wait_for_timeout(400)
    rows = pg.evaluate(f"TEST.daten.auftrag_vorbereiten.filter(r => r.job_id === '{jid}').map(r => r.punkt)")
    pruefe("Häkchen gespeichert", rows == ["wz:T200"])
    pruefe("Häkchen sichtbar", pg.locator("[data-vb='wz:T200'][aria-pressed='true']").count() == 1)
    pg.locator("#vorbereiten .vb-punkt").filter(has_text="Spannmittel").locator(".vb-text").click(); pg.wait_for_timeout(400)
    pg.screenshot(path="/tmp/vorbereiten_pc.png")
    pg.click("[data-vb='wz:T200']"); pg.wait_for_timeout(400)
    rows = pg.evaluate(f"TEST.daten.auftrag_vorbereiten.filter(r => r.job_id === '{jid}').map(r => r.punkt)")
    pruefe("Häkchen weg = Zeile weg, Spannmittel bleibt", rows == ["spannmittel"])

    # Escape schliesst nur die Checkliste
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pruefe("Escape schliesst Checkliste", pg.locator("#vorbereiten").count() == 0)
    pruefe("Auftragsfenster noch da", pg.locator(".dialog--auftrag").count() == 1)

    # Neu geöffnet: das Häkchen von vorher ist wieder da; Material bestellt
    pg.evaluate(f"""() => {{ const j = TEST.daten.planwand.find(x => x.id === '{jid}'); j.material_menge = '500 kg Steeltec 2026008158'; }}""")
    pg.click("#pl-vorbereiten"); pg.wait_for_timeout(700)
    pruefe("Häkchen Spannmittel geladen", pg.locator("[data-vb='spannmittel'][aria-pressed='true']").count() == 1)
    pruefe("Material: bestellt", pg.locator("[data-vb-mat='bestellt']").count() == 1)

    # Am Handy
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(400)
    pruefe("Am Handy nicht breiter als der Bildschirm", pg.evaluate("document.querySelector('#vorbereiten').getBoundingClientRect().width <= 390"))
    pg.screenshot(path="/tmp/vorbereiten_handy.png")
    br.close()
print("Fehler:", "keine" if not fehler else fehler[:12])
