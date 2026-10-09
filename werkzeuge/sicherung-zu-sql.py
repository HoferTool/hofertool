"""Macht aus einer Hofer-Sicherung (ZIP) SQL-Dateien zum Zurückspielen.

Für den schlimmsten Fall, wenn niemand mehr in die App kommt (Wunsch
Patrick, 9. Oktober 2026: „wenn der Fall kommt, gebe ich dir die ZIP-Datei
und du machst draus ein SQL“). Die Dateien laufen der Reihe nach im
Supabase SQL Editor oder über die Supabase-Verbindung:

  001.sql …   legen die Tabellen stückweise im Puffer ab (sicherung_puffer)
  NNN.sql     die letzte ruft sicherung_einspielen auf: ersetzt alles in
              einem Zug und legt fehlende Konten wieder an

Braucht sql/sicherung-mit-konten.sql in der Datenbank (Zurückspielen im
SQL Editor erlaubt). Dateien (WBGs, Bilder) kommen so nicht zurück, dafür
danach in der App einmal Einstellungen → Backup → Zurückspielen.

Aufruf: python sicherung-zu-sql.py Hofer-Sicherung-….zip ausgabe-ordner [kb je Datei]
"""
import json
import os
import secrets
import sys
import uuid
import zipfile


def dollar(text):
    # Ein Kennzeichen, das im Text sicher nicht vorkommt
    while True:
        tag = "$h" + secrets.token_hex(4) + "$"
        if tag not in text:
            return tag + text + tag


def main():
    zip_pfad, aus = sys.argv[1], sys.argv[2]
    grenze = int(sys.argv[3]) * 1024 if len(sys.argv) > 3 else 900 * 1024
    os.makedirs(aus, exist_ok=True)
    z = zipfile.ZipFile(zip_pfad)
    kopf = json.loads(z.read("sicherung.json"))
    if kopf.get("art") != "hofer-sicherung":
        sys.exit("Das ist keine Sicherung des Hofer Tools.")
    lauf = str(uuid.uuid4())
    dateien = []
    teile = ["delete from public.sicherung_puffer where lauf = '%s';\n" % lauf]
    groesse = 0

    def ablegen():
        nonlocal teile, groesse
        if teile:
            name = os.path.join(aus, "%03d.sql" % (len(dateien) + 1))
            with open(name, "w", encoding="utf-8") as f:
                f.write("".join(teile))
            dateien.append(name)
        teile, groesse = [], 0

    for t in kopf["tabellen"]:
        zeilen = json.loads(z.read("tabellen/" + t["t"] + ".json"))
        if len(zeilen) != t["n"]:
            sys.exit("Tabelle %s: %d statt %d Zeilen" % (t["t"], len(zeilen), t["n"]))
        stueck = []
        # Leere Tabelle: trotzdem ablegen, damit die Zählung stimmt
        gruppen = []
        laenge = 0
        for r in zeilen:
            s = json.dumps(r, ensure_ascii=False, separators=(",", ":"))
            if stueck and laenge + len(s) > grenze:
                gruppen.append(stueck)
                stueck, laenge = [], 0
            stueck.append(s)
            laenge += len(s) + 1
        gruppen.append(stueck)
        for g in gruppen:
            text = "[" + ",".join(g) + "]"
            befehl = ("insert into public.sicherung_puffer (lauf, tabelle, zeilen) values ('%s', '%s', %s::jsonb)\n"
                      "  on conflict (lauf, tabelle) do update set zeilen = public.sicherung_puffer.zeilen || excluded.zeilen, am = now();\n"
                      % (lauf, t["t"].replace("'", "''"), dollar(text)))
            if groesse and groesse + len(befehl) > grenze:
                ablegen()
            teile.append(befehl)
            groesse += len(befehl)
    ablegen()
    tabellen = json.dumps([{"t": t["t"], "n": t["n"]} for t in kopf["tabellen"]], ensure_ascii=False)
    teile = ["-- Sicherung vom %s zurückspielen\nselect public.sicherung_einspielen('%s', %s::jsonb);\n"
             % (kopf.get("erstellt", "?"), lauf, dollar(tabellen))]
    ablegen()
    konten = [t for t in kopf["tabellen"] if t["t"] == "auth.users"]
    print("Sicherung vom", kopf.get("erstellt"), "-", len(kopf["tabellen"]), "Tabellen,",
          sum(t["n"] for t in kopf["tabellen"]), "Zeilen,", (konten[0]["n"] if konten else "KEINE"), "Konten")
    print(len(dateien), "Dateien in", aus)


if __name__ == "__main__":
    main()
