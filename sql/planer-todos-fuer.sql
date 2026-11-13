-- =================================================================
--  Planer (seit 1.521.0): Todo nur für mich oder für alle Admins
--  Neue Spalte fuer_alle an planer_todos. Bisherige Todos bleiben für
--  alle Admins sichtbar (Vorgabe true). Ein neues Todo ist zuerst „Nur
--  für mich“ (setzt die App), dann sieht es nur, wer es geschrieben hat.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.planer_todos add column if not exists fuer_alle boolean not null default true;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'planer_todos' and column_name = 'fuer_alle') then 'ok' else 'FEHLT' end as fuer_alle;
