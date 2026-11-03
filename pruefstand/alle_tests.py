# Alle Prüfungen nacheinander. Aufruf im Ordner pruefstand:  python alle_tests.py
import re, subprocess, sys
TESTS = ['final', 'maschinen_seite', 'spezialwerkzeuge', 'eb_je_material', 'maschinen_unterlagen', 'maschinen_notizen', 'infoboard', 'infoboard_nacht', 'empfang', 'pausenraum', 'spiele', 'spiel_kugellager', 'spiel_palette', 'hallensprint', 'eier', 'empfang_layouts', 'vorschau_zeitraum', 'vorschau_links', 'rechner', 'einkauf', 'einkauf_fenster', 'bestellungen', 'start', 'durchfahrt', 'produktion', 'pad', 'auftrag', 'suche_alles', 'ferien', 'hoco_fenster', 'typen', 'dokumente', 'farben', 'nutzer', 'pad_teile', 'betrachter_pdf', 'pdf_gross', 'pdf_suche', 'cachse', 'gravur', 'dxf', 'kontur', 'rechner_vorschub', 'bestellposition', 'einstellungen', 'anmeldung', 'ziehen3', 'kopieren', 'rueckgaengig', 'extern', 'paddash', 'escape', 'heute_backup', 'taste_h', 'bestzeit', 'acht', 'startruhe', 'padtext', 'padstart', 'padweg', 'suche_reihe', 'suche_alle_felder', 'woche_platz', 'sieben', 'zurueck2022', 'mailbilder', 'blatt_schrift', 'heute_linie', 'geburtstag', 'merken', 'geraetzurueck', 'vier2', 'ohnekamera', 'pin', 'offen', 'effekte', 'tag_platz', 'doppelklick', 'ansehen_auftrag', 'typfilter', 'bestellungen_neu', 'schieber_frei', 'menge_offen', 'excel_ansicht', 'dokpool', 'notiz_material', 'zuschnitt', 'materialplatz', 'enter_eindeutig', 'vorschau_laenge', 'auftragswechsel', 'farben_kraeftig', 'randblaettern', 'eb_ordner', 'hoco_typen', 'stueck_tag', 'schnitt_arbeitstage', 'wischen_finger', 'padfett', 'padwetter', 'padskizze_gross', 'zeichnung_hoco', 'pad_typen_raster', 'padskizze', 'auftrag_layout', 'bestellungen_namen', 'padskizze_text', 'pad_neuladen', 'sicherung', 'rueckgaengig_ueberall', 'pad_handy', 'loeschen_einmal', 'bestellmail_fenster', 'notizbuch', 'notizbuch_klein', 'notizbuch_tabelle', 'profilbilder', 'andere_nutzer', 'home_icon', 'materialausgabe', 'abruf_siegel', 'stueckzeit', 'planwand_symbole', 'balken_schrift', 'naechster_ruesten', 'andere_nie_abmelden', 'fassung_neu', 'zeichnung_entfernen', 'stuendlich_neuladen', 'wochenlinie', 'dok_entfernen', 'pad_drucken', 'kopf_oben', 'pool_drucken', 'eb_a4_drucken', 'padwetter_fenster', 'balken_hervorheben', 'eigenes_passwort', 'ferien_jeder', 'wiederherstellen', 'planwand_fluessig', 'planwand_hoehe_fest', 'abruf_mehrzeilig', 'planwand_nur_admin', 'pad_wartung', 'padskizze_eimer', 'qs_check', 'planwand_archiv', 'm_trotzdem', 'suche_alt', 'waschprog', 'zeit_pulsiert', 'suche_mitte', 'suche_escape', 'letzte_stueckzahl', 'zeitmarke_weg', 'escape_nur_fenster', 'typ_uebernehmen', 'prod_knoepfe', 'abmelden_zurueck', 'planwand_alle', 'temp_ordner', 'letzter_eintrag', 'escape_abmelden', 'anmelde_meldungen', 'pad_schoner', 'planwand_ohne_laden', 'ladebildschirm', 'betrachter_html', 'handy_menue', 'hoco_suchfeld', 'ak_vorschau', 'notizbuch_pad', 'notizbuch_maschine', 'notizbuch_pdflinks', 'notizbuch_zoom', 'material_uebersicht', 'materialfarbe_balken', 'abend_laufen', 'farbwahl_weg', 'path_reihenfolge', 'qs_meldungen', 'pad_probleme', 'problem_erledigen_alle', 'qs_park', 'planwand_rechner', 'material_im_haus', 'notizbuch_onenote', 'notizbuch_abschnitte', 'zwei_tabs_sitzung', 'zwei_geraete_auftrag', 'bestell_foto', 'nav_unter_auf', 'nav_klappen', 'statistik', 'statistik_wahl', 'startseite', 'suche_seite', 'einrichtblatt_app', 'produktion_richten', 'pad_geraet', 'einrichtblatt_vorlesen', 'heute_offen', 'datei_ablegen', 'eb_pdf', 'artikel_kopieren', 'artikel_mehr', 'artikel_hoco', 'infoboard_fassung', 'kalkulation', 'ferien_termin', 'ferien_art', 'kalender', 'infoboard_alle', 'infoboard_text_frei', 'ohne_wbg', 'eb_von_anderem', 'eb_eigenes_fenster', 'eb_platz_wechsel', 'eb_ohne_loch', 'eb_freie_bilder', 'dok_wbg_ziel', 'pad_escape', 'zeichnung_drehen', 'wbg_nur_offen', 'pad_planwand', 'artikel_aehnlich', 'bestellungen_suche', 'infoboard_web', 'infoboard_programm', 'escobar', 'betriebsferien', 'index_protokoll', 'sw_wechsel', 'kreditoren', 'vorbereiten', 'nc_geo', 'radio', 'artikel_angaben', 'bestell_termin_zeichnung', 'einlagen', 'einlagen_werkzeuge', 'bildschirme', 'auftrag_hoco_stamm', 'index_batterien', 'mailkonto', 'kontrast', 'pablo', 'lieferant_kontakte', 'visitenkarte_fotos', 'sitzung_verloren', 'systemzustand']
# Seit November 2026 laufen die Prüfungen gleichzeitig in mehreren
# Strängen, je mit eigenem Anschluss (PRUEFSTAND_PORT): nacheinander
# dauerten über 280 Prüfungen länger als die 40 Minuten auf GitHub, der
# Lauf wurde abgebrochen und jedes Mal kam eine Mail „failed“.
import os, time, queue, threading
from concurrent.futures import ThreadPoolExecutor
STRAENGE = int(os.environ.get("PRUEFSTAND_PARALLEL", "4"))
GRUND = int(os.environ.get("PRUEFSTAND_PORT", "8899"))
freie = queue.Queue()
for i in range(STRAENGE):
    freie.put(GRUND + i * 7)

