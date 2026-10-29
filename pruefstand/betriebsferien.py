# Betriebsferien: KW 52 und 53 fehlen auf der Planwand, Aufträge laufen
# darüber hinweg; Einstellung unter Allgemein ändert die Wochen
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

def tage(pg):
    return pg.evaluate("""[...new Set([...document.querySelectorAll('[data-zelle]')]
        .map(z => z.dataset.zelle.split('|')[1]))].sort()""")

# Zellen unter Anfang und Ende jedes Balkens gegen die Auftragsdaten
BALKEN_JS = """() => {
  const aus = [];
  document.querySelectorAll('.pw-balken[data-auftrag]').forEach(b => {
    const j = TEST.daten.planwand.find(x => String(x.id) === b.dataset.auftrag);
    if (!j) return;
    const r = b.getBoundingClientRect();
    const zeile = b.closest('[data-mzeile]');
    const zellen = [...zeile.querySelectorAll('[data-zelle]')];
    const unter = (x) => { const z = zellen.find(z => { const q = z.getBoundingClientRect(); return x >= q.left && x < q.right; }); return z ? z.dataset.zelle.split('|')[1] : null; };
    aus.push({ id: j.id, von: j.planned_from, tage: j.planned_days, a: unter(r.left + 3), e: unter(r.right - 3) });
  });
  return aus;
}"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.clock.set_fixed_time("2026-12-14T10:00:00+01:00")
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=FAKE))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    t = tage(pg)
    print("Tage:", t[0], "…", t[-1], len(t))
    frei = [x for x in t if "2026-12-21" <= x <= "2027-01-03"]
    pruefe("KW 52/53 fehlen: " + str(frei), not frei)
    pruefe("Fr 18.12. und Mo 4.1. da", "2026-12-18" in t and "2027-01-04" in t)
    kw = pg.evaluate("[...document.querySelectorAll('.pw-kw, [class*=kw]')].map(e => e.textContent.trim()).filter(x => /52|53/.test(x))")
    pruefe("kein Kopf KW 52/53: " + str(kw[:3]), not kw)

    balken = pg.evaluate(BALKEN_JS)
    ueber = [b for b in balken if b["a"] and b["e"] and b["a"] <= "2026-12-18" and b["e"] >= "2027-01-04"]
    print("über die Ferien:", ueber[:3])
    pruefe("mindestens ein Balken läuft über die Ferien", len(ueber) >= 1)
    # Arbeitstage von a bis e zählen (Mo–Fr ohne KW 52/53) = Dauer
    def zaehlen(a, e):
        import datetime as dt
        d = dt.date.fromisoformat(a); end = dt.date.fromisoformat(e); n = 0
        while d <= end:
            if d.weekday() < 5 and d.isocalendar()[1] not in (52, 53): n += 1
            d += dt.timedelta(days=1)
        return n
    falsch = [b for b in ueber if b["a"] == b["von"] and zaehlen(b["a"], b["e"]) != b["tage"]]
    pruefe("Dauer zählt die Ferien nicht: " + str(falsch[:2]), not falsch)

    # Einstellung: nur KW 52
    pg.evaluate("TEST.daten.app_config = TEST.daten.app_config || []")
    pg.locator("[title='Einstellungen'], #einstellungen-knopf, button:has-text('Einstellungen')").first.click()
    pg.wait_for_selector("#betriebsferien-kw")
    pruefe("Feld zeigt 52, 53", pg.input_value("#betriebsferien-kw") == "52, 53")
    pg.fill("#betriebsferien-kw", "52")
    pg.locator("#betriebsferien-speichern").click(); pg.wait_for_timeout(600)
    gesp = pg.evaluate("(TEST.daten.app_config || []).find(z => z.schluessel === 'betriebsferien_kw')")
    pruefe("gespeichert: " + str(gesp), gesp and gesp["wert"] == [52])
    pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#planwand", wait_until="domcontentloaded")
    pg.wait_for_selector(".pw-tafel"); pg.wait_for_timeout(1500)
    pg.screenshot(path="/tmp/claude-0/-home-user-hofertool/ec11d1c4-001a-56b5-87c3-e734e125ad33/scratchpad/bf.png")
    t = tage(pg)
    pruefe("Seitenfehler: " + str(f[:2]), not f)
    br.close()
print("Fehler:", ", ".join(fehler) if fehler else "keine")
