-- =================================================================
--  Push-Mitteilungen ganz entfernen (Wunsch Patrick, 16. Oktober 2026:
--  „Push Nachrichten aus der App nehmen, ganz löschen“)
--
--  Seit 1.83.0 kennt die App keine Push-Mitteilungen mehr. Diese Datei
--  löscht, was in der Datenbank dafür angelegt war: die Geräte-Abos
--  (push_abos), die Historie der Nachrichten (push_nachrichten), den
--  Absender-Schlüssel (push_schluessel) und die drei Funktionen.
--  Ältere Sicherungen mit diesen Tabellen lassen sich weiter
--  zurückspielen, die Tabellen werden dabei einfach übersprungen.
--
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

drop function if exists public.push_abo_setzen(text, text, text, text);
drop function if exists public.push_abo_entfernen(text);
drop function if exists public.push_geraete_zahl();
drop table if exists public.push_abos;
drop table if exists public.push_nachrichten;
drop table if exists public.push_schluessel;

notify pgrst, 'reload schema';

-- Probe: zeigt ok, wenn nichts mehr da ist
select case when not exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name like 'push\_%')
  and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'push\_%')
  then 'ok' else 'FEHLT' end as push_weg;