def pruefen(t):
    port = freie.get()
    try:
        umg = dict(os.environ, PRUEFSTAND_PORT=str(port))
        a = time.time()
        try:
            r = subprocess.run([sys.executable, t + ".py"], capture_output=True, text=True, timeout=400, env=umg)
            text, code = r.stdout + r.stderr, r.returncode
        except subprocess.TimeoutExpired:
            text, code = "Fehler: Zeit abgelaufen (400 s)", 1
        return t, text, code, time.time() - a
    finally:
        freie.put(port)

def bewerten(text, code):
    # Auch Zeilen wie "Fehler Pad: …" zählen, nicht nur "Fehler: …"
    zeilen = [z for z in text.splitlines() if re.search(r"(?<![Kk]eine )Fehler( \w+)?:", z) or "Error" in z]
    ok = code == 0 and not any("Error" in z for z in zeilen) and all(re.search(r"Fehler( \w+)?: (keine|\[\])", z) for z in zeilen if re.search(r"(?<![Kk]eine )Fehler( \w+)?:", z))
    return ok, zeilen

# Nur einen Teil prüfen: PRUEFSTAND_NUR="einkauf,pad" oder ab einer Nummer
nur = [t for t in os.environ.get("PRUEFSTAND_NUR", "").split(",") if t]
if nur: TESTS = [t for t in TESTS if t in nur]
TESTS = TESTS[int(os.environ.get("PRUEFSTAND_AB", "0")):]

gut = 0
start = time.time()
nochmal = []
with ThreadPoolExecutor(max_workers=STRAENGE) as pool:
    for t, text, code, dauer in pool.map(pruefen, TESTS):
        ok, zeilen = bewerten(text, code)
        gut += ok
        if not ok: nochmal.append((t, zeilen))
        print(("OK    " if ok else "WIEDER") + "  " + t + "  (%ds)" % dauer + ("" if ok else "  ->  " + " | ".join(zeilen[-2:])), flush=True)
# Unter Last laufen manche Prüfungen mit festen Wartezeiten zu knapp:
# was gleichzeitig scheiterte, kommt allein ein zweites Mal dran
for t, _ in nochmal:
    t, text, code, dauer = pruefen(t)
    ok, zeilen = bewerten(text, code)
    gut += ok
    print(("OK    " if ok else "FEHLER") + "  " + t + "  (allein, %ds)" % dauer + ("" if ok else "  ->  " + " | ".join(zeilen[-2:])), flush=True)
print("\nDauer: %d Minuten" % ((time.time() - start) / 60))
print("\n%d von %d Prüfungen ohne Fehler" % (gut, len(TESTS)))
