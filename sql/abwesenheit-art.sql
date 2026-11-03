-- =================================================================
--  Art der Abwesenheit bei den Ferien (1.373.0, Wunsch Patrick
--  3. November 2026: „Ferien, Kompensieren, Militär/Zivilschutz und
--  Feuerwehr“).
--  Legt die Spalte vacations.abwesenheit an. Alle bisherigen Einträge
--  gelten als Ferien. Erlaubt sind nur die vier Arten.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.vacations add column if not exists abwesenheit text not null default 'ferien';
update public.vacations set abwesenheit = 'ferien' where abwesenheit is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vacations_abwesenheit_check') then
    alter table public.vacations add constraint vacations_abwesenheit_check
      check (abwesenheit in ('ferien', 'kompensieren', 'militaer', 'feuerwehr'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'vacations' and column_name = 'abwesenheit')
  then 'ok' else 'FEHLT' end as abwesenheit;
