-- =================================================================
--  DRUCKEN AUF A4 ÜBER DEN POOL-RECHNER
--  Neben der WBG (Drucker mit dem speziellen Papier) druckt der
--  Pool-Rechner auf Wunsch auch alles andere normal auf A4 (Wunsch
--  Patrick 30. Oktober 2026). Die neue Spalte a4 sagt drucken.ps1,
--  dass es A4 und das Papierfach „automatisch“ nehmen soll.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.druckauftraege add column if not exists a4 boolean not null default false;

notify pgrst, 'reload schema';

-- Probe: zeigt ok oder FEHLT
select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'druckauftraege' and column_name = 'a4')
  then 'ok' else 'FEHLT' end as probe;
