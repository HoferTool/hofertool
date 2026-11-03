-- =================================================================
--  Sicherung: mehr Zeit zum Lesen (3. November 2026)
-- =================================================================
--  Die tägliche Sicherung liest alle Tabellen auf einmal
--  (sicherung_lesen). Das dauert inzwischen 9 bis 20 Sekunden, die
--  Datenbank bricht für angemeldete Personen aber nach 8 Sekunden ab.
--  Seit dem 29. Oktober 2026 kam darum jede Stunde „canceling
--  statement due to statement timeout“, und es gab keine neue Sicherung.
--
--  Diese Datei gibt nur dieser einen Funktion 5 Minuten Zeit. Alles
--  andere bleibt bei 8 Sekunden. Gefahrlos mehrfach ausführbar.
-- =================================================================

alter function public.sicherung_lesen() set statement_timeout = '300s';
alter function public.sicherung_dateien() set statement_timeout = '300s';

notify pgrst, 'reload schema';

select 'Sicherung mit 5 Minuten Zeit' as probe,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'sicherung_lesen'
                            and 'statement_timeout=300s' = any(p.proconfig))
            then 'ok' else 'FEHLT' end as stand;
