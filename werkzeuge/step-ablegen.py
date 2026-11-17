"""STEP-Modell für HOFER2DTO3D in SQL-Stücke verpacken.

Claude kommt ohne Anmeldung nicht in die Ablage, aber über die
Datenbank-Verbindung (execute_sql). Dieses Skript packt eine STEP-Datei
mit gzip, schreibt sie als Base64 und teilt sie in Stücke unter 1 MB.
Jede ausgegebene .sql-Datei der Reihe nach ausführen; die letzte setzt
den Eintrag auf „fertig“.

  python werkzeuge/step-ablegen.py <eintrag-id> <datei.step> <ausgabeordner>
"""
import base64, gzip, os, sys

STUECK = 900_000

def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    eid, datei, ziel = sys.argv[1:]
    roh = open(datei, "rb").read()
    b64 = base64.b64encode(gzip.compress(roh, 9)).decode()
    name = os.path.basename(datei).replace("'", "''")
    os.makedirs(ziel, exist_ok=True)
    teile = [b64[i:i + STUECK] for i in range(0, len(b64), STUECK)] or [""]
    for n, t in enumerate(teile, 1):
        if n == 1:
            sql = ("insert into public.zeichnung_3d_step (id, name, groesse, inhalt_gz) values "
                   f"('{eid}', '{name}', {len(roh)}, '{t}') on conflict (id) do update set "
                   f"name = excluded.name, groesse = excluded.groesse, inhalt_gz = excluded.inhalt_gz, erstellt_am = now();")
        else:
            sql = f"update public.zeichnung_3d_step set inhalt_gz = inhalt_gz || '{t}' where id = '{eid}';"
        if n == len(teile):
            sql += (f"\nupdate public.zeichnung_3d set status = 'fertig', step_name = '{name}', step_groesse = {len(roh)}, "
                    f"step_url = null, step_pfad = null where id = '{eid}';"
                    f"\nselect length(inhalt_gz) = {len(b64)} as ok from public.zeichnung_3d_step where id = '{eid}';")
        open(os.path.join(ziel, f"teil{n:02d}.sql"), "w").write(sql)
    print(f"{len(teile)} Stück(e), {len(roh)} Bytes STEP, {len(b64)} Zeichen Base64 → {ziel}")

if __name__ == "__main__":
    main()
