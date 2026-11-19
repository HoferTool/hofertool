-- =================================================================
-- HOFERTIME: Buchungsarten (seit 1.651.0, Wunsch Patrick 19. November 2026)
--
-- Was diese Datei tut:
--  - zeit_buchungen bekommt die Spalte "art": leer = Umbuchung Ferien ↔
--    Gleitzeit wie bisher, sonst auszahlung_ueberstunden,
--    auszahlung_stunden, korrektur_gz oder korrektur_ferien. Diese bucht
--    nur der Admin von HOFERTIME (Regel "zeit buchungen admin" gibt es schon).
--  - Teil 2 (unten): die Funktion zeit_umbuchung_loeschen löscht für die
--    Person selbst nur noch Umbuchungen, keine Auszahlungen und Korrekturen.
--    Weil darin "delete" steht, im SQL Editor ausführen.
-- Gefahrlos mehrfach ausführbar.
-- =================================================================

alter table public.zeit_buchungen add column if not exists art text;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'zeit_buchungen' and column_name = 'art')
  then 'ok' else 'FEHLT' end as probe_spalte;
