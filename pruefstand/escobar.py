# Mahnbild („Escobar“, 1.265.0, Wunsch Patrick 29. Oktober 2026): kein
# Leuchten, solange an der Maschine gerüstet wird, und nicht am Tag, an
# dem der Auftrag auf „läuft“ ging, erst ab dem Tag danach. Gilt für die
# Kacheln im Pad und für „Heute noch offen“ auf der Startseite.
import time
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
# m-k1 läuft seit gestern (mahnt), m-l1 läuft seit heute (ruhig),
# m-k2 läuft seit gestern, daneben ein Auftrag auf Rüsten (ruhig).
K = """(() => {
  const gestern = new Date(Date.now() - 86400000).toISOString();
  daten.jobs.forEach((j) => { if (j.plan_status === "laeuft" || j.plan_status === "ruesten") j.plan_status = "geplant"; });
  const an = (mid) => daten.jobs.filter((j) => j.machine_id === mid);
  const a = an("m-k1")[0], b = an("m-l1")[0], c = an("m-k2")[0], c2 = an("m-k2")[1];
  a.plan_status = "laeuft"; a.started_at = gestern;
  b.plan_status = "laeuft"; b.started_at = new Date().toISOString();
  c.plan_status = "laeuft"; c.started_at = gestern; c2.plan_status = "ruesten";
  daten.machines.forEach((m) => { if (["m-k1", "m-l1", "m-k2"].includes(m.id)) m.type_id = "t1"; });
  daten.production_records = daten.production_records.filter((r) => !["m-k1", "m-l1", "m-k2"].includes(r.machine_id));
  window.A = a.job_number;
})();
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", K + "\nif (typeof window !== \"undefined\") window.TEST = TEST;")
fehler = []
def pruefe(was, ok):
    print(("ok   " if ok else "FALSCH ") + was)
    if not ok: fehler.append(was)
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    pg.add_init_script("window.OHNE_SITZUNG = false;")
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
    werktag = pg.evaluate("[1,2,3,4,5].includes(new Date().getDay())")
    stk = pg.evaluate("[...document.querySelectorAll('[data-heuteoffen=stk]')].map(b => b.dataset.maschine)")
    zeit = pg.evaluate("[...document.querySelectorAll('[data-heuteoffen=zeit]')].map(b => b.dataset.maschine)")
    print("Stückzahl fehlt:", stk, "Stückzeit fehlt:", zeit)
    pruefe("seit gestern: Stückzeit mahnt", "m-k1" in zeit)
    if werktag: pruefe("seit gestern: Stückzahl mahnt", "m-k1" in stk)
    pruefe("seit heute läuft: nichts", "m-l1" not in stk and "m-l1" not in zeit)
    pruefe("Rüsten an der Maschine: nichts", "m-k2" not in stk and "m-k2" not in zeit)

    # Pad der Maschine m-k1: blinkt; dann Start heute, dann Rüsten daneben
    pg.click("[data-heuteoffen=zeit][data-maschine=m-k1]"); pg.wait_for_timeout(1500)
    nervt = lambda: pg.locator("#pad .pad-karte2--nervt").count()
    pruefe("Pad seit gestern: Kacheln blinken", nervt() == (2 if werktag else 1))
    def neu():
        pg.click("#pad [data-padzurueck]"); pg.wait_for_timeout(600)
        pg.locator("#pad .pad-kachel--maschine").filter(has_text=pg.evaluate("window.A")).first.click()
        pg.wait_for_selector("#pad .pad-stk-zahl"); pg.wait_for_timeout(800)
    pg.evaluate("TEST.daten.jobs.find(j => j.job_number === window.A && j.machine_id === 'm-k1').started_at = new Date().toISOString()")
    neu()
    pruefe("Pad am ersten Tag: nichts blinkt", nervt() == 0)
    pg.evaluate("""() => { const D = TEST.daten;
      D.jobs.find(j => j.job_number === window.A && j.machine_id === 'm-k1').started_at = new Date(Date.now() - 86400000).toISOString();
      D.jobs.find(j => j.machine_id === 'm-k1' && j.plan_status === 'geplant').plan_status = 'ruesten'; }""")
    neu()
    pruefe("Pad beim Rüsten: nichts blinkt", nervt() == 0)
    fehler += f
    br.close()
print("Fehler:", "; ".join(fehler) if fehler else "keine")
