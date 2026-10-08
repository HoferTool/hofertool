# Einstellungen → Backup ohne Zusatzprogramm (111.109.0): Ordner wählen,
# täglich von selbst, Jetzt sichern (eine ZIP mit allem), alte aufräumen,
# Zurückspielen aus dem Ordner und aus einer gewählten Datei. Seit 111.116.0
# bleiben Zeichnungen und Einrichtblätter draussen (die holt die Aufgabe
# „HoferTool“ aus den Ordnern), sie stehen im Kopf unter „ausgelassen“.
import time, json, base64, io, zipfile
from pruefstand import server_starten, FAKE, CH, PORT
from playwright.sync_api import sync_playwright
server_starten(); time.sleep(0.4)
fehler = []
def pruefe(name, ok):
    print(("ok   " if ok else "FALSCH ") + name)
    if not ok: fehler.append(name)

# Ein Ordner im Speicher anstelle des echten (showDirectoryPicker)
ORDNER = """
(() => {
  const dateien = new Map();
  window.ORDNER = dateien;
  const datei = (name) => ({ kind: 'file', name,
    getFile: async () => { const d = dateien.get(name); if (!d) throw new DOMException('weg', 'NotFoundError');
      return new File([d.daten], name, { lastModified: d.zeit }); },
    createWritable: async () => { const teile = [];
      return { write: async (x) => { teile.push(x instanceof Uint8Array ? x.slice() : x); },
        close: async () => { dateien.set(name, { daten: new Uint8Array(await new Blob(teile).arrayBuffer()), zeit: Date.now() }); } }; },
    move: async (neu) => { dateien.set(neu, dateien.get(name)); dateien.delete(name); },
  });
  const ordner = { kind: 'directory', name: 'Sicherung',
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getFileHandle: async (name, o) => { if (!dateien.has(name)) { if (!(o && o.create)) throw new DOMException('weg', 'NotFoundError');
      dateien.set(name, { daten: new Uint8Array(0), zeit: Date.now() }); } return datei(name); },
    removeEntry: async (name) => { dateien.delete(name); },
    entries: async function* () { for (const n of [...dateien.keys()]) yield [n, datei(n)]; },
  };
  window.showDirectoryPicker = async () => ordner;
  // Alte Sicherungen: vier von 2025, die neuesten drei bleiben trotzdem
  ['2025-01-01-1800', '2025-01-02-1800', '2025-01-03-1800', '2025-01-04-1800'].forEach((d, i) =>
    dateien.set('Hofer-Sicherung-' + d + '.zip', { daten: new Uint8Array([1, 2, 3]), zeit: Date.UTC(2025, 0, 1 + i) }));
  dateien.set('anderes.txt', { daten: new Uint8Array([1]), zeit: Date.now() });
})();
"""
K = """
TEST.ablage = { 'zeichnungen/dok/a.pdf': '%PDF-1.4 a', 'zeichnungen/dok/ü b.pdf': '%PDF-1.4 b', 'profilbilder/u1.png': 'PNG',
  'zeichnungen/dok/z1.pdf': '%PDF-1.4 z1', 'zeichnungen/dok/z2.pdf': '%PDF-1.4 z2', 'zeichnungen/dok/blatt ü.xlsx': 'XLSX',
  'zeichnungen/dok/vorlage.xlsx': 'XLSX' };
const A = 'https://lzhqwbxfwqamauntehof.supabase.co/storage/v1/object/public/zeichnungen/';
TEST.rpc.sicherung_lesen = () => [
  { t: 'jobs', nr: 2, zeilen: [{ id: 'j1', job_number: '10844-0049', plan_note: 'Notiz mit „Umlaut“ ä', drawing_url: A + 'dok/z1.pdf' }, { id: 'j2', job_number: '10007-0381' }] },
  { t: 'app_config', nr: 1, zeilen: [{ schluessel: 'x', wert: '1' }] },
  { t: 'hoco_parts', nr: 1, zeilen: [{ hoco_nr: '10007-0381', zeichnung_url: A + 'dok/z2.pdf' }] },
  { t: 'hoco_type_data', nr: 1, zeilen: [{ hoco_nr: '10007-0381', type_id: 't1', blatt_url: A + 'dok/blatt%20%C3%BC.xlsx' }] },
  { t: 'dokumente', nr: 2, zeilen: [{ id: 'd1', art: 'zeichnung', hoco_nr: '10844-0049', datei_url: A + 'dok/z1.pdf' },
    { id: 'd2', art: 'einrichtblatt', hoco_nr: null, type_id: 't1', datei_url: A + 'dok/vorlage.xlsx' }] },
  { t: 'leer', nr: 0, zeilen: [] }];
TEST.dateienJetzt = null;
TEST.rpc.sicherung_dateien = () => TEST.dateienJetzt || [
  { b: 'zeichnungen', p: 'dok/a.pdf', g: 10, a: 'application/pdf' },
  { b: 'zeichnungen', p: 'dok/ü b.pdf', g: 10, a: 'application/pdf' },
  { b: 'profilbilder', p: 'u1.png', g: 3, a: 'image/png' },
  { b: 'zeichnungen', p: 'dok/weg.pdf', g: 5, a: 'application/pdf' },
  { b: 'zeichnungen', p: 'dok/z1.pdf', g: 8, a: 'application/pdf' },
  { b: 'zeichnungen', p: 'dok/z2.pdf', g: 8, a: 'application/pdf' },
  { b: 'zeichnungen', p: 'dok/blatt ü.xlsx', g: 4, a: 'application/vnd.ms-excel' },
  { b: 'zeichnungen', p: 'dok/vorlage.xlsx', g: 4, a: 'application/vnd.ms-excel' }];
TEST.rpc.sicherung_puffern = (a) => a.p_zeilen.length;
TEST.rpc.sicherung_einspielen = (a) => ({ tabellen: a.p_tabellen.length, zeilen: 3, ohne_konto: 0 });
"""
F = FAKE.replace("if (typeof window !== \"undefined\") window.TEST = TEST;", "if (typeof window !== \"undefined\") window.TEST = TEST;\n" + K)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CH, args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = br.new_context(viewport={"width": 1440, "height": 900}).new_page()
    f = []; pg.on("pageerror", lambda e: f.append(str(e)[:200]))
    pg.add_init_script(ORDNER)
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=F))
    for u in ["**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**", "**://esm.sh/**", "**://*.supabase.co/**", "**://api.open-meteo.com/**"]:
        pg.route(u, lambda r: r.abort())
    start = time.time()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html#dashboard", wait_until="domcontentloaded")
    pg.wait_for_selector("#inhalt"); pg.wait_for_timeout(800)
    # Letzte Sicherung vor zwei Tagen, ab 0 Uhr: fällig
    pg.evaluate("""() => TEST.daten.app_config.push(
      { schluessel: 'sicherung', wert: JSON.stringify({ stunde: 0, behalten: 30 }) },
      { schluessel: 'sicherung_status', wert: JSON.stringify({ letzte: { zeit: new Date(Date.now() - 2 * 86400000).toISOString(), zeilen: 1, dateien: 1 } }) })""")
    pg.locator("#kopf-einstellungen").click(); pg.wait_for_timeout(500)
    pg.locator("[data-einst='backup']").click(); pg.wait_for_selector("#si-ordner"); pg.wait_for_timeout(300)
    pruefe("Kein Speicherort-Feld mehr", pg.locator("#si-pfad").count() == 0)
    pruefe("Noch kein Ordner", "Noch kein Ordner gewählt" in pg.inner_text("#si"))
    konten = pg.evaluate("[...document.querySelectorAll('#si-konto option')].map(o => [o.value, o.textContent])"); print("Konten:", konten)
    pruefe("Konten ohne Admin zur Wahl", len(konten) >= 2 and konten[0][1] == "nur Admins")
    pg.select_option("#si-konto", konten[1][0])
    pg.click("#si-ordner"); pg.wait_for_timeout(600)
    k = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'sicherung').wert)"); print("Einstellung:", k)
    pruefe("Dieses Gerät sichert, mit Konto", bool(k.get("geraet")) and k["geraet"]["ordner"] == "Sicherung" and k["stunde"] == 0 and k.get("konto") == konten[1][0])
    pruefe("Ordner angezeigt", "Ordner „Sicherung“ auf diesem Gerät" in pg.inner_text("#si"))

    # Täglich von selbst: der Wächter schaut 15 Sekunden nach dem Start
    pg.wait_for_function("[...window.ORDNER.keys()].some(n => n.startsWith('Hofer-Sicherung-') && !n.startsWith('Hofer-Sicherung-2025') && n.endsWith('.zip'))",
                         timeout=max(1000, int((40 - (time.time() - start)) * 1000)))
    pg.wait_for_timeout(1500)
    st = pg.evaluate("JSON.parse(TEST.daten.app_config.findLast(x => x.schluessel === 'sicherung_status').wert)")
    print("Stand:", {k: v for k, v in st.items() if k != "liste"})
    pruefe("Tägliche Sicherung gemacht", st["letzte"]["grund"] == "taeglich" and st["letzte"]["zeilen"] == 7)
    pruefe("Eine Datei nicht lesbar gezählt", st["letzte"]["fehlt"] == 1 and st["letzte"]["dateien"] == 4)
    pruefe("Zeichnungen und Einrichtblätter gezählt", st["letzte"]["ohneZeichnungen"] == 2 and st["letzte"]["ohneEinrichtblaetter"] == 1)
    namen = pg.evaluate("[...window.ORDNER.keys()].sort()"); print("Ordner:", namen)
    pruefe("Alte aufgeräumt, neueste drei bleiben", "Hofer-Sicherung-2025-01-01-1800.zip" not in namen
           and "Hofer-Sicherung-2025-01-02-1800.zip" not in namen and "Hofer-Sicherung-2025-01-04-1800.zip" in namen
           and "anderes.txt" in namen)
    pruefe("Keine halbe Datei", not any(n.endswith(".teil") for n in namen))

    # Inhalt der ZIP
    neu = [n for n in namen if n.startswith("Hofer-Sicherung-") and not n.startswith("Hofer-Sicherung-2025")][0]
    roh = base64.b64decode(pg.evaluate("n => { const d = window.ORDNER.get(n).daten; let s = ''; d.forEach(b => s += String.fromCharCode(b)); return btoa(s); }", neu))
    z = zipfile.ZipFile(io.BytesIO(roh))
    print("ZIP:", z.namelist())
    kopf = json.loads(z.read("sicherung.json"))
    pruefe("Kopf", kopf["art"] == "hofer-sicherung" and kopf["tabellen"] == [{"t": "jobs", "n": 2}, {"t": "app_config", "n": 1},
           {"t": "hoco_parts", "n": 1}, {"t": "hoco_type_data", "n": 1}, {"t": "dokumente", "n": 2}, {"t": "leer", "n": 0}])
    print("Ausgelassen:", kopf.get("ausgelassen"))
    pruefe("Zeichnungen und Einrichtblatt nicht in der ZIP", not any(n.startswith("dateien/zeichnungen/dok/z") or "blatt" in n for n in z.namelist())
           and sorted((o["p"], o["art"]) for o in kopf["ausgelassen"]) == [("dok/blatt ü.xlsx", "einrichtblatt"), ("dok/z1.pdf", "zeichnung"), ("dok/z2.pdf", "zeichnung")]
           and not any(o["p"] == "dok/z1.pdf" for o in kopf["dateien"]))
    pruefe("Vorlage des Typs bleibt drin", z.read("dateien/zeichnungen/dok/vorlage.xlsx") == b"XLSX")
    pruefe("Tabelle mit Umlauten", json.loads(z.read("tabellen/jobs.json"))[0]["plan_note"] == "Notiz mit „Umlaut“ ä")
    pruefe("Dateien drin", z.read("dateien/zeichnungen/dok/ü b.pdf") == b"%PDF-1.4 b" and z.read("dateien/profilbilder/u1.png") == b"PNG")
    pruefe("ZIP fehlerfrei", z.testzip() is None)

    # Jetzt sichern, in einer neuen Minute (neuer Name)
    pg.locator("[data-einst='allgemein']").click(); pg.wait_for_timeout(300)
    pg.locator("[data-einst='backup']").click(); pg.wait_for_selector("#si-jetzt")
    pg.wait_for_timeout(1000 * (61 - time.localtime().tm_sec))
    pg.click("#si-jetzt")
    pg.wait_for_function("document.querySelector('#si-auftrag') && document.querySelector('#si-auftrag').textContent.includes('Gesichert')", timeout=20000)
    print(pg.inner_text("#si-auftrag"))
    pruefe("Jetzt sichern meldet Datei", ".zip" in pg.inner_text("#si-auftrag") and "7 Einträge" in pg.inner_text("#si-auftrag")
           and "ohne 2 Zeichnungen und 1 Einrichtblatt" in pg.inner_text("#si-auftrag"))
    pruefe("Stand nennt Ausgelassenes", "ohne 2 Zeichnungen und 1 Einrichtblatt" in pg.inner_text("#si-stand"))
    pruefe("Text nennt die Aufgabe", "Zeichnungen und Einrichtblätter" in pg.inner_text("#si") and "HoferTool" in pg.inner_text("#si"))
    pruefe("Liste im Fenster", pg.locator("#si-liste tbody tr").count() == 3)
    pruefe("Letzte Sicherung angezeigt", "Letzte Sicherung" in pg.inner_text("#si-stand"))
    pg.screenshot(path="sicherung.png")

    # Zurückspielen aus dem Ordner: eine Rückfrage, vorher sichern, dann einspielen
    pg.evaluate("TEST.dateienJetzt = [{ b: 'zeichnungen', p: 'dok/a.pdf', g: 10 }, { b: 'zeichnungen', p: 'dok/z2.pdf', g: 8 }]")
    pg.evaluate("TEST.protokoll.length = 0")
    pg.locator("#si-liste tbody tr").first.locator(".si-zurueckknopf").click()
    pg.wait_for_selector(".dialog-huelle [data-ja]")
    frage = pg.locator(".dialog-huelle").last.inner_text(); print(frage)
    pruefe("Rückfrage nennt Stand", "Stand vom" in frage and "heutige Stand" in frage)
    pruefe("Rückfrage nennt Ausgelassenes", "Nicht in der Sicherung: 2 Zeichnungen und 1 Einrichtblatt" in frage)
    pg.click(".dialog-huelle [data-ja]")
    pg.wait_for_function("document.querySelector('#si-auftrag') && document.querySelector('#si-auftrag').textContent.includes('Zurückgespielt')", timeout=20000)
    print(pg.inner_text("#si-auftrag"))
    prot = pg.evaluate("TEST.protokoll.filter(x => x.art === 'rpc' || x.art === 'upload').map(x => x.art === 'upload' ? 'upload:' + x.ablage + '/' + x.pfad : x.name + (x.name === 'sicherung_puffern' ? ':' + x.args.p_tabelle + ':' + x.args.p_zeilen.length : ''))")
    print(prot)
    pruefe("Vorher gesichert", "sicherung_lesen" in prot and prot.index("sicherung_lesen") < prot.index("sicherung_einspielen")
           and any("vor-Zurueckspielen" in n for n in pg.evaluate("[...window.ORDNER.keys()]")))
    pruefe("Alle Tabellen gepuffert", "sicherung_puffern:jobs:2" in prot and "sicherung_puffern:app_config:1" in prot and "sicherung_puffern:leer:0" in prot)
    pruefe("Fehlende Dateien wieder hoch", "upload:zeichnungen/dok/ü b.pdf" in prot and "upload:profilbilder/u1.png" in prot
           and "upload:zeichnungen/dok/a.pdf" not in prot and "upload:zeichnungen/dok/vorlage.xlsx" in prot)
    pruefe("Zeichnungen nicht hochgeladen", not any(n in prot for n in ["upload:zeichnungen/dok/z1.pdf", "upload:zeichnungen/dok/z2.pdf", "upload:zeichnungen/dok/blatt ü.xlsx"]))
    pruefe("Meldet, was fehlt", "nicht mehr da: 1 Zeichnung und 1 Einrichtblatt" in pg.inner_text("#si-auftrag") and "Pool-Rechner" in pg.inner_text("#si-auftrag"))
    pruefe("Keine zweite Rückfrage", pg.locator(".dialog-huelle [data-ja]").count() == 0)
    pruefe("Neu-laden-Knopf", pg.locator("#si-auftrag button").count() == 1)

    # Zurückspielen aus einer gewählten Datei; eine falsche Datei wird abgelehnt
    pg.evaluate("TEST.protokoll.length = 0")
    pg.locator("#si-zurueck input[type=file]").set_input_files({"name": "quatsch.zip", "mimeType": "application/zip", "buffer": b"kein zip"})
    pg.wait_for_timeout(600)
    pruefe("Falsche Datei abgelehnt", pg.locator(".dialog-huelle [data-ja]").count() == 0
           and not pg.evaluate("TEST.protokoll.some(x => x.name === 'sicherung_einspielen')"))
    pg.locator("#si-zurueck input[type=file]").set_input_files({"name": neu, "mimeType": "application/zip", "buffer": roh})
    pg.wait_for_selector(".dialog-huelle [data-ja]"); pg.click(".dialog-huelle [data-ja]")
    pg.wait_for_function("TEST.protokoll.some(x => x.name === 'sicherung_einspielen')", timeout=20000)
    pg.wait_for_timeout(800)
    pruefe("Aus Datei zurückgespielt", "Zurückgespielt" in pg.inner_text("#si-auftrag"))

    # Handy: nichts ragt über den Rand
    pg.set_viewport_size({"width": 390, "height": 800}); pg.wait_for_timeout(500)
    breit = pg.evaluate("[...document.querySelectorAll('#si, #si-zurueck')].map(e => e.scrollWidth - e.clientWidth)")
    pruefe("Handy ohne Überlauf", all(b <= 1 for b in breit))
    pg.screenshot(path="sicherung_handy.png")
    fehler += f
    print("Fehler:", fehler if fehler else "keine")
    br.close()
