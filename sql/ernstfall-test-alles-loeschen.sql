-- =================================================================
--  ERNSTFALL-TEST: WIRKLICH ALLES LÖSCHEN, AUCH DIE NUTZER
--
--  ACHTUNG: Das löscht wirklich. Es gibt kein Rückgängig. Danach kommt
--  niemand mehr in die App, auch kein Admin.
--
--  Wunsch Patrick, 9. Oktober 2026: „das Schlimmste wäre, wenn alles weg
--  wäre, heisst auch Nutzer; es soll möglich sein, per SQL es zu machen“.
--
--  Was gelöscht wird:
--    - jede Tabelle der App (Planwand, Aufträge, HOCO Nummern,
--      Stückzahlen, Bestellungen, Einkauf, Notizen, Notizbücher, Ferien,
--      Materialausgabe, Solarwerte, Einstellungen, Personen …)
--    - alle Nutzerkonten mit Passwort und PIN, auch alle Anmeldungen
--
--  Was stehen bleibt:
--    - der Aufbau der Datenbank (Tabellen, Regeln, Funktionen)
--    - der Solar-Schlüssel (ist nicht in der Sicherung)
--    - die Dateien in der Ablage (WBGs, Bilder, Zeichnungen,
--      Einrichtblätter): Supabase lässt Dateien nicht per SQL löschen
--
--  Zurück kommt alles nur aus der Sicherung (ZIP-Datei), und zwar per
--  SQL: Claude macht aus der ZIP-Datei das SQL und spielt es ein. Die
--  Sicherung muss dafür mit sql/sicherung-mit-konten.sql gemacht sein
--  (ab 9. Oktober 2026), sonst fehlen danach die Nutzer.
-- =================================================================

begin;

-- Alle Tabellen der App leeren
do $$
declare liste text;
begin
  select string_agg(format('public.%I', t), ', ')
    into liste
  from unnest(public.sicherung_tabellenliste()) t;
  execute 'truncate table ' || liste;
end $$;

-- Alle Konten weg (nimmt Anmeldungen, Identitäten und PINs mit)
delete from auth.users;

commit;

-- Probe: zeigt je Tabelle, wie viele Zeilen noch da sind.
-- Erwartet: überall 0 und „ok, leer“.
select tabelle, zeilen,
       case when zeilen = 0 then 'ok, leer' else 'FEHLT, nicht leer' end as probe
from (
  select t as tabelle,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', t), false, true, '')))[1]::text::bigint as zeilen
  from unnest(public.sicherung_tabellenliste()) t
  union all select 'Nutzerkonten', (select count(*) from auth.users)
  union all select 'PINs', (select count(*) from public.pin_schutz)
) z
order by (zeilen > 0) desc, tabelle;
