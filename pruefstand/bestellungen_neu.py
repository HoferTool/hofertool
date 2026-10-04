# Bestellungen neu gestaltet (111.27.0): Übersicht oben, Chips für Ziel
# und Frist, Statuspille öffnet das Statusfenster, runde Knöpfe mit
# Beschriftung für Vorleser, Historie nach Monat, Handy ohne seitliches
# Rollen, und wer nur lesen darf, sieht keine Knöpfe.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []

DATEN = """
const d = TEST.daten;
const t = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
d.order_items.push(
 { id: "o2", article_id: "a1", supplier_id: "s1", quantity: 20, status: "offen", needed_by: t(-2),
   note: "dringend", ziel_art: "maschine", ziel_text: "Star SR31 L-1001", created_by: "u1",
   created_at: "2026-09-28T08:00:00Z" },
 { id: "o3", article_id: "a1", supplier_id: "s1", quantity: 40, status: "teilweise_geliefert",
   geliefert_menge: 10, needed_by: null, note: null, ziel_art: "lager", ziel_text: "Lager",
   created_by: "u1", created_at: "2026-09-20T08:00:00Z" },
 { id: "o4", article_id: "a1", supplier_id: "s1", quantity: 5, status: "geliefert",
   needed_by: null, note: null, ziel_art: "lager", ziel_text: "Lager", created_by: "u1",
   created_at: "2026-08-01T08:00:00Z", delivered_at: "2026-08-12T10:00:00Z" });
"""

def seite(p, breite, nurlesen=False):
    fake = FAKE.replace('role: "admin"', 'role: "mitarbeiter"', 1) if nurlesen else FAKE
    pg = p.new_context(viewport={"width": breite, "height": 900}).new_page()
    pg.on("pageerror", lambda e: fehler.append("SEITENFEHLER: " + str(e)[:160]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200,
        content_type="application/javascript", body=fake))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**",
              "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.evaluate(DATEN)
    pg.evaluate("location.hash='#bestellungen'"); pg.wait_for_selector("#best-inhalt .bs-pos")
    pg.wait_for_timeout(300)
    return pg

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = seite(br, 1400)

    # Übersicht: 2 offene Positionen, 1 überfällig
    werte = pg.locator(".bs-uebersicht .bs-wert").all_inner_texts()
    if not werte or not werte[0].startswith("2"): fehler.append("Übersicht Positionen: %s" % werte)
    if not pg.locator(".bs-wert--spaet").count(): fehler.append("Überfällig fehlt in der Übersicht")
    if pg.locator(".bs-pos--spaet").count() != 1: fehler.append("Überfällige Zeile nicht markiert")
    if "überfällig seit" not in pg.inner_text(".bs-pos--spaet"): fehler.append("Frist-Chip fehlt")
    if "Star SR31" not in pg.inner_text(".bs-chip--ziel >> nth=0") and \
       "Star SR31" not in pg.inner_text("#best-inhalt"): fehler.append("Ziel-Chip fehlt")

    # Knöpfe ohne Text haben eine Beschriftung
    ohne = pg.evaluate("[...document.querySelectorAll('.bs-symbolknopf')].filter(b => !b.getAttribute('aria-label')).length")
    if ohne: fehler.append("%d Knöpfe ohne Beschriftung" % ohne)

    # Statuspille öffnet das Statusfenster
    pg.click("[data-bstatus='o2']"); pg.wait_for_selector(".dialog-huelle [data-neu]")
    if "Status ändern" not in pg.inner_text(".dialog-huelle"): fehler.append("Statusfenster falsch")
    pg.click(".dialog-huelle [data-nein]")

    # Bestellt: Teillieferung mit Balken
    pg.click("[data-best='bestellt']"); pg.wait_for_timeout(500)
    b = pg.evaluate("(document.querySelector('.bs-teil__balken i')||{style:{}}).style.width")
    if b != "25%": fehler.append("Teillieferung-Balken: %r" % b)

    # Historie: nach Monat gruppiert
    pg.click("[data-best='historie']"); pg.wait_for_timeout(500)
    if "August 2026" not in pg.inner_text("#best-inhalt"): fehler.append("Monat fehlt in der Historie")

    # Artikel: Filter nach Lieferant als Auswahlliste
    pg.evaluate("""TEST.daten.articles.push({ id: "a9", article_number: "BR-77", name: "Bohrer",
      unit: "Stück", description: null, supplier_id: "s2", is_active: true })""")
    pg.click("[data-best='artikel']"); pg.wait_for_timeout(600)
    if pg.locator("#ar-lief option").count() < 3: fehler.append("Lieferanten fehlen in der Auswahl")
    alle = pg.locator("[data-arbearb]").count()
    pg.select_option("#ar-lief", "Brütsch Rüegger"); pg.wait_for_timeout(600)
    n = pg.locator("[data-arbearb]").count()
    if not (n == 1 and pg.locator("[data-arbearb='a9']").count() == 1):
        fehler.append("Lieferantenfilter: %d von %d" % (n, alle))
    pg.select_option("#ar-lief", ""); pg.wait_for_timeout(600)
    if pg.locator("[data-arbearb]").count() != alle: fehler.append("Filter zurück wirkt nicht")

    # Suche über die Lupe-Leiste filtert sofort
    pg.click("[data-best='offen']"); pg.wait_for_timeout(400)
    pg.fill("#bo-suche", "dringend"); pg.wait_for_timeout(200)
    if pg.locator(".bs-pos").count() != 1: fehler.append("Suche nach Notiz: %d" % pg.locator(".bs-pos").count())
    pg.fill("#bo-suche", "")
    pg.context.close()

    # Handy: nichts ragt seitlich hinaus
    pg = seite(br, 390)
    for r in ["offen", "bestellt", "historie", "artikel", "bezeichnungen", "lieferanten"]:
        pg.click(f"[data-best='{r}']"); pg.wait_for_timeout(450)
        breit = pg.evaluate("document.documentElement.scrollWidth")
        if breit > 392: fehler.append("Handy %s zu breit: %d" % (r, breit))
    pg.context.close()

    # Nur lesen: keine Knöpfe, Status als ruhige Pille
    pg = seite(br, 1400, nurlesen=True)
    for sel in ["#b-neu", "[data-bstatus]", "[data-bweg]", "[data-sammelstatus]", ".bs-symbolknopf"]:
        if pg.locator(sel).count(): fehler.append("Nur lesen zeigt " + sel)
    if not pg.locator("span.bs-status").count(): fehler.append("Status fehlt beim Lesen")
    pg.context.close()
    br.close()
print("Bestellungen neu | Fehler: " + ("keine" if not fehler else " | ".join(fehler)))
